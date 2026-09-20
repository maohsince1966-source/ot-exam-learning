export interface Question {
  id: string; // e.g. "61-AM-001" (実施回-午前/午後-問題番号)
  year: number | string; // e.g. 2026 or 61
  category: string; // e.g. "解剖学（神経系）", "身体障害作業療法学（脳卒中）", etc.
  majorCategory?: string; // 大項目
  subCategory?: string; // 中項目（）内の指定
  question: string; // 問題文
  choices: [string, string, string, string, string]; // 選択肢1〜5
  answer: number | number[]; // 1〜5、または複数正答 [1, 3]
  explanation: string; // 解説文
  imageUrl?: string; // 問題画像のURL (空欄可)
}

export interface DeliveredTest {
  id: string;
  code?: string; // Short 6-character code (e.g. "K9X2P4")
  title: string;
  category?: string;
  createdAt: string; // ISO string
  questionIds: string[];
  totalQuestions: number;
  instructions?: string;
  questions?: Question[];
  targetType?: 'all' | 'grade' | 'individual';
  targetGrades?: number[];
  targetStudentIds?: string[];
}

export interface StudentLocalProfile {
  studentId: string; // 学籍番号 (必須)
  grade: number; // 学年 (1〜4)
  name?: string; // 氏名 (任意)
}

export interface QuizAttemptResult {
  id: string;
  testId?: string;
  testTitle: string;
  date: string;
  totalQuestions: number;
  correctCount: number;
  scorePercent: number;
  categoryStats: Record<string, { total: number; correct: number }>;
  userAnswers: Record<string, number[]>;
  questionIds: string[];
  studentId?: string;
  grade?: number;
}

export interface SubmissionRecord {
  id: string;
  testId: string;
  testCode?: string;
  testTitle: string;
  studentName: string;
  studentId: string;
  grade?: number;
  score: number;
  total: number;
  scorePercent: number;
  passed: boolean;
  timeSpentSeconds?: number;
  categoryStats: Record<string, { total: number; correct: number }>;
  userAnswers: Record<string, number[]>;
  submittedAt: string;
}

export const SAMPLE_QUESTION_IDS = new Set<string>([
  '50-PM-021', '61-AM-028', '48-PM-021', '59-PM-001', '46-PM-022',
  '61-PM-001', '49-PM-029', '42-AM-001', '44-AM-041', '49-PM-003'
]);

export function isSampleQuestion(q: { id?: string }): boolean {
  return Boolean(q && q.id && SAMPLE_QUESTION_IDS.has(q.id));
}

export function isSampleTest(t: { id?: string; code?: string }): boolean {
  if (!t) return false;
  if (t.id === 'test-1789208024231' || t.code === 'XCFTZL') return true;
  return false;
}
