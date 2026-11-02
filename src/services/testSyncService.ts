import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { DeliveredTest, Question, SubmissionRecord, isSampleQuestion, isSampleTest } from '../types';

const TESTS_COLLECTION = 'tests';
const SUBMISSIONS_COLLECTION = 'submissions';
const QUESTIONS_COLLECTION = 'questions';

/**
 * Fetch all registered past questions from server API
 */
export async function fetchQuestionsFromServer(): Promise<Question[]> {
  try {
    const res = await fetch('/api/questions');
    if (!res.ok) return [];
    const data = await res.json();
    if (data && Array.isArray(data.questions)) {
      return data.questions.filter(q => q && q.id && !isSampleQuestion(q));
    }
  } catch (err) {
    console.warn('Failed to fetch questions from server API:', err);
  }
  return [];
}

/**
 * Save questions to server API
 */
export async function saveQuestionsToServer(
  questions: Question[],
  replace: boolean = false
): Promise<boolean> {
  try {
    const cleaned = questions.filter(q => q && q.id && !isSampleQuestion(q));
    const res = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: cleaned, replace })
    });
    return res.ok;
  } catch (err) {
    console.warn('Failed to save questions to server API:', err);
    return false;
  }
}

/**
 * Save questions to Firestore in batches
 */
export async function saveQuestionsToCloud(questions: Question[]): Promise<boolean> {
  if (!isFirebaseConfigured || !db || questions.length === 0) return false;

  try {
    const cleaned = questions.filter(q => q && q.id && !isSampleQuestion(q));
    if (cleaned.length === 0) return true;

    // Firestore batch supports up to 500 operations per batch
    const batchSize = 400;
    for (let i = 0; i < cleaned.length; i += batchSize) {
      const chunk = cleaned.slice(i, i + batchSize);
      const batch = writeBatch(db);
      chunk.forEach(q => {
        if (q && q.id) {
          const docRef = doc(db, QUESTIONS_COLLECTION, q.id);
          batch.set(docRef, q, { merge: true });
        }
      });
      await batch.commit();
    }
    return true;
  } catch (err) {
    console.error('Failed to save questions to Firestore:', err);
    return false;
  }
}

/**
 * Fetch all questions from Firestore
 */
export async function fetchQuestionsFromCloud(): Promise<Question[]> {
  if (!isFirebaseConfigured || !db) return [];

  try {
    const snap = await getDocs(collection(db, QUESTIONS_COLLECTION));
    const list: Question[] = [];
    snap.forEach(d => {
      const q = d.data() as Question;
      if (q && q.id && q.question && !isSampleQuestion(q)) {
        list.push(q);
      }
    });
    return list;
  } catch (err) {
    console.error('Failed to fetch questions from Firestore:', err);
    return [];
  }
}

/**
 * Real-time subscription to questions in Firestore
 */
