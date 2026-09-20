import { DeliveredTest, Question, SubmissionRecord, isSampleQuestion, isSampleTest } from '../types';

export async function fetchQuestionsFromServer(): Promise<Question[]> {
  try {
    const res = await fetch('/api/questions');
    if (!res.ok) return [];
    const data = await res.json();
    if (data && Array.isArray(data.questions)) {
      return data.questions.filter((q: any) => q && q.id && !isSampleQuestion(q));
    }
  } catch (err) {
    console.warn('Failed to fetch questions from server API:', err);
  }
  return [];
}

export async function fetchAllServerTests(): Promise<DeliveredTest[]> {
  try {
    const res = await fetch('/api/tests');
    if (!res.ok) return [];
    const data = await res.json();
    if (data && Array.isArray(data.tests)) {
      return data.tests.filter((t: any) => !isSampleTest(t));
    }
  } catch (err) {
    console.warn('Failed to fetch tests from server API:', err);
  }
  return [];
}

export const fetchDeliveredTests = fetchAllServerTests;

export async function fetchTestFromServer(code: string): Promise<{ test: DeliveredTest; questions: Question[] } | null> {
  try {
    const cleanCode = code.trim().toUpperCase();
    const res = await fetch(`/api/tests/${cleanCode}`);
    if (!res.ok) return null;
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
  } catch (err) {
    console.warn('Failed to fetch test by code from server API:', err);
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
  // Listen to broadcast channel or storage events when a new test arrives
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
  return () => {
    window.removeEventListener('storage', handleStorage);
  };
}

export async function submitQuizResult(record: SubmissionRecord): Promise<{ success: boolean; id: string; error?: string }> {
  try {
    const res = await fetch('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, id: data.submissionId || record.id };
    }
  } catch (err: any) {
    console.warn('Failed to submit result to server API:', err);
    return { success: false, id: record.id, error: err?.message || '送信エラー' };
  }
  return { success: false, id: record.id, error: '送信に失敗しました' };
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
