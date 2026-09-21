import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  onSnapshot,
  setDoc
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { DeliveredTest, Question, SubmissionRecord, isSampleQuestion, isSampleTest } from '../types';

const TESTS_COLLECTION = 'tests';
const SUBMISSIONS_COLLECTION = 'submissions';
const QUESTIONS_COLLECTION = 'questions';

/**
 * Fetch past questions from local API and Firestore
 */
export async function fetchQuestionsFromServer(): Promise<Question[]> {
  const map = new Map<string, Question>();

  // 1. Try local server API
  try {
    const res = await fetch('/api/questions');
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.questions)) {
        data.questions.forEach((q: any) => {
          if (q && q.id && !isSampleQuestion(q)) {
            map.set(q.id, q);
          }
        });
      }
    }
  } catch (err) {
    console.warn('Local API /api/questions fetch note:', err);
  }

  // 2. Fallback/Enrich with Firestore questions
  if (isFirebaseConfigured && db) {
    try {
      const snap = await getDocs(collection(db, QUESTIONS_COLLECTION));
      snap.forEach(d => {
        const q = d.data() as Question;
        if (q && q.id && !isSampleQuestion(q) && !map.has(q.id)) {
          map.set(q.id, q);
        }
      });
    } catch (err) {
      console.warn('Firestore questions fetch note:', err);
    }
  }

  return Array.from(map.values());
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

    tests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return tests;
  } catch (err) {
    console.error('Failed to fetch tests from Firestore:', err);
    return [];
  }
}

/**
 * Real-time subscription to tests in Firestore
 */
export function subscribeDeliveredTests(
  callback: (tests: DeliveredTest[]) => void
): () => void {
  if (!isFirebaseConfigured || !db) return () => {};

  try {
    return onSnapshot(
      collection(db, TESTS_COLLECTION),
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
        console.warn('Delivered tests subscription notice:', err);
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to delivered tests:', err);
    return () => {};
  }
}

/**
 * Fetch all delivered tests (combines local API and Firestore)
 */
export async function fetchDeliveredTests(): Promise<DeliveredTest[]> {
  const map = new Map<string, DeliveredTest>();

  // 1. Fetch from local server API
  try {
    const res = await fetch('/api/tests');
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.tests)) {
        data.tests.forEach((t: any) => {
          if (t && t.id && !isSampleTest(t)) {
            map.set(t.id, t);
          }
        });
      }
    }
  } catch (err) {
    console.warn('Local API /api/tests fetch note:', err);
  }

  // 2. Fetch from Firestore Cloud (crucial for standalone Render deployment)
  try {
    const cloudTests = await fetchDeliveredTestsFromCloud();
    cloudTests.forEach(t => {
      map.set(t.id, t);
    });
  } catch (err) {
    console.warn('Cloud tests fetch note:', err);
  }

  const list = Array.from(map.values());
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return list;
}

export const fetchAllServerTests = fetchDeliveredTests;

/**
 * Fetch test by 6-character code (checks local API and Firestore)
 */