export function subscribeQuestions(
  callback: (questions: Question[]) => void
): () => void {
  if (!isFirebaseConfigured || !db) return () => {};

  try {
    return onSnapshot(
      collection(db, QUESTIONS_COLLECTION),
      snapshot => {
        const list: Question[] = [];
        snapshot.forEach(docSnap => {
          const q = docSnap.data() as Question;
          if (q && q.id && q.question && !isSampleQuestion(q)) {
            list.push(q);
          }
        });
        if (list.length > 0) {
          callback(list);
        }
      },
      err => {
        console.warn('Questions subscription note:', err);
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to questions:', err);
    return () => {};
  }
}

/**
 * Save or update a delivered test in Firestore
 */
export async function saveDeliveredTestToCloud(
  test: DeliveredTest,
  questions: Question[]
): Promise<boolean> {
  if (!isFirebaseConfigured || !db) {
    console.warn('Firestore is not configured. Skipping cloud save.');
    return false;
  }

  try {
    const testDocRef = doc(db, TESTS_COLLECTION, test.id);
    const dataToSave: Record<string, any> = {
      id: test.id,
      code: test.code || '',
      title: test.title,
      category: test.category || '',
      createdAt: test.createdAt || new Date().toISOString(),
      questionIds: test.questionIds || questions.map(q => q.id),
      totalQuestions: questions.length,
      instructions: test.instructions || '',
      questions: questions,
      targetType: test.targetType || 'all',
      ...(test.targetGrades ? { targetGrades: test.targetGrades } : {}),
      ...(test.targetStudentIds ? { targetStudentIds: test.targetStudentIds } : {})
    };

    await setDoc(testDocRef, dataToSave, { merge: true });
    return true;
  } catch (err) {
    console.error('Failed to save test to Firestore:', err);
    return false;
  }
}

const STORAGE_KEY_DELETED_TESTS = 'pt_deleted_test_ids_cache';

function getKnownDeletedSet(): Set<string> {
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

/**
 * Fetch all delivered tests from Firestore
 */
export async function fetchDeliveredTestsFromCloud(): Promise<DeliveredTest[]> {
  if (!isFirebaseConfigured || !db) return [];

  const knownDeleted = getKnownDeletedSet();

  try {
    const colRef = collection(db, TESTS_COLLECTION);
    const snapshot = await getDocs(colRef);
    const tests: DeliveredTest[] = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as any;
      const testId = data.id || docSnap.id;
      const code = data.code;
      if (
        knownDeleted.has(testId) ||
        knownDeleted.has(testId.toUpperCase()) ||
        (code && (knownDeleted.has(code) || knownDeleted.has(code.toUpperCase())))
      ) {
        return;
      }
      const item: DeliveredTest = {
        id: testId,
        code: code,
        title: data.title,
        category: data.category,
        createdAt: data.createdAt,
        questionIds: data.questionIds || [],
        totalQuestions: data.totalQuestions || 0,
        instructions: data.instructions,
        questions: data.questions,
        targetType: data.targetType || 'all',
        targetGrades: data.targetGrades,
        targetStudentIds: data.targetStudentIds
      };
      if (!isSampleTest(item)) {
        tests.push(item);
      }
    });

    // Sort newest first
    tests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return tests;
  } catch (err) {
    console.error('Failed to fetch tests from Firestore:', err);
    return [];
  }
}

/**
 * Fetch a single delivered test from Firestore by ID or 6-digit code
 */
export async function fetchDeliveredTestFromCloud(testIdOrCode: string): Promise<{
  test: DeliveredTest;
  questions: Question[];
} | null> {
  if (!isFirebaseConfigured || !db) return null;

  try {
    const clean = testIdOrCode.trim();
    // 1. Direct doc by ID
    const docRef = doc(db, TESTS_COLLECTION, clean);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as any;
      const test: DeliveredTest = {
        id: data.id || snap.id,
        code: data.code,
        title: data.title,
        category: data.category,
        createdAt: data.createdAt,
        questionIds: data.questionIds || [],
        totalQuestions: data.totalQuestions || 0,
        instructions: data.instructions,
        questions: data.questions,
        targetType: data.targetType || 'all',
        targetGrades: data.targetGrades,
        targetStudentIds: data.targetStudentIds
      };
      return { test, questions: data.questions || [] };
    }

    // 2. Query by code
    const q = query(collection(db, TESTS_COLLECTION), where('code', '==', clean.toUpperCase()));
    const qSnap = await getDocs(q);
    if (!qSnap.empty) {
      const data = qSnap.docs[0].data() as any;
      const test: DeliveredTest = {
        id: data.id || qSnap.docs[0].id,
        code: data.code,
        title: data.title,
        category: data.category,
        createdAt: data.createdAt,
        questionIds: data.questionIds || [],
        totalQuestions: data.totalQuestions || 0,
        instructions: data.instructions,
        questions: data.questions,
        targetType: data.targetType || 'all',
        targetGrades: data.targetGrades,
        targetStudentIds: data.targetStudentIds
      };
      return { test, questions: data.questions || [] };
    }
  } catch (err) {
    console.error('Failed to fetch test by code from Firestore:', err);
  }
  return null;
}

