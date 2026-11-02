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

const STORAGE_KEY_DELETED_TESTS = 'pt_deleted_test_ids_cache';
export const STORAGE_KEY_DELIVERED = 'ot_exam_delivered_tests_v2';
export const STORAGE_KEY_DELIVERED_BACKUP = 'ot_delivered_tests_backup_v1';
export const STORAGE_KEY_DELIVERED_LEGACY = 'ot_exam_delivered_tests_v1';

/**
 * Retrieve all tests stored locally across primary, backup, and legacy keys
 */
export function getLocalTestsBackup(): DeliveredTest[] {
  const map = new Map<string, DeliveredTest>();
  const keys = [STORAGE_KEY_DELIVERED, STORAGE_KEY_DELIVERED_BACKUP, STORAGE_KEY_DELIVERED_LEGACY];
  const knownDeleted = getKnownDeletedTestIds();

  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((t: DeliveredTest) => {
            if (t && t.id && !isSampleTest(t)) {
              if (
                !knownDeleted.has(t.id) &&
                !knownDeleted.has(t.id.toUpperCase()) &&
                (!t.code || (!knownDeleted.has(t.code) && !knownDeleted.has(t.code.toUpperCase())))
              ) {
                if (!map.has(t.id)) {
                  map.set(t.id, t);
                }
              }
            }
          });
        }
      }
    } catch {}
  }
  return Array.from(map.values());
}

/**
 * Persist tests to both primary and backup storage keys for maximum resilience
 */
export function saveLocalTestsBackup(tests: DeliveredTest[]): void {
  try {
    const knownDeleted = getKnownDeletedTestIds();
    const clean = tests.filter(t => 
      t && t.id && !isSampleTest(t) &&
      !knownDeleted.has(t.id) &&
      !knownDeleted.has(t.id.toUpperCase())
    );
    const json = JSON.stringify(clean);
    localStorage.setItem(STORAGE_KEY_DELIVERED, json);
    localStorage.setItem(STORAGE_KEY_DELIVERED_BACKUP, json);
  } catch (e) {
    console.warn('Failed to save tests to local backup:', e);
  }
}

export function getKnownDeletedTestIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DELETED_TESTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map(s => String(s).trim()));
      }
    }
  } catch {}
  return new Set();
}

export function recordDeletedTestIds(ids: string[]): void {
  try {
    const current = getKnownDeletedTestIds();
    ids.forEach(id => {
      if (id) {
        current.add(String(id).trim());
        current.add(String(id).trim().toUpperCase());
      }
    });
    localStorage.setItem(STORAGE_KEY_DELETED_TESTS, JSON.stringify(Array.from(current)));
  } catch {}
}

export function unmarkDeletedTestId(idOrCode: string): void {
  try {
    const current = getKnownDeletedTestIds();
    current.delete(idOrCode.trim());
    current.delete(idOrCode.trim().toUpperCase());
    localStorage.setItem(STORAGE_KEY_DELETED_TESTS, JSON.stringify(Array.from(current)));
  } catch {}
}

export function isTestDeleted(idOrCode: string): boolean {
  if (!idOrCode) return false;
  const current = getKnownDeletedTestIds();
  const clean = idOrCode.trim();
  return current.has(clean) || current.has(clean.toUpperCase());
}

/**
 * Saves a delivered test and its questions to the backend server and Firestore,
 * generating a short 6-character code (e.g. "K9X2P4").
 */
export async function saveTestToServer(
  test: DeliveredTest,
  questions: Question[]
): Promise<{ success: boolean; code: string; shareUrl: string }> {
  // Clear any tombstone if re-delivering
  if (test.id) unmarkDeletedTestId(test.id);

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
      if (code) unmarkDeletedTestId(code);
      const origin = window.location.origin;
      const pathname = window.location.pathname;
      const shareUrl = `${origin}${pathname}?role=student&code=${code}`;

      // Update local backup immediately
      try {
        const savedTest: DeliveredTest = {
          ...test,
          code,
          questions
        };
        const current = getLocalTestsBackup().filter(t => t.id !== test.id);
        saveLocalTestsBackup([savedTest, ...current]);
      } catch {}

      return { success: true, code, shareUrl };
    }
  } catch (e) {
    console.warn('Failed to save test to server, using client URL fallback', e);
  }

  // Fallback: build client compressed URL if server is unavailable
  const fallbackUrl = buildFallbackShareUrl(test, questions);
  try {
    const savedTest: DeliveredTest = { ...test, questions };
    const current = getLocalTestsBackup().filter(t => t.id !== test.id);
    saveLocalTestsBackup([savedTest, ...current]);
  } catch {}
  return { success: false, code: '', shareUrl: fallbackUrl };
}

/**
 * Permanently delete a delivered test from the server backend
 */
export async function deleteTestFromServer(
  testId: string,
  testCode?: string
): Promise<{ success: boolean; deletedTestIds: string[] }> {
  const toRecord = [testId, ...(testCode ? [testCode] : [])];
  recordDeletedTestIds(toRecord);

  let serverDeletedTests: string[] = [];

  try {
    const res = await fetch('/api/tests/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: testId, code: testCode })
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.deletedTestIds)) {
        serverDeletedTests = data.deletedTestIds;
        recordDeletedTestIds(data.deletedTestIds);
      }
    }
  } catch (e) {
    console.warn('POST /api/tests/delete failed, fallback to DELETE', e);
  }

  // Fallback direct DELETE call
  try {
    const res2 = await fetch(`/api/tests/${encodeURIComponent(testId)}`, { method: 'DELETE' });
    if (res2.ok) {
      const data2 = await res2.json();
      if (Array.isArray(data2.deletedTestIds)) {
        recordDeletedTestIds(data2.deletedTestIds);
      }
    }
  } catch {}

  if (testCode) {
    try {
      await fetch(`/api/tests/${encodeURIComponent(testCode)}`, { method: 'DELETE' });
    } catch {}
  }

  return { success: true, deletedTestIds: serverDeletedTests };
}