export async function fetchTestFromServer(code: string): Promise<{ test: DeliveredTest; questions: Question[] } | null> {
  const cleanCode = code.trim().toUpperCase();

  // 1. Try local server API
  try {
    const res = await fetch(`/api/tests/${cleanCode}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.test) {
        return {
          test: {
            ...data.test,
            code: data.code || cleanCode,
            questions: data.questions || []
          },
          questions: data.questions || []
        };
      }
    }
  } catch (err) {
    console.warn('Local API test code fetch note:', err);
  }

  // 2. Search in Firestore Cloud
  if (isFirebaseConfigured && db) {
    try {
      // Query by code
      const q = query(collection(db, TESTS_COLLECTION), where('code', '==', cleanCode));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docData = snap.docs[0].data() as any;
        const testObj: DeliveredTest = {
          id: docData.id || snap.docs[0].id,
          code: docData.code || cleanCode,
          title: docData.title,
          category: docData.category,
          createdAt: docData.createdAt,
          questionIds: docData.questionIds || [],
          totalQuestions: docData.totalQuestions || 0,
          instructions: docData.instructions,
          questions: docData.questions,
          targetType: docData.targetType || 'all',
          targetGrades: docData.targetGrades,
          targetStudentIds: docData.targetStudentIds
        };
        return {
          test: testObj,
          questions: docData.questions || []
        };
      }

      // Fallback: Check if code is actually document ID
      const directDocRef = doc(db, TESTS_COLLECTION, cleanCode);
      const directDoc = await getDoc(directDocRef);
      if (directDoc.exists()) {
        const docData = directDoc.data() as any;
        const testObj: DeliveredTest = {
          id: directDoc.id,
          code: docData.code || cleanCode,
          title: docData.title,
          category: docData.category,
          createdAt: docData.createdAt,
          questionIds: docData.questionIds || [],
          totalQuestions: docData.totalQuestions || 0,
          instructions: docData.instructions,
          questions: docData.questions,
          targetType: docData.targetType || 'all',
          targetGrades: docData.targetGrades,
          targetStudentIds: docData.targetStudentIds
        };
        return {
          test: testObj,
          questions: docData.questions || []
        };
      }
    } catch (err) {
      console.warn('Firestore test code search note:', err);
    }
  }

  return null;
}

export async function fetchTestByCode(code: string): Promise<DeliveredTest | null> {
  const result = await fetchTestFromServer(code);
  if (!result) return null;
  return {
    ...result.test,
    questions: result.questions
  };
}

export function onNewDeliveredTest(callback: (test: DeliveredTest) => void): () => void {
  // 1. Storage event listener
  const handleStorage = (e: StorageEvent) => {
    if (e.key === 'ot_new_delivered_test' && e.newValue) {
      try {
        const test = JSON.parse(e.newValue);
        if (test && test.id) {
          callback(test);
        }
      } catch {}
    }
  };

  window.addEventListener('storage', handleStorage);

  // 2. Real-time Firestore subscription
  let unsubscribeFirestore = () => {};
  if (isFirebaseConfigured && db) {
    const knownIds = new Set<string>();
    let isInitial = true;

    unsubscribeFirestore = onSnapshot(collection(db, TESTS_COLLECTION), snapshot => {
      if (isInitial) {
        snapshot.forEach(d => knownIds.add(d.id));
        isInitial = false;
        return;
      }
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const data = change.doc.data() as any;
          if (!knownIds.has(change.doc.id)) {
            knownIds.add(change.doc.id);
            const item: DeliveredTest = {
              id: data.id || change.doc.id,
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
              callback(item);
            }
          }
        }
      });
    });
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    unsubscribeFirestore();
  };
}

/**
 * Submit test result (saves to local API and directly to Firestore)
 */
export async function submitQuizResult(record: SubmissionRecord): Promise<{ success: boolean; id: string; error?: string }> {
  let savedLocally = false;
  let savedToCloud = false;

  // 1. Try local server API
  try {
    const res = await fetch('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    if (res.ok) {
      savedLocally = true;
    }
  } catch (err: any) {
    console.warn('Local API submission note:', err);
  }

  // 2. Save directly to Firestore Cloud (guarantees teacher receives score on Render)
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, SUBMISSIONS_COLLECTION, record.id);
      await setDoc(docRef, record);
      savedToCloud = true;
    } catch (err) {
      console.warn('Firestore submission note:', err);
    }
  }

  if (savedLocally || savedToCloud) {
    return { success: true, id: record.id };
  }

  return { success: false, id: record.id, error: '送信に失敗しました（オフライン保存されました）' };
}

export async function submitTestResultToCloud(params: {
  testId: string;
  testTitle: string;
  studentName: string;
  studentId: string;
  score: number;
  total: number;
  scorePercent: number;
  passed: boolean;
  categoryStats: Record<string, { total: number; correct: number }>;
  userAnswers: Record<string, number[]>;
}): Promise<{ success: boolean; id: string; error?: string }> {
  const record: SubmissionRecord = {
    id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    testId: params.testId,
    testTitle: params.testTitle,
    studentName: params.studentName,
    studentId: params.studentId,
    score: params.score,
    total: params.total,
    scorePercent: params.scorePercent,
    passed: params.passed,
    categoryStats: params.categoryStats,
    userAnswers: params.userAnswers,
    submittedAt: new Date().toISOString()
  };

  return submitQuizResult(record);
}

export async function fetchStudentSubmissions(studentId: string): Promise<SubmissionRecord[]> {
  try {
    const cleanId = studentId.trim().toUpperCase();
    const res = await fetch(`/api/results/student/${cleanId}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.submissions)) {
        return data.submissions;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch student submissions:', err);
  }
  return [];
}