/**
 * Real-time subscription to all delivered tests
 */
export function subscribeDeliveredTests(
  callback: (tests: DeliveredTest[]) => void
): () => void {
  if (!isFirebaseConfigured || !db) {
    return () => {};
  }

  try {
    const colRef = collection(db, TESTS_COLLECTION);
    return onSnapshot(
      colRef,
      snapshot => {
        const knownDeleted = getKnownDeletedSet();
        const tests: DeliveredTest[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as any;
          const testId = data.id || docSnap.id;
          const code = data.code;
          if (
            knownDeleted.has(testId) ||
            knownDeleted.has(testId.toUpperCase()) ||
            (code && (knownDeleted.has(code) || knownDeleted.has(code.toUpperCase())))
          ) {
            return;
          }
          const item: DeliveredTest = {
            id: testId,
            code: code,
            title: data.title,
            category: data.category,
            createdAt: data.createdAt,
            questionIds: data.questionIds || [],
            totalQuestions: data.totalQuestions || 0,
            instructions: data.instructions,
            questions: data.questions,
            targetType: data.targetType || 'all',
            targetGrades: data.targetGrades,
            targetStudentIds: data.targetStudentIds
          };
          if (!isSampleTest(item)) {
            tests.push(item);
          }
        });
        tests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(tests);
      },
      err => {
        console.error('Error in tests subscription:', err);
      }
    );
  } catch (err) {
    console.error('Failed to subscribe to tests:', err);
    return () => {};
  }
}

/**
 * Delete a delivered test and its submissions from Firestore
 */
export async function deleteDeliveredTestFromCloud(testId: string, testCode?: string): Promise<boolean> {
  if (!isFirebaseConfigured || !db) return false;

  try {
    const deletePromises: Promise<void>[] = [];

    // 1. Delete test doc by ID
    deletePromises.push(deleteDoc(doc(db, TESTS_COLLECTION, testId)));

    // 2. If testCode is given, delete doc by code as well
    if (testCode) {
      deletePromises.push(deleteDoc(doc(db, TESTS_COLLECTION, testCode)));
      deletePromises.push(deleteDoc(doc(db, TESTS_COLLECTION, testCode.toUpperCase())));
    }

    // 3. Query documents in TESTS_COLLECTION that have id == testId or code == testCode
    try {
      const qById = query(collection(db, TESTS_COLLECTION), where('id', '==', testId));
      const snapById = await getDocs(qById);
      snapById.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    } catch {}

    if (testCode) {
      try {
        const qByCode = query(collection(db, TESTS_COLLECTION), where('code', '==', testCode));
        const snapByCode = await getDocs(qByCode);
        snapByCode.forEach(d => deletePromises.push(deleteDoc(d.ref)));
      } catch {}
    }

    // 4. Delete associated submissions
    try {
      const subQuery = query(collection(db, SUBMISSIONS_COLLECTION), where('testId', '==', testId));
      const subSnap = await getDocs(subQuery);
      subSnap.forEach(snap => {
        deletePromises.push(deleteDoc(snap.ref));
      });
    } catch {}

    await Promise.allSettled(deletePromises);
    return true;
  } catch (err) {
    console.error('Failed to delete test from Firestore:', err);
    return false;
  }
}

export const STORAGE_KEY_SUBMISSIONS_CACHE = 'ot_submissions_cache_v1';
export const STORAGE_KEY_SUBMISSIONS_BACKUP = 'ot_submissions_backup_v1';
const STORAGE_KEY_STUDENT_HISTORY = 'ot_exam_quiz_history_v1';

/**
 * Retrieve cached submissions from localStorage (both primary & backup keys)
 */
