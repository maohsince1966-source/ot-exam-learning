import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  PageBreak,
  ImageRun,
  ShadingType,
  LineRuleType,
  convertMillimetersToTwip
} from 'docx';
import { Question } from '../types';
import { formatAnswerDisplay } from '../utils/categoryHelper';
import { getImageUrlFallbacks } from '../utils/imageHelper';

export interface WordExportOptions {
  title: string;
  subtitle?: string;
  questions: Question[];
  includeStudentHeader?: boolean;
  answerFormat?: 'separate' | 'inline' | 'none'; // 'separate' = answer key at end; 'inline' = under question; 'none' = question only
  embedImages?: boolean;
  fileName?: string;
}

/**
 * Common formatting constants as requested by user:
 * - Margins: Top/Bottom 25mm, Left/Right 20mm
 * - Font: 游ゴシック (Yu Gothic)
 * - Font Size: 11pt (22 half-points in docx)
 * - Line Spacing: 最小値 (atLeast), 間隔: 0pt (line: 0, before: 0, after: 0)
 */
const DEFAULT_FONT = '游ゴシック';
const DEFAULT_FONT_SIZE = 22; // 11pt in half-points
const DEFAULT_SPACING = {
  before: 0,
  after: 0,
  line: 0,
  lineRule: LineRuleType.AT_LEAST
};
const borderStyle = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: 'CBD5E1'
};

/**
 * Loads an image from a URL (or Data URL), draws it to an offscreen canvas to measure
 * and convert to clean PNG Uint8Array for Microsoft Word compatibility.
 */
async function prepareImageForWord(
  imageUrl: string,
  maxWidth = 420,
  maxHeight = 320
): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  if (!imageUrl || typeof window === 'undefined') return null;

  const candidateUrls = getImageUrlFallbacks(imageUrl);

  for (const candidate of candidateUrls) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = candidate;
      });

      let w = img.naturalWidth || 300;
      let h = img.naturalHeight || 200;

      if (w > maxWidth) {
        h = Math.round((h * maxWidth) / w);
        w = maxWidth;
      }
      if (h > maxHeight) {
        w = Math.round((w * maxHeight) / h);
        h = maxHeight;
      }

      // Draw onto canvas to convert to clean PNG buffer
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      // Fill white background in case of transparent background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const blob = await new Promise<Blob | null>((res) => {
        canvas.toBlob((b) => res(b), 'image/png');
      });

      if (blob) {
        const arrayBuf = await blob.arrayBuffer();
        return {
          data: new Uint8Array(arrayBuf),
          width: w,
          height: h
        };
      }
    } catch {
      // Try next fallback candidate
      continue;
    }
  }

  // If direct browser loading failed, try fetching via server proxy
  try {
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Proxy image load failed'));
          img.src = objectUrl;
        });

        let w = img.naturalWidth || 300;
        let h = img.naturalHeight || 200;

        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        if (h > maxHeight) {
          w = Math.round((w * maxHeight) / h);
          h = maxHeight;
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const pngBlob = await new Promise<Blob | null>((res) => {
            canvas.toBlob((b) => res(b), 'image/png');
          });
          if (pngBlob) {
            const buf = await pngBlob.arrayBuffer();
            return {
              data: new Uint8Array(buf),
              width: w,
              height: h
            };
          }
        }
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
  } catch (err) {
    console.warn('Proxy image fallback error:', err);
  }

  return null;
}

/**
 * Generates a Microsoft Word (.docx) document from a list of questions,
 * then triggers a browser download.
 */
