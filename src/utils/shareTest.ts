import LZString from 'lz-string';
import QRCode from 'qrcode';
import { DeliveredTest, Question, isSampleTest } from '../types';
import { saveDeliveredTestToCloud, fetchDeliveredTestFromCloud } from '../services/testSyncService';

export interface CompactQuestion {
  i: string; // id
  y: number | string; // year
  c: string; // category
  q: string; // question
  o: [string, string, string, string, string]; // options/choices
  a: number | number[]; // answer
  e: string; // explanation
  m?: string; // imageUrl
}

export interface CompactDeliveredTestPayload {
  id: string;
  t: string; // title
  d: string; // createdAt
  cat?: string; // category
  ins?: string; // instructions
  qs: CompactQuestion[];
}

/**
 * Saves a delivered test and its questions to the backend server and Firestore,
 * generating a short 6-character code (e.g. "K9X2P4").
 */
export async function saveTestToServer(
  test: DeliveredTest,
  questions: Question[]
): Promise<{ success: boolean; code: string; shareUrl: string }> {
  // Always trigger Firestore cloud save in parallel
  saveDeliveredTestToCloud(test, questions).catch(err => {
    console.warn('Firestore cloud sync notice:', err);
  });

  try {
    const res = await fetch('/api/tests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test, questions })
    });

    if (res.ok) {
      const data = await res.json();
      const code: string = data.code;
      const origin = window.location.origin;
      const pathname = window.location.pathname;
      const shareUrl = `${origin}${pathname}?code=${code}`;
      return { success: true, code, shareUrl };
    }
  } catch (e) {
    console.warn('Failed to save test to server, using client URL fallback', e);
  }

  // Fallback: build client compressed URL if server is unavailable
  const fallbackUrl = buildFallbackShareUrl(test, questions);
  return { success: false, code: '', shareUrl: fallbackUrl };
}

/**
 * Fetches delivered test and questions from server or Firestore by 6-digit code or test ID.
 */