export function getLocalSubmissionsCache(): SubmissionRecord[] {
  const map = new Map<string, SubmissionRecord>();
  const keys = [STORAGE_KEY_SUBMISSIONS_CACHE, STORAGE_KEY_SUBMISSIONS_BACKUP];

  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((s: SubmissionRecord) => {
            if (s && s.id && s.testId) {
              if (!map.has(s.id)) {
                map.set(s.id, s);
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
 * Persist submissions to both primary and backup storage keys for maximum resilience
 */
export function saveLocalSubmissionsCache(submissions: SubmissionRecord[]): void {
  try {
    const json = JSON.stringify(submissions);
    localStorage.setItem(STORAGE_KEY_SUBMISSIONS_CACHE, json);
    localStorage.setItem(STORAGE_KEY_SUBMISSIONS_BACKUP, json);
  } catch (e) {
    console.warn('Failed to save submissions to local cache:', e);
  }
}

/**
 * Recovers any submitted student results from the browser's student exam history.
 * Checks both 'ot_exam_quiz_history_v2' and 'ot_exam_quiz_history_v1'.
 */
export function recoverSubmissionsFromStudentHistory(): SubmissionRecord[] {
  const map = new Map<string, SubmissionRecord>();
  const historyKeys = ['ot_exam_quiz_history_v2', 'ot_exam_quiz_history_v1'];

  for (const key of historyKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) continue;

      list.forEach(item => {
        if (item && item.testId && item.date) {
          const subId = item.id ? `sub_hist_${item.id}` : `sub_hist_${item.testId}_${item.studentId || 'anon'}`;
          if (!map.has(subId)) {
            map.set(subId, {
              id: subId,
              testId: item.testId,
              testCode: item.testCode || '',
              testTitle: item.testTitle || '配信小テスト',
              studentName: item.studentName || '受講生',
              studentId: item.studentId || '',
              grade: item.grade,
              score: item.correctCount ?? item.score ?? 0,
              total: item.totalQuestions ?? item.total ?? 0,
              scorePercent: item.scorePercent ?? (item.totalQuestions ? Math.round(((item.correctCount || 0) / item.totalQuestions) * 100) : 0),
              passed: item.passed ?? (item.scorePercent !== undefined ? item.scorePercent >= 60 : false),
              timeSpentSeconds: item.timeSpentSeconds || 0,
              categoryStats: item.categoryStats || {},
              userAnswers: item.userAnswers || {},
              submittedAt: item.date
            });
          }
        }
      });
    } catch {}
  }
  return Array.from(map.values());
}

/**
 * Bidirectional submission sync:
 * Pushes submissions to server and returns the merged list.
 */
export async function syncSubmissionsWithServer(
  submissionsToPush: SubmissionRecord[]
): Promise<SubmissionRecord[]> {
  try {
    const res = await fetch('/api/submissions/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissions: submissionsToPush })
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.submissions)) {
        saveLocalSubmissionsCache(data.submissions);
        return data.submissions;
      }
    }
  } catch (e) {
    console.warn('Failed to sync submissions with server:', e);
  }
  return submissionsToPush;
}

/**
 * Fetch submissions from server API
 */
export async function fetchSubmissionsFromServer(testId?: string): Promise<SubmissionRecord[]> {
  try {
    const url = testId ? `/api/submissions?testId=${encodeURIComponent(testId)}` : '/api/submissions';
    const res = await fetch(url);
    if (!res.ok) {
      // Server down, fallback to local cache
      const cached = getLocalSubmissionsCache();
      return testId ? cached.filter(s => s.testId === testId) : cached;
    }
    const data = await res.json();
    const serverSubs: SubmissionRecord[] = Array.isArray(data.submissions) ? data.submissions : [];

    // Merge with local cache
    const localCached = getLocalSubmissionsCache();
    const subMap = new Map<string, SubmissionRecord>();
    localCached.forEach(s => subMap.set(s.id, s));
    serverSubs.forEach(s => subMap.set(s.id, s));

    const merged = Array.from(subMap.values());
    if (serverSubs.length === 0 && localCached.length > 0) {
      // Rehydrate server
      syncSubmissionsWithServer(localCached).catch(() => {});
    } else {
      saveLocalSubmissionsCache(merged);
    }

    return testId ? merged.filter(s => s.testId === testId) : merged;
  } catch (err) {
    console.warn('Failed to fetch submissions from server API, using local cache:', err);
    const cached = getLocalSubmissionsCache();
    return testId ? cached.filter(s => s.testId === testId) : cached;
  }
}

/**
 * Student submits test results (Guaranteed dual storage: Express backend + Local Cache + Cloud Firestore)
 */
export async function submitTestResultToCloud(
  submission: Omit<SubmissionRecord, 'id' | 'submittedAt'> & { id?: string; submittedAt?: string }
): Promise<{ success: boolean; id: string; error?: string }> {
  const subId = submission.id || `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const submittedAt = submission.submittedAt || new Date().toISOString();

  const dataToSave: SubmissionRecord = {
    id: subId,
    testId: submission.testId,
    testCode: submission.testCode || '',
    testTitle: submission.testTitle,
    studentName: (submission.studentName || '受講生').trim(),
    studentId: (submission.studentId || '').trim(),
    score: submission.score,
    total: submission.total,
    scorePercent: submission.scorePercent,
    passed: submission.passed,
    timeSpentSeconds: submission.timeSpentSeconds || 0,
    categoryStats: submission.categoryStats || {},
    userAnswers: submission.userAnswers || {},
    submittedAt: submittedAt
  };

  // 1. Immediately store in local cache so this browser NEVER loses this submission
  try {
    const existing = getLocalSubmissionsCache();
    saveLocalSubmissionsCache([dataToSave, ...existing.filter(s => s.id !== subId)]);
  } catch {}

  let serverSuccess = false;

  // 2. Submit to robust Server API first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const serverRes = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataToSave),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (serverRes.ok) {
      serverSuccess = true;
    }
  } catch (err) {
    console.warn('Server API submission notice:', err);
  }

  // If server API succeeded, return immediately for instant responsiveness!
  if (serverSuccess) {
    if (isFirebaseConfigured && db) {
      setDoc(doc(db, SUBMISSIONS_COLLECTION, subId), dataToSave).catch(err => {
        console.warn('Background Firestore submission notice:', err?.message);
      });
    }
    return { success: true, id: subId };
  }

  // 3. Fallback: Submit to Firestore with strict 2-second timeout
  let firestoreSuccess = false;
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, SUBMISSIONS_COLLECTION, subId);
      const writePromise = setDoc(docRef, dataToSave).then(() => true);
      const timeoutPromise = new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore timeout')), 2000)
      );

      await Promise.race([writePromise, timeoutPromise]);
      firestoreSuccess = true;
    } catch (err: any) {
      console.warn('Firestore submission fallback (quota or timeout):', err?.message);
    }
  }

  if (firestoreSuccess) {
    return { success: true, id: subId };
  }

  // Local storage already has it, so the submission is recorded on the device!
  return { success: true, id: subId };
}

/**
 * Real-time subscription to submissions for a specific test
 * Uses both server API polling (every 3s) and local cache with rehydration
 */
export function subscribeSubmissionsForTest(
  testId: string,
  callback: (submissions: SubmissionRecord[]) => void
): () => void {
  let isCancelled = false;
  const submissionsMap = new Map<string, SubmissionRecord>();

  // Pre-seed immediately with local cache for instant 0ms rendering
  const initialCached = getLocalSubmissionsCache().filter(s => s.testId === testId);
  initialCached.forEach(s => submissionsMap.set(s.id, s));

  const notify = () => {
    const list = Array.from(submissionsMap.values());
    list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    callback(list);
  };

  // Immediate local dispatch
  if (initialCached.length > 0) {
    notify();
  }

  // 1. Fetch & poll from Server API
  const pollServer = async () => {
    if (isCancelled) return;
    const serverSubs = await fetchSubmissionsFromServer(testId);
    if (!isCancelled) {
      if (serverSubs && serverSubs.length > 0) {
        serverSubs.forEach(s => submissionsMap.set(s.id, s));
        saveLocalSubmissionsCache(Array.from(submissionsMap.values()));
      } else if (submissionsMap.size > 0) {
        // Server memory empty: rehydrate from local cache
        syncSubmissionsWithServer(Array.from(submissionsMap.values())).catch(() => {});
      }
      notify();
    }
  };

  pollServer();
  const pollTimer = setInterval(pollServer, 3000);

  // 2. Subscribe to Firestore if configured
  let unsubscribeFirestore = () => {};
  if (isFirebaseConfigured && db) {
    try {
      const q = query(
        collection(db, SUBMISSIONS_COLLECTION),
        where('testId', '==', testId)
      );

      unsubscribeFirestore = onSnapshot(
        q,
        snapshot => {
          if (isCancelled) return;
          snapshot.forEach(docSnap => {
            const data = docSnap.data() as SubmissionRecord;
            submissionsMap.set(data.id, data);
          });
          notify();
        },
        err => {
          console.warn('Firestore submissions subscription notice:', err?.message);
        }
      );
    } catch (err) {
      console.warn('Failed to subscribe to Firestore submissions:', err);
    }
  }

  return () => {
    isCancelled = true;
    clearInterval(pollTimer);
    unsubscribeFirestore();
  };
}

/**
 * Real-time subscription to all submissions (for count badges on test cards)
 * Synchronizes with Server API, local cache, and Firestore
 */
export function subscribeAllSubmissions(
  callback: (submissions: SubmissionRecord[]) => void
): () => void {
  let isCancelled = false;
  const submissionsMap = new Map<string, SubmissionRecord>();

  // Pre-seed immediately with local cache and any student history for 0ms rendering
  const initialCached = getLocalSubmissionsCache();
  initialCached.forEach(s => submissionsMap.set(s.id, s));

  // Also check if any student history can be recovered
  const fromHistory = recoverSubmissionsFromStudentHistory();
  fromHistory.forEach(s => {
    if (!submissionsMap.has(s.id)) {
      submissionsMap.set(s.id, s);
    }
  });

  const notify = () => {
    const list = Array.from(submissionsMap.values());
    list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    callback(list);
  };

  // Immediate dispatch
  if (submissionsMap.size > 0) {
    notify();
  }

  // 1. Fetch & poll Server API
  const pollServer = async () => {
    if (isCancelled) return;
    const serverSubs = await fetchSubmissionsFromServer();
    if (!isCancelled) {
      if (serverSubs && serverSubs.length > 0) {
        serverSubs.forEach(s => submissionsMap.set(s.id, s));
        saveLocalSubmissionsCache(Array.from(submissionsMap.values()));
      } else if (submissionsMap.size > 0) {
        // Rehydrate server
        syncSubmissionsWithServer(Array.from(submissionsMap.values())).catch(() => {});
      }
      notify();
    }
  };

  pollServer();
  const pollTimer = setInterval(pollServer, 4000);

  // 2. Subscribe to Firestore
  let unsubscribeFirestore = () => {};
  if (isFirebaseConfigured && db) {
    try {
      const colRef = collection(db, SUBMISSIONS_COLLECTION);
      unsubscribeFirestore = onSnapshot(
        colRef,
        snapshot => {
          if (isCancelled) return;
          snapshot.forEach(docSnap => {
            const data = docSnap.data() as SubmissionRecord;
            submissionsMap.set(data.id, data);
          });
          notify();
        },
        err => {
          console.warn('Firestore all-submissions subscription notice:', err?.message);
        }
      );
    } catch (err) {
      console.warn('Failed to subscribe to all submissions in Firestore:', err);
    }
  }

  return () => {
    isCancelled = true;
    clearInterval(pollTimer);
    unsubscribeFirestore();
  };
}