export async function exportQuestionsToWordDoc(
  options: WordExportOptions,
  onProgress?: (status: string) => void
): Promise<{ success: boolean; fileName: string; blob: Blob }> {
  const {
    title,
    subtitle = '印刷・配布用テスト',
    questions,
    includeStudentHeader = true,
    answerFormat = 'separate',
    embedImages = true,
    fileName
  } = options;

  if (questions.length === 0) {
    throw new Error('出力対象の問題が選択されていません。');
  }

  onProgress?.('Word文書の構成を作成中...');

  // 1. Process and load images if enabled
  const imageMap = new Map<string, { data: Uint8Array; width: number; height: number }>();
  if (embedImages) {
    const imageQuestions = questions.filter(q => Boolean(q.imageUrl));
    if (imageQuestions.length > 0) {
      onProgress?.(`画像問題（全${imageQuestions.length}問）の図版・臨床写真を処理中...`);
      for (let i = 0; i < imageQuestions.length; i++) {
        const q = imageQuestions[i];
        onProgress?.(`画像準備中 (${i + 1}/${imageQuestions.length}): [${q.id}]`);
        const imgData = await prepareImageForWord(q.imageUrl!);
        if (imgData) {
          imageMap.set(q.id, imgData);
        }
      }
    }
  }

  onProgress?.('Wordドキュメント (.docx) のレイアウトを整形中...');

  const children: (Paragraph | Table)[] = [];

  // Title Header (11pt bold, centered, 游ゴシック, line spacing 最小値/0pt)
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: DEFAULT_SPACING,
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: DEFAULT_FONT_SIZE,
          color: '0F172A',
          font: DEFAULT_FONT
        })
      ]
    })
  );

  // Subtitle / Notice
  if (subtitle && subtitle.trim()) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: DEFAULT_SPACING,
        children: [
          new TextRun({
            text: subtitle.trim(),
            size: DEFAULT_FONT_SIZE,
            color: '475569',
            font: DEFAULT_FONT
          })
        ]
      })
    );
  }

  // Date and question count line
  const todayStr = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: DEFAULT_SPACING,
      children: [
        new TextRun({
          text: `実施日: ${todayStr}　　問題数: 全${questions.length}問`,
          size: DEFAULT_FONT_SIZE,
          color: '64748B',
          font: DEFAULT_FONT
        })
      ]
    })
  );

  // Blank line separator before student header or questions
  children.push(new Paragraph({ spacing: DEFAULT_SPACING }));

  // Student info header box (Table)
  if (includeStudentHeader) {
    const borderStyle = {
      style: BorderStyle.SINGLE,
      size: 1,
      color: 'CBD5E1'
    };

    const headerTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 28, type: WidthType.PERCENTAGE },
              borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
              shading: { type: ShadingType.CLEAR, fill: 'F8FAFC' },
              margins: { top: 100, bottom: 100, left: 120, right: 120 },
              children: [
                new Paragraph({
                  spacing: DEFAULT_SPACING,
                  children: [
                    new TextRun({ text: '学籍番号: ', bold: true, size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT }),
                    new TextRun({ text: '＿＿＿＿＿＿', size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, color: '94A3B8' })
                  ]
                })
              ]
            }),
            new TableCell({
              width: { size: 18, type: WidthType.PERCENTAGE },
              borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
              shading: { type: ShadingType.CLEAR, fill: 'F8FAFC' },
              margins: { top: 100, bottom: 100, left: 120, right: 120 },
              children: [
                new Paragraph({
                  spacing: DEFAULT_SPACING,
                  children: [
                    new TextRun({ text: '学年: ', bold: true, size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT }),
                    new TextRun({ text: '＿＿年', size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, color: '94A3B8' })
                  ]
                })
              ]
            }),
            new TableCell({
              width: { size: 34, type: WidthType.PERCENTAGE },
              borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
              shading: { type: ShadingType.CLEAR, fill: 'F8FAFC' },
              margins: { top: 100, bottom: 100, left: 120, right: 120 },
              children: [
                new Paragraph({
                  spacing: DEFAULT_SPACING,
                  children: [
                    new TextRun({ text: '氏名: ', bold: true, size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT }),
                    new TextRun({ text: '＿＿＿＿＿＿＿＿', size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, color: '94A3B8' })
                  ]
                })
              ]
            }),
            new TableCell({
              width: { size: 20, type: WidthType.PERCENTAGE },
              borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
              shading: { type: ShadingType.CLEAR, fill: 'F8FAFC' },
              margins: { top: 100, bottom: 100, left: 120, right: 120 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: DEFAULT_SPACING,
                  children: [
                    new TextRun({ text: '得点: ', bold: true, size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT }),
                    new TextRun({ text: `　 / ${questions.length}`, size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, color: '64748B' })
                  ]
                })
              ]
            })
          ]
        })
      ]
    });

    children.push(headerTable);
    children.push(new Paragraph({ spacing: DEFAULT_SPACING }));
  }

  // Questions loop
  questions.forEach((q, idx) => {
    const qNum = idx + 1;
    const catStr = q.majorCategory || q.category || '';
    const subStr = q.subCategory ? ` / ${q.subCategory}` : '';
    const yrStr = q.year ? ` (第${q.year}回)` : '';

    // Question header line (e.g. 【第1問】 [45P01] 身体障害作業療法学 / 評価 (第45回))
    children.push(
      new Paragraph({
        spacing: DEFAULT_SPACING,
        children: [
          new TextRun({
            text: `【第${qNum}問】 `,
            bold: true,
            size: DEFAULT_FONT_SIZE,
            color: '1E3A8A',
            font: DEFAULT_FONT
          }),
          new TextRun({
            text: `[${q.id}] `,
            bold: true,
            size: DEFAULT_FONT_SIZE,
            color: '334155',
            font: DEFAULT_FONT
          }),
          new TextRun({
            text: `${catStr}${subStr}${yrStr}`,
            size: DEFAULT_FONT_SIZE,
            color: '64748B',
            font: DEFAULT_FONT
          })
        ]
      })
    );

    // Question statement
    children.push(
      new Paragraph({
        spacing: DEFAULT_SPACING,
        children: [
          new TextRun({
            text: q.question,
            size: DEFAULT_FONT_SIZE,
            color: '0F172A',
            font: DEFAULT_FONT
          })
        ]
      })
    );

    // Question Image (if present and embedded)
    if (q.imageUrl && embedImages) {
      const imgData = imageMap.get(q.id);
      if (imgData) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: DEFAULT_SPACING,
            children: [
              new ImageRun({
                type: 'png',
                data: imgData.data,
                transformation: {
                  width: imgData.width,
                  height: imgData.height
                }
              })
            ]
          })
        );
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: DEFAULT_SPACING,
            children: [
              new TextRun({
                text: `（図・写真: ${q.id}）`,
                size: DEFAULT_FONT_SIZE,
                color: '64748B',
                font: DEFAULT_FONT
              })
            ]
          })
        );
      } else {
        children.push(
          new Paragraph({
            spacing: DEFAULT_SPACING,
            children: [
              new TextRun({
                text: `※ [臨床図版・写真あり: ${q.id} - アプリまたは過去問題集をご参照ください]`,
                italics: true,
                size: DEFAULT_FONT_SIZE,
                color: '475569',
                font: DEFAULT_FONT
              })
            ]
          })
        );
      }
    }

    // Choices (1 to 5)
    q.choices.forEach((choice, cIdx) => {
      children.push(
        new Paragraph({
          spacing: DEFAULT_SPACING,
          indent: { left: 420 }, // standard indent
          children: [
            new TextRun({
              text: `${cIdx + 1}.  `,
              bold: true,
              size: DEFAULT_FONT_SIZE,
              color: '1E293B',
              font: DEFAULT_FONT
            }),
            new TextRun({
              text: choice,
              size: DEFAULT_FONT_SIZE,
              color: '1E293B',
              font: DEFAULT_FONT
            })
          ]
        })
      );
    });

    // If answer format is 'inline', display correct answer and explanation right below
    if (answerFormat === 'inline') {
      const ansDisplay = formatAnswerDisplay(q.answer, q.question);
      children.push(
        new Paragraph({
          spacing: DEFAULT_SPACING,
          indent: { left: 420 },
          children: [
            new TextRun({
              text: '【正答】 ',
              bold: true,
              size: DEFAULT_FONT_SIZE,
              color: 'DC2626',
              font: DEFAULT_FONT
            }),
            new TextRun({
              text: ansDisplay,
              bold: true,
              size: DEFAULT_FONT_SIZE,
              color: 'DC2626',
              font: DEFAULT_FONT
            })
          ]
        })
      );

      if (q.explanation && q.explanation.trim()) {
        children.push(
          new Paragraph({
            spacing: DEFAULT_SPACING,
            indent: { left: 420 },
            children: [
              new TextRun({
                text: '【解説】 ',
                bold: true,
                size: DEFAULT_FONT_SIZE,
                color: '0369A1',
                font: DEFAULT_FONT
              }),
              new TextRun({
                text: q.explanation.trim(),
                size: DEFAULT_FONT_SIZE,
                color: '334155',
                font: DEFAULT_FONT
              })
            ]
          })
        );
      }
    }

    // Question separator
    if (idx < questions.length - 1) {
      children.push(
        new Paragraph({
          spacing: DEFAULT_SPACING,
          border: {
            bottom: {
              style: BorderStyle.DOTTED,
              size: 1,
              color: 'CBD5E1'
            }
          }
        })
      );
      children.push(new Paragraph({ spacing: DEFAULT_SPACING }));
    }
  });

  // Separate Answer Key Section at end
  if (answerFormat === 'separate') {
    // -------------------------------------------------------------
    // Page 1: 回答だけの一覧 (Answer Only List)
    // -------------------------------------------------------------
    children.push(
      new Paragraph({
        spacing: DEFAULT_SPACING,
        children: [new PageBreak()]
      })
    );

    // Answer-only page header
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: DEFAULT_SPACING,
        children: [
          new TextRun({
            text: '【正答一覧】',
            bold: true,
            size: DEFAULT_FONT_SIZE,
            color: '0F172A',
            font: DEFAULT_FONT
          })
        ]
      })
    );

    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: DEFAULT_SPACING,
        children: [
          new TextRun({
            text: `${title}（全${questions.length}問）`,
            size: DEFAULT_FONT_SIZE,
            color: '64748B',
            font: DEFAULT_FONT
          })
        ]
      })
    );

    children.push(new Paragraph({ spacing: DEFAULT_SPACING }));

    // Answer Key Table (回答だけの一覧テーブル)
    // 25問以下の場合は詳細4列テーブル、26問以上の場合はA4用紙1枚に収まりやすい2段組テーブル
    if (questions.length <= 25) {
      const answerOnlyRows = [
        new TableRow({
          tableHeader: true,
          children: [
            new TableCell({
              width: { size: 18, type: WidthType.PERCENTAGE },
              borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
              shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
              margins: { top: 70, bottom: 70, left: 90, right: 90 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: DEFAULT_SPACING,
                  children: [
                    new TextRun({
                      text: '問題番号',
                      bold: true,
                      size: DEFAULT_FONT_SIZE,
                      font: DEFAULT_FONT,
                      color: '1E3A8A'
                    })
                  ]
                })
              ]
            }),
            new TableCell({
              width: { size: 18, type: WidthType.PERCENTAGE },
              borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
              shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
              margins: { top: 70, bottom: 70, left: 90, right: 90 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: DEFAULT_SPACING,
                  children: [
                    new TextRun({
                      text: '問題ID',
                      bold: true,
                      size: DEFAULT_FONT_SIZE,
                      font: DEFAULT_FONT,
                      color: '475569'
                    })
                  ]
                })
              ]
            }),
            new TableCell({
              width: { size: 44, type: WidthType.PERCENTAGE },
              borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
              shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
              margins: { top: 70, bottom: 70, left: 90, right: 90 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  spacing: DEFAULT_SPACING,
                  children: [
                    new TextRun({
                      text: '科目・出題分野',
                      bold: true,
                      size: DEFAULT_FONT_SIZE,
                      font: DEFAULT_FONT,
                      color: '475569'
                    })
                  ]
                })
              ]
            }),
            new TableCell({
              width: { size: 20, type: WidthType.PERCENTAGE },
              borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
              shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
              margins: { top: 70, bottom: 70, left: 90, right: 90 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: DEFAULT_SPACING,
                  children: [
                    new TextRun({
                      text: '正答',
                      bold: true,
                      size: DEFAULT_FONT_SIZE,
                      font: DEFAULT_FONT,
                      color: 'DC2626'
                    })
                  ]
                })
              ]
            })
          ]
        })
      ];

      questions.forEach((q, idx) => {
        const qNum = idx + 1;
        const ansDisplay = formatAnswerDisplay(q.answer, q.question);
        const fieldStr = [q.category, q.subCategory].filter(Boolean).join(' / ') || '作業療法学';

        answerOnlyRows.push(
          new TableRow({
            children: [
              new TableCell({
                width: { size: 18, type: WidthType.PERCENTAGE },
                borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
                margins: { top: 50, bottom: 50, left: 70, right: 70 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: DEFAULT_SPACING,
                    children: [
                      new TextRun({
                        text: `第${qNum}問`,
                        bold: true,
                        size: DEFAULT_FONT_SIZE,
                        font: DEFAULT_FONT,
                        color: '1E3A8A'
                      })
                    ]
                  })
                ]
              }),
              new TableCell({
                width: { size: 18, type: WidthType.PERCENTAGE },
                borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
                margins: { top: 50, bottom: 50, left: 70, right: 70 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: DEFAULT_SPACING,
                    children: [
                      new TextRun({
                        text: q.id,
                        size: DEFAULT_FONT_SIZE,
                        font: DEFAULT_FONT,
                        color: '475569'
                      })
                    ]
                  })
                ]
              }),
              new TableCell({
                width: { size: 44, type: WidthType.PERCENTAGE },
                borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
                margins: { top: 50, bottom: 50, left: 70, right: 70 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.LEFT,
                    spacing: DEFAULT_SPACING,
                    children: [
                      new TextRun({
                        text: fieldStr,
                        size: DEFAULT_FONT_SIZE,
                        font: DEFAULT_FONT,
                        color: '334155'
                      })
                    ]
                  })
                ]
              }),
              new TableCell({
                width: { size: 20, type: WidthType.PERCENTAGE },
                borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
                margins: { top: 50, bottom: 50, left: 70, right: 70 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: DEFAULT_SPACING,
                    children: [
                      new TextRun({
                        text: ansDisplay,
                        bold: true,
                        size: DEFAULT_FONT_SIZE,
                        font: DEFAULT_FONT,
                        color: 'DC2626'
                      })
                    ]
                  })
                ]
              })
            ]
          })
        );
      });

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: answerOnlyRows
        })
      );
    } else {
      // 26問以上の場合：2段組でコンパクトに表示（A4用紙1枚で一覧可能）
      const half = Math.ceil(questions.length / 2);
      const noneBorder = { style: BorderStyle.NONE };

      const answerOnlyRows = [
        new TableRow({
          tableHeader: true,
          children: [
            new TableCell({
              width: { size: 14, type: WidthType.PERCENTAGE },
              borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
              shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
              margins: { top: 60, bottom: 60, left: 60, right: 60 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: DEFAULT_SPACING,
                  children: [new TextRun({ text: '問題', bold: true, size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, color: '1E3A8A' })]
                })
              ]
            }),
            new TableCell({
              width: { size: 18, type: WidthType.PERCENTAGE },
              borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
              shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
              margins: { top: 60, bottom: 60, left: 60, right: 60 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: DEFAULT_SPACING,
                  children: [new TextRun({ text: '問題ID', bold: true, size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, color: '475569' })]
                })
              ]
            }),
            new TableCell({
              width: { size: 16, type: WidthType.PERCENTAGE },
              borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
              shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
              margins: { top: 60, bottom: 60, left: 60, right: 60 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: DEFAULT_SPACING,
                  children: [new TextRun({ text: '正答', bold: true, size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, color: 'DC2626' })]
                })
              ]
            }),
            new TableCell({
              width: { size: 4, type: WidthType.PERCENTAGE },
              borders: { top: noneBorder, bottom: noneBorder, left: noneBorder, right: noneBorder },
              children: [new Paragraph({ spacing: DEFAULT_SPACING })]
            }),
            new TableCell({
              width: { size: 14, type: WidthType.PERCENTAGE },
              borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
              shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
              margins: { top: 60, bottom: 60, left: 60, right: 60 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: DEFAULT_SPACING,
                  children: [new TextRun({ text: '問題', bold: true, size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, color: '1E3A8A' })]
                })
              ]
            }),
            new TableCell({
              width: { size: 18, type: WidthType.PERCENTAGE },
              borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
              shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
              margins: { top: 60, bottom: 60, left: 60, right: 60 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: DEFAULT_SPACING,
                  children: [new TextRun({ text: '問題ID', bold: true, size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, color: '475569' })]
                })
              ]
            }),
            new TableCell({
              width: { size: 16, type: WidthType.PERCENTAGE },
              borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
              shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
              margins: { top: 60, bottom: 60, left: 60, right: 60 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: DEFAULT_SPACING,
                  children: [new TextRun({ text: '正答', bold: true, size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, color: 'DC2626' })]
                })
              ]
            })
          ]
        })
      ];

      for (let i = 0; i < half; i++) {
        const leftQ = questions[i];
        const rightQ = questions[i + half];
        const leftAns = formatAnswerDisplay(leftQ.answer, leftQ.question);
        const rightAns = rightQ ? formatAnswerDisplay(rightQ.answer, rightQ.question) : '';

        answerOnlyRows.push(
          new TableRow({
            children: [
              new TableCell({
                width: { size: 14, type: WidthType.PERCENTAGE },
                borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
                margins: { top: 40, bottom: 40, left: 50, right: 50 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: DEFAULT_SPACING,
                    children: [new TextRun({ text: `第${i + 1}問`, bold: true, size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, color: '1E3A8A' })]
                  })
                ]
              }),
              new TableCell({
                width: { size: 18, type: WidthType.PERCENTAGE },
                borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
                margins: { top: 40, bottom: 40, left: 50, right: 50 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: DEFAULT_SPACING,
                    children: [new TextRun({ text: leftQ.id, size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, color: '475569' })]
                  })
                ]
              }),
              new TableCell({
                width: { size: 16, type: WidthType.PERCENTAGE },
                borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
                margins: { top: 40, bottom: 40, left: 50, right: 50 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: DEFAULT_SPACING,
                    children: [new TextRun({ text: leftAns, bold: true, size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, color: 'DC2626' })]
                  })
                ]
              }),
              new TableCell({
                width: { size: 4, type: WidthType.PERCENTAGE },
                borders: { top: noneBorder, bottom: noneBorder, left: noneBorder, right: noneBorder },
                children: [new Paragraph({ spacing: DEFAULT_SPACING })]
              }),
              rightQ
                ? new TableCell({
                    width: { size: 14, type: WidthType.PERCENTAGE },
                    borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
                    margins: { top: 40, bottom: 40, left: 50, right: 50 },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: DEFAULT_SPACING,
                        children: [new TextRun({ text: `第${i + half + 1}問`, bold: true, size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, color: '1E3A8A' })]
                      })
                    ]
                  })
                : new TableCell({
                    width: { size: 14, type: WidthType.PERCENTAGE },
                    borders: { top: noneBorder, bottom: noneBorder, left: noneBorder, right: noneBorder },
                    children: [new Paragraph({ spacing: DEFAULT_SPACING })]
                  }),
              rightQ
                ? new TableCell({
                    width: { size: 18, type: WidthType.PERCENTAGE },
                    borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
                    margins: { top: 40, bottom: 40, left: 50, right: 50 },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: DEFAULT_SPACING,
                        children: [new TextRun({ text: rightQ.id, size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, color: '475569' })]
                      })
                    ]
                  })
                : new TableCell({
                    width: { size: 18, type: WidthType.PERCENTAGE },
                    borders: { top: noneBorder, bottom: noneBorder, left: noneBorder, right: noneBorder },
                    children: [new Paragraph({ spacing: DEFAULT_SPACING })]
                  }),
              rightQ
                ? new TableCell({
                    width: { size: 16, type: WidthType.PERCENTAGE },
                    borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
                    margins: { top: 40, bottom: 40, left: 50, right: 50 },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: DEFAULT_SPACING,
                        children: [new TextRun({ text: rightAns, bold: true, size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, color: 'DC2626' })]
                      })
                    ]
                  })
                : new TableCell({
                    width: { size: 16, type: WidthType.PERCENTAGE },
                    borders: { top: noneBorder, bottom: noneBorder, left: noneBorder, right: noneBorder },
                    children: [new Paragraph({ spacing: DEFAULT_SPACING })]
                  })
            ]
          })
        );
      }

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: answerOnlyRows
        })
      );
    }

    // -------------------------------------------------------------
    // Page 2: これまでと同じ、回答と解説を出力 (Answer & Explanation)
    // -------------------------------------------------------------
    children.push(
      new Paragraph({
        spacing: DEFAULT_SPACING,
        children: [new PageBreak()]
      })
    );

    // Answer and Explanation header (これまでと同じ)
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: DEFAULT_SPACING,
        children: [
          new TextRun({
            text: '【模範解答・解説一覧】',
            bold: true,
            size: DEFAULT_FONT_SIZE,
            color: '0F172A',
            font: DEFAULT_FONT
          })
        ]
      })
    );

    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: DEFAULT_SPACING,
        children: [
          new TextRun({
            text: `${title}（全${questions.length}問）`,
            size: DEFAULT_FONT_SIZE,
            color: '64748B',
            font: DEFAULT_FONT
          })
        ]
      })
    );

    children.push(new Paragraph({ spacing: DEFAULT_SPACING }));

    questions.forEach((q, idx) => {
      const qNum = idx + 1;
      const ansDisplay = formatAnswerDisplay(q.answer, q.question);

      children.push(
        new Paragraph({
          spacing: DEFAULT_SPACING,
          children: [
            new TextRun({
              text: `■ 第${qNum}問  `,
              bold: true,
              size: DEFAULT_FONT_SIZE,
              color: '1E3A8A',
              font: DEFAULT_FONT
            }),
            new TextRun({
              text: `[${q.id}]   `,
              size: DEFAULT_FONT_SIZE,
              color: '64748B',
              font: DEFAULT_FONT
            }),
            new TextRun({
              text: `正答: ${ansDisplay}`,
              bold: true,
              size: DEFAULT_FONT_SIZE,
              color: 'DC2626',
              font: DEFAULT_FONT
            })
          ]
        })
      );

      if (q.explanation && q.explanation.trim()) {
        children.push(
          new Paragraph({
            spacing: DEFAULT_SPACING,
            indent: { left: 280 },
            children: [
              new TextRun({
                text: '解説: ',
                bold: true,
                size: DEFAULT_FONT_SIZE,
                color: '475569',
                font: DEFAULT_FONT
              }),
              new TextRun({
                text: q.explanation.trim(),
                size: DEFAULT_FONT_SIZE,
                color: '1E293B',
                font: DEFAULT_FONT
              })
            ]
          })
        );
      }

      children.push(new Paragraph({ spacing: DEFAULT_SPACING }));
    });
  }

  onProgress?.('Wordファイルを生成中...');

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: DEFAULT_FONT,
            size: DEFAULT_FONT_SIZE
          },
          paragraph: {
            spacing: DEFAULT_SPACING
          }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertMillimetersToTwip(25),    // 上 25mm
              bottom: convertMillimetersToTwip(25), // 下 25mm
              left: convertMillimetersToTwip(20),   // 左 20mm
              right: convertMillimetersToTwip(20)   // 右 20mm
            }
          }
        },
        children
      }
    ]
  });

  const blob = await Packer.toBlob(doc);

  // Trigger download in browser
  const sanitizedTitle = title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  const downloadFileName =
    fileName ||
    `${sanitizedTitle}_${new Date().toISOString().split('T')[0]}.docx`;

  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = downloadFileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

  return {
    success: true,
    fileName: downloadFileName,
    blob
  };
}
