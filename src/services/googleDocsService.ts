import firebaseConfig from '../../firebase-applet-config.json';
import { Question } from '../types';
import { formatAnswerDisplay } from '../utils/categoryHelper';
import { extractGoogleDriveFileId } from '../utils/imageHelper';

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: any }) => void;
            error_callback?: (err: any) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file'
].join(' ');

let cachedToken: string | null = null;
let tokenExpiryTime = 0;

/**
 * Request an access token using Google Identity Services (GSI)
 */
export async function getGoogleAccessToken(promptConsent: boolean = false): Promise<string> {
  const clientId = firebaseConfig.oAuthClientId;
  if (!clientId) {
    throw new Error('OAuthクライアントIDが見つかりません。');
  }

  // If token is still valid (cached for at least 5 more minutes), reuse it
  if (!promptConsent && cachedToken && Date.now() < tokenExpiryTime - 300000) {
    return cachedToken;
  }

  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google認証ライブラリ (GSI) の読み込みに失敗しました。ページを再読み込みしてください。'));
      return;
    }

    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: REQUIRED_SCOPES,
        callback: (tokenResponse) => {
          if (tokenResponse.error) {
            reject(new Error(`Google認証エラー: ${tokenResponse.error}`));
            return;
          }
          if (tokenResponse.access_token) {
            cachedToken = tokenResponse.access_token;
            tokenExpiryTime = Date.now() + 3600 * 1000;
            resolve(tokenResponse.access_token);
          } else {
            reject(new Error('アクセストークンの取得に失敗しました。'));
          }
        },
        error_callback: (err) => {
          reject(new Error(`認証プロセスが中断されました: ${err?.message || err}`));
        }
      });

      tokenClient.requestAccessToken({ prompt: promptConsent ? 'consent' : '' });
    } catch (err: any) {
      reject(new Error(`Google認証クライアントの初期化エラー: ${err?.message || err}`));
    }
  });
}

/**
 * Helper to upload a base64 Data URL or public fetchable image into user's Google Drive
 * and share it publicly so Google Docs API can fetch and embed it into the document.
 */
async function uploadImageToDriveAndGetUrl(
  accessToken: string,
  rawImageUrl: string,
  fileName: string
): Promise<{ uri: string; driveFileId?: string } | null> {
  try {
    let blob: Blob | null = null;

    if (rawImageUrl.startsWith('data:image/')) {
      // Parse base64
      const mimeMatch = rawImageUrl.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,(.+)$/);
      if (mimeMatch) {
        const mimeType = mimeMatch[1];
        const base64Data = mimeMatch[2];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: mimeType });
      }
    } else {
      // If it's a Drive file already, check if we can make it publicly readable to embed
      const existingDriveId = extractGoogleDriveFileId(rawImageUrl);
      if (existingDriveId) {
        // Try setting permission to anyone with link (reader) so Docs can fetch it
        try {
          await fetch(`https://www.googleapis.com/drive/v3/files/${existingDriveId}/permissions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              role: 'reader',
              type: 'anyone'
            })
          });
          return {
            uri: `https://drive.google.com/uc?export=download&id=${existingDriveId}`,
            driveFileId: existingDriveId
          };
        } catch (e) {
          console.warn('Drive permission update warning:', e);
        }
      }

      // External web URL (try fetching as blob to re-upload to drive or use direct URL)
      try {
        const fetchRes = await fetch(rawImageUrl);
        if (fetchRes.ok) {
          blob = await fetchRes.blob();
        }
      } catch {
        // If CORS blocks direct fetch, and it is a normal HTTPS public image, return direct URL
        if (rawImageUrl.startsWith('http')) {
          return { uri: rawImageUrl };
        }
      }
    }

    if (!blob) {
      return null;
    }

    // 1. Upload Blob to Google Drive via multipart upload
    const metadata = {
      name: `OT_Exam_${fileName}_${Date.now()}.png`,
      mimeType: blob.type || 'image/png'
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;

    const metadataPart = delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${metadata.mimeType}\r\n\r\n`;

    const metadataBuffer = new TextEncoder().encode(metadataPart);
    const closeBuffer = new TextEncoder().encode(closeDelim);
    const imageBuffer = new Uint8Array(await blob.arrayBuffer());

    const combined = new Uint8Array(metadataBuffer.byteLength + imageBuffer.byteLength + closeBuffer.byteLength);
    combined.set(metadataBuffer, 0);
    combined.set(imageBuffer, metadataBuffer.byteLength);
    combined.set(closeBuffer, metadataBuffer.byteLength + imageBuffer.byteLength);

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: combined
    });

    if (!uploadRes.ok) {
      console.warn('Image upload to Drive failed:', uploadRes.statusText);
      return null;
    }

    const driveFileData = await uploadRes.json();
    const driveFileId = driveFileData.id;

    // 2. Set file permission to 'anyone with the link can view' so Google Docs server can fetch it
    await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });

    return {
      uri: `https://drive.google.com/uc?export=download&id=${driveFileId}`,
      driveFileId
    };
  } catch (err) {
    console.error('Failed to prepare image for Google Docs:', err);
    return null;
  }
}

