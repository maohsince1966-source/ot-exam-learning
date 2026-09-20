import { Question, QuizAttemptResult } from '../types';
import { evaluateAnswer } from '../utils/categoryHelper';

export interface QuestionStudyRecord {
  questionId: string;
  totalAttempts: number;
  correctAttempts: number;
  incorrectAttempts: number;
  lastAttemptAt: string; // ISO date string
  lastIsCorrect: boolean;
  lastSelectedChoices?: number[];
}

export type StudyFilterType = 'all' | 'incorrect' | 'unattempted' | 'correct';

export const STORAGE_KEY_STUDY_RECORDS = 'ot_question_study_records';

/**
 * Load all question study records from localStorage
 */
export function getQuestionStudyRecords(): Record<string, QuestionStudyRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STUDY_RECORDS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.warn('Failed to parse question study records:', err);
  }
  return {};
}

/**
 * Save all question study records to localStorage and notify listeners
 */
export function saveQuestionStudyRecords(records: Record<string, QuestionStudyRecord>): void {
  try {
    localStorage.setItem(STORAGE_KEY_STUDY_RECORDS, JSON.stringify(records));
    // Dispatch custom window event so other components or tabs can re-render immediately
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('study_records_updated', { detail: records }));
    }
  } catch (err) {
    console.error('Failed to save question study records:', err);
  }
}

/**
 * Record a single question attempt (e.g. from 1-question practice or instant feedback)
 */
export function recordSingleQuestionAttempt(
  questionId: string,
  isCorrect: boolean,
  selectedChoices?: number[]
): QuestionStudyRecord {
  const records = getQuestionStudyRecords();
  const existing = records[questionId];

  const now = new Date().toISOString();
  const updated: QuestionStudyRecord = {
    questionId,
    totalAttempts: (existing?.totalAttempts || 0) + 1,
    correctAttempts: (existing?.correctAttempts || 0) + (isCorrect ? 1 : 0),
    incorrectAttempts: (existing?.incorrectAttempts || 0) + (isCorrect ? 0 : 1),
    lastAttemptAt: now,
    lastIsCorrect: isCorrect,
    lastSelectedChoices: selectedChoices
  };

  records[questionId] = updated;
  saveQuestionStudyRecords(records);
  return updated;
}

/**
 * Record an entire completed quiz attempt (from QuizRunner finish)
 */
export function recordQuizAttempt(
  result: QuizAttemptResult,
  questions: Question[]
): Record<string, QuestionStudyRecord> {
  const records = getQuestionStudyRecords();
  const questionMap = new Map(questions.map(q => [q.id, q]));
  const now = new Date().toISOString();

  const questionIds = result.questionIds && result.questionIds.length > 0
    ? result.questionIds
    : Object.keys(result.userAnswers || {});

  questionIds.forEach(qId => {
    const userChoices = result.userAnswers?.[qId] || [];
    const questionObj = questionMap.get(qId);
    
    // Evaluate correctness
    let isCorrect = false;
    if (questionObj) {
      isCorrect = evaluateAnswer(userChoices, questionObj.answer, questionObj.question).isCorrect;
    }

    const existing = records[qId];
    records[qId] = {
      questionId: qId,
      totalAttempts: (existing?.totalAttempts || 0) + 1,
      correctAttempts: (existing?.correctAttempts || 0) + (isCorrect ? 1 : 0),
      incorrectAttempts: (existing?.incorrectAttempts || 0) + (isCorrect ? 0 : 1),
      lastAttemptAt: now,
      lastIsCorrect: isCorrect,
      lastSelectedChoices: userChoices
    };
  });

  saveQuestionStudyRecords(records);
  return records;
}

/**
 * Synchronize and backfill question study records from quizHistory
 * Ensures any tests already taken in the past are automatically recognized.
 */
export function syncStudyRecordsFromHistory(
  quizHistory: QuizAttemptResult[],
  questions: Question[]
): Record<string, QuestionStudyRecord> {
  const records = getQuestionStudyRecords();
  if (!quizHistory || quizHistory.length === 0) return records;

  const questionMap = new Map(questions.map(q => [q.id, q]));
  let hasNew = false;

  // Process from oldest to newest so lastAttemptAt and lastIsCorrect reflect the latest attempt
  const sortedHistory = [...quizHistory].sort((a, b) => {
    const timeA = new Date(a.date).getTime() || 0;
    const timeB = new Date(b.date).getTime() || 0;
    return timeA - timeB;
  });

  sortedHistory.forEach(quiz => {
    const dateStr = quiz.date || new Date().toISOString();
    const qIds = quiz.questionIds || Object.keys(quiz.userAnswers || {});

    qIds.forEach(qId => {
      // If already recorded with an attempt, check if we need to initialize or sync
      const questionObj = questionMap.get(qId);
      if (!questionObj) return;

      const userChoices = quiz.userAnswers?.[qId] || [];
      const isCorrect = evaluateAnswer(userChoices, questionObj.answer, questionObj.question).isCorrect;

      const existing = records[qId];
      if (!existing) {
        records[qId] = {
          questionId: qId,
          totalAttempts: 1,
          correctAttempts: isCorrect ? 1 : 0,
          incorrectAttempts: isCorrect ? 0 : 1,
          lastAttemptAt: dateStr,
          lastIsCorrect: isCorrect,
          lastSelectedChoices: userChoices
        };
        hasNew = true;
      }
    });
  });

  if (hasNew) {
    saveQuestionStudyRecords(records);
  }

  return records;
}

/**
 * Determine the study status of a question:
 * - 'unattempted': Never answered yet
 * - 'incorrect': Most recently answered incorrectly (needs review)
 * - 'correct': Most recently answered correctly
 */
export function getQuestionStudyStatus(
  questionId: string,
  records: Record<string, QuestionStudyRecord>
): 'unattempted' | 'incorrect' | 'correct' {
  const rec = records[questionId];
  if (!rec || rec.totalAttempts === 0) {
    return 'unattempted';
  }
  return rec.lastIsCorrect ? 'correct' : 'incorrect';
}

/**
 * Compute learning statistics across a set of questions
 */
export function calculateStudyStats(
  questions: Question[],
  records: Record<string, QuestionStudyRecord>
) {
  const total = questions.length;
  let attempted = 0;
  let unattempted = 0;
  let incorrect = 0;
  let correct = 0;
  let totalAttemptsSum = 0;
  let correctAttemptsSum = 0;

  questions.forEach(q => {
    const rec = records[q.id];
    if (!rec || rec.totalAttempts === 0) {
      unattempted++;
    } else {
      attempted++;
      totalAttemptsSum += rec.totalAttempts;
      correctAttemptsSum += rec.correctAttempts;
      if (rec.lastIsCorrect) {
        correct++;
      } else {
        incorrect++;
      }
    }
  });

  const attemptedPercent = total > 0 ? Math.round((attempted / total) * 100) : 0;
  const accuracyPercent = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

  return {
    total,
    attempted,
    unattempted,
    incorrect,
    correct,
    attemptedPercent,
    accuracyPercent,
    totalAttemptsSum,
    correctAttemptsSum
  };
}

/**
 * Clear all study records (reset learning memory)
 */
export function clearAllStudyRecords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_STUDY_RECORDS);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('study_records_updated', { detail: {} }));
    }
  } catch (err) {
    console.error('Failed to clear study records:', err);
  }
}