/**
 * Fetches delivered test and questions from server or Firestore by 6-digit code or test ID.
 */
export async function fetchTestFromServer(codeOrId: string): Promise<{
  test: DeliveredTest;
  questions: Question[];
} | null> {
  if (isTestDeleted(codeOrId)) {
    return null;
  }

  // 1. Try Express backend server first
  try {
    const clean = encodeURIComponent(codeOrId.trim());
    const res = await fetch(`/api/tests/${clean}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.test && Array.isArray(data.questions)) {
        if (isTestDeleted(data.test.id) || (data.code && isTestDeleted(data.code))) {
          return null;
        }
        return {
          test: {
            ...data.test,
            code: data.code,
            questions: data.questions
          },
          questions: data.questions
        };
      }
    } else if (res.status === 404) {
      // Record as deleted so subsequent lookups don't linger
      recordDeletedTestIds([codeOrId]);
    }
  } catch (e) {
    console.warn('Error fetching test from server, trying Firestore cloud fallback', e);
  }

  // 2. Fallback: Try Firestore direct
  try {
    const cloudTest = await fetchDeliveredTestFromCloud(codeOrId);
    if (cloudTest) {
      if (isTestDeleted(cloudTest.test.id) || (cloudTest.test.code && isTestDeleted(cloudTest.test.code))) {
        return null;
      }
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
export async function fetchAllServerTests(): Promise<{
  tests: DeliveredTest[];
  deletedTestIds: string[];
}> {
  try {
    const res = await fetch('/api/tests');
    if (res.ok) {
      const data = await res.json();
      const serverDeletedTestIds: string[] = Array.isArray(data.deletedTestIds) ? data.deletedTestIds : [];
      if (serverDeletedTestIds.length > 0) {
        recordDeletedTestIds(serverDeletedTestIds);
      }
      const knownDeleted = getKnownDeletedTestIds();

      if (Array.isArray(data.tests)) {
        const tests = data.tests
          .map((item: any) => ({
            ...item.test,
            code: item.code
          }))
          .filter((t: DeliveredTest) => {
            if (isSampleTest(t)) return false;
            if (knownDeleted.has(t.id) || knownDeleted.has(t.id.toUpperCase())) return false;
            if (t.code && (knownDeleted.has(t.code) || knownDeleted.has(t.code.toUpperCase()))) return false;
            return true;
          });
        return { tests, deletedTestIds: Array.from(knownDeleted) };
      }
    }
  } catch (e) {
    console.warn('Failed to fetch server tests list', e);
  }
  return { tests: [], deletedTestIds: Array.from(getKnownDeletedTestIds()) };
}

/**
 * Bidirectional test sync:
 * Merges local tests (from primary + backup localStorage) with server tests.
 * If server is empty after a container reload, it rehydrates server from local cache.
 * Local tests are NEVER wiped by an empty server response.
 */
export async function syncDeliveredTestsWithServer(
  currentLocalTests?: DeliveredTest[]
): Promise<{ tests: DeliveredTest[]; deletedTestIds: string[] }> {
  const localBackup = getLocalTestsBackup();
  const knownDeleted = getKnownDeletedTestIds();

  // Combine all local knowledge
  const localMap = new Map<string, DeliveredTest>();
  [...localBackup, ...(currentLocalTests || [])].forEach(t => {
    if (t && t.id && !isSampleTest(t) && !knownDeleted.has(t.id) && !knownDeleted.has(t.id.toUpperCase())) {
      localMap.set(t.id, t);
    }
  });

  try {
    const serverResult = await fetchAllServerTests();
    const serverTests = serverResult.tests || [];

    // Merge: server tests + local tests that aren't on the server
    const mergedMap = new Map<string, DeliveredTest>(localMap);

    serverTests.forEach(st => {
      if (st && st.id && !knownDeleted.has(st.id) && !knownDeleted.has(st.id.toUpperCase())) {
        const existing = mergedMap.get(st.id);
        mergedMap.set(st.id, {
          ...existing,
          ...st,
          code: st.code || existing?.code,
          questions: (Array.isArray(st.questions) && st.questions.length > 0)
            ? st.questions
            : existing?.questions || []
        });
      }
    });

    const mergedList = Array.from(mergedMap.values());
    mergedList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Check if there are local tests that the server doesn't have yet
    const serverIdSet = new Set(serverTests.map(t => t.id));
    const missingOnServer = mergedList.filter(t => !serverIdSet.has(t.id));

    if (missingOnServer.length > 0) {
      // Rehydrate server in background
      fetch('/api/tests/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tests: missingOnServer })
      }).catch(err => console.warn('Background server tests rehydrate notice:', err));
    }

    // Persist merged tests to local backup
    if (mergedList.length > 0) {
      saveLocalTestsBackup(mergedList);
    }

    return { tests: mergedList, deletedTestIds: serverResult.deletedTestIds };
  } catch (err) {
    console.warn('Sync tests with server failed, using local backup:', err);
    const fallbackList = Array.from(localMap.values());
    return { tests: fallbackList, deletedTestIds: Array.from(knownDeleted) };
  }
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
  return `${origin}${pathname}?role=student#test=${compressed}`;
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