export interface GoogleDocExportOptions {
  title: string;
  subtitle?: string;
  questions: Question[];
  includeAnswersAndExplanations?: boolean;
  separateAnswerKeyAtEnd?: boolean; // If true, questions first, then answer key page at bottom
  includeStudentHeader?: boolean; // Name, Student ID, Date line for printouts
  embedImages?: boolean; // If true, embed images directly into the Google Doc
}

/**
 * Creates a Google Document with the given questions and options.
 * Automatically embeds diagram images into the document if embedImages is true.
 * Returns the created document URL and ID.
 */
export async function exportQuestionsToGoogleDoc(
  options: GoogleDocExportOptions,
  onProgress?: (msg: string) => void
): Promise<{ docId: string; docUrl: string }> {
  const {
    title,
    subtitle = '作業療法士 国家試験 演習問題',
    questions,
    includeAnswersAndExplanations = true,
    separateAnswerKeyAtEnd = true,
    includeStudentHeader = true,
    embedImages = true
  } = options;

  if (questions.length === 0) {
    throw new Error('出力対象の問題が選択されていません。');
  }

  onProgress?.('Googleアカウントの認証を確認中...');
  const accessToken = await getGoogleAccessToken();

  // 1. Process image URLs if enabled
  const imageQuestions = questions.filter(q => Boolean(q.imageUrl));
  const questionImageUris: Record<string, string> = {};

  if (embedImages && imageQuestions.length > 0) {
    onProgress?.(`画像問題（全${imageQuestions.length}件）の図・写真をGoogleドキュメント用に最適化中...`);
    for (let i = 0; i < imageQuestions.length; i++) {
      const q = imageQuestions[i];
      onProgress?.(`画像処理中 (${i + 1}/${imageQuestions.length}): [${q.id}]...`);
      const imgRes = await uploadImageToDriveAndGetUrl(accessToken, q.imageUrl!, q.id);
      if (imgRes?.uri) {
        questionImageUris[q.id] = imgRes.uri;
      }
    }
  }

  onProgress?.('Googleドキュメントを新規作成中...');
  // 2. Create document via Google Docs REST API
  const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: `${title} (${new Date().toLocaleDateString('ja-JP')})`
    })
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    console.error('Docs creation error:', errText);
    throw new Error(`Googleドキュメントの作成に失敗しました: ${createRes.status} ${createRes.statusText}`);
  }

  const docData = await createRes.json();
  const docId = docData.documentId;
  const docUrl = `https://docs.google.com/document/d/${docId}/edit`;

  onProgress?.('問題文と解答レイアウトを整形中...');

  // 3. Build document text with structured image placeholders
  let text = '';
  text += `【${title}】\n`;
  text += `${subtitle}\n`;
  text += `作成日: ${new Date().toLocaleDateString('ja-JP')}　問題数: 全${questions.length}問\n`;

  if (includeStudentHeader) {
    text += `\n［ 学籍番号: ＿＿＿＿＿＿＿＿＿＿ ］　［ 学年: ＿＿年 ］　［ 氏名: ＿＿＿＿＿＿＿＿＿＿＿＿ ］　［ 得点: ＿＿ / ${questions.length} ］\n`;
  }

  text += `\n` + '―'.repeat(45) + `\n\n`;

  // Problem list
  questions.forEach((q, index) => {
    const num = index + 1;
    const catStr = q.majorCategory || q.category || '';
    const subStr = q.subCategory ? ` / ${q.subCategory}` : '';
    const yrStr = q.year ? ` (第${q.year}回)` : '';

    text += `第${num}問  [${q.id}] ${catStr}${subStr}${yrStr}\n`;
    text += `${q.question}\n\n`;

    // If this question has an image, insert a unique placeholder token
    if (q.imageUrl && questionImageUris[q.id]) {
      text += `{{IMAGE_PLACEHOLDER_${q.id}}}\n\n`;
    } else if (q.imageUrl) {
      text += `  ※ [図・画像あり: アプリ内の問題詳細またはWeb画面をご参照ください]\n\n`;
    }

    // Choices
    q.choices.forEach((choice, cIdx) => {
      text += `  ${cIdx + 1}. ${choice}\n`;
    });

    if (includeAnswersAndExplanations && !separateAnswerKeyAtEnd) {
      const ansDisplay = formatAnswerDisplay(q.answer, q.question);
      text += `\n  【正答】 ${ansDisplay}\n`;
      if (q.explanation) {
        text += `  【解説】 ${q.explanation}\n`;
      }
    }

    text += `\n` + '―'.repeat(45) + `\n\n`;
  });

  // Separate Answer & Explanation Section at the end (ideal for printouts)
  if (includeAnswersAndExplanations && separateAnswerKeyAtEnd) {
    text += `\n\n` + '＝'.repeat(45) + `\n`;
    text += `【正答・解説一覧】 (${title})\n`;
    text += '＝'.repeat(45) + `\n\n`;

    questions.forEach((q, index) => {
      const num = index + 1;
      const ansDisplay = formatAnswerDisplay(q.answer, q.question);
      text += `■ 第${num}問  [${q.id}]  正答: ${ansDisplay}\n`;
      if (q.explanation) {
        text += `  解説: ${q.explanation}\n`;
      }
      text += `\n`;
    });
  }

  onProgress?.('Googleドキュメントへ問題データを挿入中...');

  // 4. Initial insert of the complete text
  const initialBatchRes = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: text
          }
        }
      ]
    })
  });

  if (!initialBatchRes.ok) {
    const errText = await initialBatchRes.text();
    console.error('Docs update error:', errText);
    throw new Error(`Googleドキュメントの更新に失敗しました: ${initialBatchRes.statusText}`);
  }

  // 5. If there are images to embed, locate the placeholders and replace them with insertInlineImage
  const hasImagesToInsert = Object.keys(questionImageUris).length > 0;
  if (hasImagesToInsert) {
    onProgress?.('問題用紙内に図・写真をインライン配置中...');
    
    // Fetch document structure to find accurate character indices
    const currentDocRes = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (currentDocRes.ok) {
      const currentDoc = await currentDocRes.json();
      
      // Find placeholders in content
      interface FoundPlaceholder {
        qId: string;
        startIndex: number;
        endIndex: number;
        imageUri: string;
      }

      const foundList: FoundPlaceholder[] = [];

      const searchElements = (elements: any[]) => {
        for (const el of elements) {
          if (el.paragraph?.elements) {
            for (const pElem of el.paragraph.elements) {
              const pText = pElem.textRun?.content;
              if (pText) {
                for (const qId of Object.keys(questionImageUris)) {
                  const token = `{{IMAGE_PLACEHOLDER_${qId}}}`;
                  const tokenPos = pText.indexOf(token);
                  if (tokenPos !== -1) {
                    const startIdx = (pElem.startIndex || 0) + tokenPos;
                    const endIdx = startIdx + token.length;
                    foundList.push({
                      qId,
                      startIndex: startIdx,
                      endIndex: endIdx,
                      imageUri: questionImageUris[qId]
                    });
                  }
                }
              }
            }
          }
        }
      };

      if (currentDoc.body?.content) {
        searchElements(currentDoc.body.content);
      }

      // CRITICAL: Sort by startIndex DESCENDING so deleting/inserting at higher indices
      // does not corrupt indices of subsequent operations!
      foundList.sort((a, b) => b.startIndex - a.startIndex);

      if (foundList.length > 0) {
        const imageRequests: any[] = [];

        for (const item of foundList) {
          // 1. Delete placeholder token
          imageRequests.push({
            deleteContentRange: {
              range: {
                startIndex: item.startIndex,
                endIndex: item.endIndex
              }
            }
          });

          // 2. Insert inline image at item.startIndex
          imageRequests.push({
            insertInlineImage: {
              location: {
                index: item.startIndex
              },
              uri: item.imageUri,
              objectSize: {
                // Sized appropriately for A4 printout (width ~380pt, maintaining aspect ratio)
                width: {
                  magnitude: 380,
                  unit: 'PT'
                }
              }
            }
          });
        }

        try {
          const imgBatchRes = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ requests: imageRequests })
          });

          if (!imgBatchRes.ok) {
            console.warn('Failed to embed images inline:', await imgBatchRes.text());
          }
        } catch (imgErr) {
          console.warn('Error during image batch update:', imgErr);
        }
      }
    }
  }

  onProgress?.('完了しました！');
  return { docId, docUrl };
}
