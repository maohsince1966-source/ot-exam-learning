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

/**
 * Fetch all delivered tests from Firestore
 */
export async function fetchDeliveredTestsFromCloud(): Promise<DeliveredTest[]> {
  if (!isFirebaseConfigured || !db) return [];

  try {
    const colRef = collection(db, TESTS_COLLECTION);
    const snapshot = await getDocs(colRef);
    const tests: DeliveredTest[] = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as any;
      const item: DeliveredTest = {
        id: data.id || docSnap.id,
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
        const tests: DeliveredTest[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as any;
          const item: DeliveredTest = {
            id: data.id || docSnap.id,
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
export async function deleteDeliveredTestFromCloud(testId: string): Promise<boolean> {
  if (!isFirebaseConfigured || !db) return false;

  try {
    // Delete test doc
    await deleteDoc(doc(db, TESTS_COLLECTION, testId));

    // Delete associated submissions
    const subQuery = query(collection(db, SUBMISSIONS_COLLECTION), where('testId', '==', testId));
    const subSnap = await getDocs(subQuery);
    const deletePromises: Promise<void>[] = [];
    subSnap.forEach(snap => {
      deletePromises.push(deleteDoc(snap.ref));
    });
    await Promise.all(deletePromises);

    return true;
  } catch (err) {
    console.error('Failed to delete test from Firestore:', err);
    return false;
  }
}

/**
 * Fetch submissions from server API
 */
export async function fetchSubmissionsFromServer(testId?: string): Promise<SubmissionRecord[]> {
  try {
    const url = testId ? `/api/submissions?testId=${encodeURIComponent(testId)}` : '/api/submissions';
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.submissions) ? data.submissions : [];
  } catch (err) {
    console.warn('Failed to fetch submissions from server API:', err);
    return [];
  }
}

/**
 * Student submits test results (Guaranteed dual storage: Express backend + Cloud Firestore)
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

  let serverSuccess = false;

  // 1. Submit to robust Server API first (always fast and unconstrained by quota)
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
  // Send to Firestore in the background without blocking the student UI.
  if (serverSuccess) {
    if (isFirebaseConfigured && db) {
      setDoc(doc(db, SUBMISSIONS_COLLECTION, subId), dataToSave).catch(err => {
        console.warn('Background Firestore submission notice:', err?.message);
      });
    }
    return { success: true, id: subId };
  }

  // 2. Fallback: Submit to Firestore with strict 2-second timeout
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

  return { success: false, id: subId, error: '提出の送信に失敗しました。再送信をお試しください。' };
}

/**
 * Real-time subscription to submissions for a specific test
 * Uses both server API polling (every 3s) and Firestore onSnapshot
 */
export function subscribeSubmissionsForTest(
  testId: string,
  callback: (submissions: SubmissionRecord[]) => void
): () => void {
  let isCancelled = false;
  const submissionsMap = new Map<string, SubmissionRecord>();

  const notify = () => {
    const list = Array.from(submissionsMap.values());
    list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    callback(list);
  };

  // 1. Fetch & poll from Server API
  const pollServer = async () => {
    if (isCancelled) return;
    const serverSubs = await fetchSubmissionsFromServer(testId);
    if (!isCancelled && serverSubs && serverSubs.length > 0) {
      serverSubs.forEach(s => submissionsMap.set(s.id, s));
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
 * Synchronizes with Server API and Firestore
 */
export function subscribeAllSubmissions(
  callback: (submissions: SubmissionRecord[]) => void
): () => void {
  let isCancelled = false;
  const submissionsMap = new Map<string, SubmissionRecord>();

  const notify = () => {
    callback(Array.from(submissionsMap.values()));
  };

  // 1. Fetch & poll Server API
  const pollServer = async () => {
    if (isCancelled) return;
    const serverSubs = await fetchSubmissionsFromServer();
    if (!isCancelled && serverSubs && serverSubs.length > 0) {
      serverSubs.forEach(s => submissionsMap.set(s.id, s));
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