export async function fetchTestFromServer(codeOrId: string): Promise<{
  test: DeliveredTest;
  questions: Question[];
} | null> {
  // 1. Try Express backend server first
  try {
    const clean = encodeURIComponent(codeOrId.trim());
    const res = await fetch(`/api/tests/${clean}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.test && Array.isArray(data.questions)) {
        return {
          test: {
            ...data.test,
            code: data.code,
            questions: data.questions
          },
          questions: data.questions
        };
      }
    }
  } catch (e) {
    console.warn('Error fetching test from server, trying Firestore cloud fallback', e);
  }

  // 2. Fallback: Try Firestore direct
  try {
    const cloudTest = await fetchDeliveredTestFromCloud(codeOrId);
    if (cloudTest) {
      return cloudTest;
    }
  } catch (cloudErr) {
    console.warn('Error fetching test from Firestore', cloudErr);
  }

  return null;
}

/**
 * Fetches all available delivered tests from the server.
 */
export async function fetchAllServerTests(): Promise<DeliveredTest[]> {
  try {
    const res = await fetch('/api/tests');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.tests)) {
        return data.tests
          .map((item: any) => ({
            ...item.test,
            code: item.code
          }))
          .filter((t: DeliveredTest) => !isSampleTest(t));
      }
    }
  } catch (e) {
    console.warn('Failed to fetch server tests list', e);
  }
  return [];
}

/**
 * Encodes a DeliveredTest and its Question items into a compressed URL-safe string (Fallback).
 */
export function encodeDeliveredTest(test: DeliveredTest, questions: Question[]): string {
  const compactQuestions: CompactQuestion[] = questions.map(q => ({
    i: q.id,
    y: q.year,
    c: q.category,
    q: q.question,
    o: q.choices,
    a: q.answer,
    e: q.explanation,
    ...(q.imageUrl ? { m: q.imageUrl } : {})
  }));

  const payload: CompactDeliveredTestPayload = {
    id: test.id,
    t: test.title,
    d: test.createdAt,
    ...(test.category ? { cat: test.category } : {}),
    ...(test.instructions ? { ins: test.instructions } : {}),
    qs: compactQuestions
  };

  const json = JSON.stringify(payload);
  return LZString.compressToEncodedURIComponent(json);
}

/**
 * Builds fallback full URL with compressed payload in hash.
 */
export function buildFallbackShareUrl(test: DeliveredTest, questions: Question[]): string {
  const compressed = encodeDeliveredTest(test, questions);
  const origin = window.location.origin;
  const pathname = window.location.pathname;
  return `${origin}${pathname}#test=${compressed}`;
}

/**
 * Decodes a compressed string or URL hash into a DeliveredTest and Question[].
 */
export function decodeDeliveredTest(hashOrCompressed: string): {
  test: DeliveredTest;
  questions: Question[];
} | null {
  try {
    let raw = hashOrCompressed;
    if (raw.startsWith('#test=')) {
      raw = raw.replace('#test=', '');
    } else if (raw.startsWith('#')) {
      raw = raw.replace('#', '');
    } else if (raw.includes('test=')) {
      const match = raw.match(/test=([^&]+)/);
      if (match) raw = match[1];
    }

    if (!raw) return null;

    const decompressed = LZString.decompressFromEncodedURIComponent(raw);
    if (!decompressed) return null;

    const parsed: CompactDeliveredTestPayload = JSON.parse(decompressed);
    if (!parsed || !parsed.t || !Array.isArray(parsed.qs)) {
      return null;
    }

    const restoredQuestions: Question[] = parsed.qs.map(cq => ({
      id: cq.i,
      year: cq.y,
      category: cq.c,
      question: cq.q,
      choices: cq.o,
      answer: cq.a,
      explanation: cq.e,
      imageUrl: cq.m
    }));

    const restoredTest: DeliveredTest = {
      id: parsed.id || 'test-' + Date.now(),
      title: parsed.t,
      category: parsed.cat,
      createdAt: parsed.d || new Date().toISOString(),
      questionIds: restoredQuestions.map(q => q.id),
      totalQuestions: restoredQuestions.length,
      instructions: parsed.ins,
      questions: restoredQuestions
    };

    return {
      test: restoredTest,
      questions: restoredQuestions
    };
  } catch (err) {
    console.error('Failed to decode delivered test from URL', err);
    return null;
  }
}

/**
 * Generates a high-quality QR code data URL (PNG) from a given share URL.
 * Automatically adjusts options to guarantee successful generation.
 */
export async function generateTestQRCodeDataUrl(shareUrl: string): Promise<string> {
  if (!shareUrl) {
    throw new Error('Empty URL');
  }

  // First try: Standard high-density clean QR
  try {
    return await QRCode.toDataURL(shareUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 480,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.warn('QR code standard generation failed, trying Low error correction', err);
  }

  // Second try: Low error correction for larger payloads
  try {
    return await QRCode.toDataURL(shareUrl, {
      errorCorrectionLevel: 'L',
      margin: 1,
      width: 480,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
  } catch (err2) {
    console.error('QR code generation failed even with Low error correction', err2);
    throw err2;
  }
}

/**
 * Creates preformatted notice message for LINE / Classroom / Teams.
 */
export function buildShareMessageTemplate(
  test: DeliveredTest,
  shareUrl: string,
  code?: string
): string {
  const instructionsPart = test.instructions ? `\n【教員からの指示】\n${test.instructions}\n` : '';
  const categoryPart = test.category ? `\n対象分野: ${test.category}` : '';
  const codePart = code ? `\nテスト参加コード: ${code}` : '';

  return `【作業療法士 国家試験 小テストのお知らせ】
テスト名: ${test.title}${categoryPart}
出題数: ${test.totalQuestions} 問${codePart}${instructionsPart}
▼ 以下のリンクをタップして受験を開始してください：
${shareUrl}

※ログイン不要・スマートフォンやPCのブラウザから直接受験できます。`;
}
