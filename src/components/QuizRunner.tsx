import React, { useState } from 'react';
import { Question, QuizAttemptResult } from '../types';
import { 
  CheckCircle, 
  CheckCircle2,
  XCircle, 
  ArrowLeft, 
  ArrowRight, 
  RotateCcw, 
  Trophy, 
  FileText, 
  HelpCircle, 
  Image as ImageIcon,
  AlertCircle,
  Home,
  Check,
  Info,
  X,
  User,
  Send,
  Loader2
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  evaluateAnswer, 
  isPickTwoQuestion, 
  formatAnswerDisplay, 
  normalizeAnswer 
} from '../utils/categoryHelper';
import { QuestionImage } from './QuestionImage';
import { submitTestResultToCloud } from '../services/testSyncService';
import { getStudentProfile, saveStudentProfile } from '../services/studentRosterService';
import { recordSingleQuestionAttempt, recordQuizAttempt } from '../services/studentStudyHistoryService';

interface QuizRunnerProps {
  questions: Question[];
  title: string;
  testId?: string;
  instantExplanationDefault?: boolean;
  onFinish: (result: QuizAttemptResult) => void;
  onExit: () => void;
  initialSubmitted?: boolean;
  initialUserAnswers?: Record<string, number[]>;
  initialSubmissionStatus?: 'idle' | 'submitting' | 'submitted' | 'error';
  isReviewMode?: boolean;
}

export const QuizRunner: React.FC<QuizRunnerProps> = ({
  questions,
  title,
  testId,
  instantExplanationDefault = false,
  onFinish,
  onExit,
  initialSubmitted = false,
  initialUserAnswers = {},
  initialSubmissionStatus = 'idle',
  isReviewMode = false
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  // userAnswers stores selected choice numbers array for each questionId: e.g. { '61-AM-001': [1, 3] }
  const [userAnswers, setUserAnswers] = useState<Record<string, number[]>>(initialUserAnswers || {});
  const [revealedExplanations, setRevealedExplanations] = useState<Record<string, boolean>>({});
  const [isSubmitted, setIsSubmitted] = useState(initialSubmitted);
  const [instantExplanation, setInstantExplanation] = useState(instantExplanationDefault);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'wrong'>('all');
  const [showQuestionsDrawer, setShowQuestionsDrawer] = useState(false);
  const [showIncompleteConfirmModal, setShowIncompleteConfirmModal] = useState(false);

  // Student Identity & Cloud Submission states
  const [studentName, setStudentName] = useState(() => {
    const p = getStudentProfile();
    if (p?.name) return p.name;
    try {
      return localStorage.getItem('ot_student_name') || '';
    } catch {
      return '';
    }
  });
  const [studentId, setStudentId] = useState(() => {
    const p = getStudentProfile();
    if (p?.studentId) return p.studentId;
    try {
      return localStorage.getItem('ot_student_id') || '';
    } catch {
      return '';
    }
  });
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'submitting' | 'submitted' | 'error'>(
    initialSubmissionStatus !== 'idle' ? initialSubmissionStatus : (testId && initialSubmitted ? 'submitted' : 'idle')
  );
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const currentQ = questions[currentIndex];
  const selectedChoices = currentQ ? (userAnswers[currentQ.id] || []) : [];
  const currentIsPickTwo = currentQ ? isPickTwoQuestion(currentQ.question, currentQ.answer) : false;
  const isRevealed = currentQ ? (isSubmitted || Boolean(revealedExplanations[currentQ.id])) : false;

  // Handle choice selection (supports both 1-choice and "2つ選べ")
  const handleSelectChoice = (choiceNum: number) => {
    if (isSubmitted || !currentQ) return;

    if (currentIsPickTwo) {
      // Pick two mode: toggle logic
      setUserAnswers(prev => {
        const currentList = prev[currentQ.id] || [];
        let updated: number[];

        if (currentList.includes(choiceNum)) {
          // Deselect
          updated = currentList.filter(c => c !== choiceNum);
        } else {
          if (currentList.length >= 2) {
            // If already 2 selected, replace the earliest one with new choice
            updated = [currentList[1], choiceNum].sort((a, b) => a - b);
          } else {
            updated = [...currentList, choiceNum].sort((a, b) => a - b);
          }
        }

        // Trigger instant explanation when 2 choices are selected
        if (instantExplanation && updated.length === 2) {
          setRevealedExplanations(rex => ({
            ...rex,
            [currentQ.id]: true
          }));
          const isCorrect = evaluateAnswer(updated, currentQ.answer, currentQ.question).isCorrect;
          recordSingleQuestionAttempt(currentQ.id, isCorrect, updated);
        }

        return {
          ...prev,
          [currentQ.id]: updated
        };
      });
    } else {
      // 1-choice mode: single selection
      setUserAnswers(prev => ({
        ...prev,
        [currentQ.id]: [choiceNum]
      }));

      if (instantExplanation) {
        setRevealedExplanations(prev => ({
          ...prev,
          [currentQ.id]: true
        }));
        const isCorrect = evaluateAnswer([choiceNum], currentQ.answer, currentQ.question).isCorrect;
        recordSingleQuestionAttempt(currentQ.id, isCorrect, [choiceNum]);
      }
    }
  };

  // Helper to get incomplete questions list
  const getIncompleteQuestionsList = () => {
    return questions
      .map((q, idx) => {
        const ans = userAnswers[q.id] || [];
        const isPick2 = isPickTwoQuestion(q.question, q.answer);
        const isIncomplete = isPick2 ? ans.length !== 2 : ans.length === 0;
        return {
          question: q,
          index: idx,
          isIncomplete,
          currentSelectedCount: ans.length,
          isPick2
        };
      })
      .filter(item => item.isIncomplete);
  };

  // Perform actual grading and calculate scores
  const executeGrading = () => {
    setShowIncompleteConfirmModal(false);

    // Persist student identity locally
    if (studentName.trim()) {
      try {
        localStorage.setItem('ot_student_name', studentName.trim());
      } catch {
        // ignore
      }
    }
    if (studentId.trim()) {
      try {
        localStorage.setItem('ot_student_id', studentId.trim());
      } catch {
        // ignore
      }
    }

    let correctCount = 0;
    const categoryStats: Record<string, { total: number; correct: number }> = {};

    questions.forEach(q => {
      const userSelected = userAnswers[q.id] || [];
      const evalResult = evaluateAnswer(userSelected, q.answer, q.question);
      const isCorrect = evalResult.isCorrect;

      if (isCorrect) correctCount++;

      const catKey = q.category || '一般';
      if (!categoryStats[catKey]) {
        categoryStats[catKey] = { total: 0, correct: 0 };
      }
      categoryStats[catKey].total += 1;
      if (isCorrect) {
        categoryStats[catKey].correct += 1;
      }
    });

    const scorePercent = Math.round((correctCount / questions.length) * 100);

    const result: QuizAttemptResult = {
      id: 'res-' + Date.now(),
      testId,
      testTitle: title,
      date: new Date().toLocaleString('ja-JP'),
      totalQuestions: questions.length,
      correctCount,
      scorePercent,
      categoryStats,
      userAnswers,
      questionIds: questions.map(q => q.id)
    };

    setIsSubmitted(true);
    recordQuizAttempt(result, questions);
    onFinish(result);

    // If this is an assigned test, automatically submit to Firestore & Express server!
    if (testId) {
      setSubmissionStatus('submitting');
      setSubmissionError(null);

      // Safe submission call with 5-second upper limit timeout to prevent hanging UI
      const submitPromise = submitTestResultToCloud({
        testId,
        testTitle: title,
        studentName: studentName.trim() || '受講生',
        studentId: studentId.trim(),
        score: correctCount,
        total: questions.length,
        scorePercent,
        passed: scorePercent >= 60,
        categoryStats,
        userAnswers
      });

      const timeoutPromise = new Promise<{ success: boolean; id: string; error?: string }>((_, reject) =>
        setTimeout(() => reject(new Error('送信タイムアウト: サーバーへの通信が応答しませんでした')), 5000)
      );

      Promise.race([submitPromise, timeoutPromise])
        .then(res => {
          if (res.success) {
            setSubmissionStatus('submitted');
          } else {
            setSubmissionStatus('error');
            setSubmissionError(res.error || '送信に失敗しました');
          }
        })
        .catch(err => {
          setSubmissionStatus('error');
          setSubmissionError(err?.message || '送信エラーが発生しました');
        });
    }

    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      // ignore
    }

    if (scorePercent >= 60) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch {
        // ignore if not supported
      }
    }
  };

  // Re-submit handler in case of network error
  const handleResubmit = () => {
    if (!testId) return;
    setSubmissionStatus('submitting');
    setSubmissionError(null);

    let correctCount = 0;
    const categoryStats: Record<string, { total: number; correct: number }> = {};
    questions.forEach(q => {
      const userSelected = userAnswers[q.id] || [];
      const isCorrect = evaluateAnswer(userSelected, q.answer, q.question).isCorrect;
      if (isCorrect) correctCount++;
      const catKey = q.category || '一般';
      if (!categoryStats[catKey]) categoryStats[catKey] = { total: 0, correct: 0 };
      categoryStats[catKey].total += 1;
      if (isCorrect) categoryStats[catKey].correct += 1;
    });
    const scorePercent = Math.round((correctCount / questions.length) * 100);

    const submitPromise = submitTestResultToCloud({
      testId,
      testTitle: title,
      studentName: studentName.trim() || '受講生',
      studentId: studentId.trim(),
      score: correctCount,
      total: questions.length,
      scorePercent,
      passed: scorePercent >= 60,
      categoryStats,
      userAnswers
    });

    const timeoutPromise = new Promise<{ success: boolean; id: string; error?: string }>((_, reject) =>
      setTimeout(() => reject(new Error('送信タイムアウト: サーバーへの通信が応答しませんでした')), 5000)
    );

    Promise.race([submitPromise, timeoutPromise])
      .then(res => {
        if (res.success) {
          setSubmissionStatus('submitted');
        } else {
          setSubmissionStatus('error');
          setSubmissionError(res.error || '再送信に失敗しました');
        }
      })
      .catch(err => {
        setSubmissionStatus('error');
        setSubmissionError(err?.message || '再送信エラー');
      });
  };

  // Trigger submission: show confirmation modal if there are incomplete questions or student ID needed
  const handleSubmit = () => {
    const incompleteList = getIncompleteQuestionsList();
    if (incompleteList.length > 0 || (testId && !studentId.trim())) {
      setShowIncompleteConfirmModal(true);
      return;
    }
    executeGrading();
  };

  // Completed Questions count
  const answeredCount = questions.filter(q => {
    const list = userAnswers[q.id];
    if (!list || list.length === 0) return false;
    const isPick2 = isPickTwoQuestion(q.question, q.answer);
    return isPick2 ? list.length === 2 : list.length >= 1;
  }).length;

  if (questions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-8 bg-white rounded-2xl border border-slate-200 text-center my-8 shadow-xs">
        <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800">問題がありません</h2>
        <p className="text-sm text-slate-500 mt-1">選択された分野またはテストに問題が含まれていません。</p>
        <button
          onClick={onExit}
          className="mt-6 px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 transition-colors"
        >
          演習選択に戻る
        </button>
      </div>
    );
  }

  // --- RESULT VIEW ---
  if (isSubmitted) {
    let correctCount = 0;
    questions.forEach(q => {
      const evalRes = evaluateAnswer(userAnswers[q.id], q.answer, q.question);
      if (evalRes.isCorrect) correctCount++;
    });

    const scorePercent = Math.round((correctCount / questions.length) * 100);
    const isPassed = scorePercent >= 60; // OT national exam pass threshold

    const filteredReviewQuestions = reviewFilter === 'wrong'
      ? questions.filter(q => !evaluateAnswer(userAnswers[q.id], q.answer, q.question).isCorrect)
      : questions;

    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Score Header Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm text-center relative overflow-hidden">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 ${
            isPassed ? 'bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50' : 'bg-rose-100 text-rose-600 ring-8 ring-rose-50'
          }`}>
            <Trophy className="w-8 h-8" />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
            {isReviewMode && (
              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                📋 前回の解答結果・解説の見直し
              </span>
            )}
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
              isPassed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}>
              {isPassed ? '🎉 合格基準到達 (60%以上)' : '再挑戦推奨 (基準 60%未満)'}
            </span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-1">
            {title} {isReviewMode ? '結果・解説見直し' : '採点結果'}
          </h1>
          <p className="text-xs text-slate-500">
            {isReviewMode ? '前回の解答内容に基づき、正誤判定と詳細な解説を表示しています' : '国家試験の合格基準（60%以上）に照らして採点・判定しました'}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-6">
            <div className="bg-slate-50 border border-slate-100 rounded-xl px-6 py-3">
              <span className="text-xs text-slate-500 block font-medium">得点</span>
              <span className="text-3xl font-extrabold text-slate-900">{scorePercent}<span className="text-base font-normal text-slate-500">点</span></span>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl px-6 py-3">
              <span className="text-xs text-slate-500 block font-medium">正答数</span>
              <span className="text-3xl font-extrabold text-slate-900">{correctCount} <span className="text-base font-normal text-slate-500">/ {questions.length} 問</span></span>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl px-6 py-3">
              <span className="text-xs text-slate-500 block font-medium">正答率</span>
              <span className={`text-3xl font-extrabold ${isPassed ? 'text-emerald-600' : 'text-rose-600'}`}>{scorePercent}%</span>
            </div>
          </div>

          {/* Cloud Submission Status Badge */}
          {testId && (
            <div className="mt-6 max-w-lg mx-auto">
              {submissionStatus === 'submitting' && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 text-xs text-indigo-800 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
                  <span>教員側のクラウドへ採点結果を自動送信中...</span>
                </div>
              )}
              {submissionStatus === 'submitted' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900 flex items-center justify-between gap-3 text-left shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <div className="font-bold">教員へ採点結果を提出しました</div>
                      <div className="text-[11px] text-emerald-700 mt-0.5">
                        受験者: <span className="font-semibold">{studentName || '受講生'}</span>
                        {studentId ? ` (${studentId})` : ''} - 先生の画面にリアルタイム反映されています
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] bg-emerald-200/80 text-emerald-900 font-bold px-2 py-1 rounded">
                    提出完了
                  </span>
                </div>
              )}
              {submissionStatus === 'error' && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-900 flex items-center justify-between gap-3 text-left">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <div>
                      <div className="font-bold">教員へのクラウド送信に失敗しました</div>
                      <div className="text-[11px] text-rose-600">{submissionError || '通信環境をご確認ください'}</div>
                    </div>
                  </div>
                  <button
                    onClick={handleResubmit}
                    className="shrink-0 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    再送信
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={onExit}
              className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors flex items-center shadow-xs"
            >
              <Home className="w-4 h-4 mr-1.5" />
              一覧・ホームに戻る
            </button>
            <button
              onClick={() => {
                setUserAnswers({});
                setRevealedExplanations({});
                setIsSubmitted(false);
                setCurrentIndex(0);
              }}
              className="px-5 py-2.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-xl text-sm font-semibold hover:bg-teal-100 transition-colors flex items-center"
            >
              <RotateCcw className="w-4 h-4 mr-1.5" />
              もう一度解き直す
            </button>
          </div>
        </div>

        {/* Detailed Question Review Section */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center">
                <FileText className="w-5 h-5 text-teal-600 mr-2" />
                全問の正誤・詳細解説
              </h2>
              <p className="text-xs text-slate-500">
                「2つ選べ」の複数正答ルール（3つのうち2つ正解、2つのうちどちらかで正解）に基づき採点されています
              </p>
            </div>

            {/* Filter */}
            <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-medium">
              <button
                onClick={() => setReviewFilter('all')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  reviewFilter === 'all' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                全問表示 ({questions.length})
              </button>
              <button
                onClick={() => setReviewFilter('wrong')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  reviewFilter === 'wrong' ? 'bg-white text-rose-600 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                不正解のみ ({questions.length - correctCount})
              </button>
            </div>
          </div>

          <div className="mt-6 space-y-6">
            {filteredReviewQuestions.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                該当する問題はありません（全問正解です！お見事です）。
              </div>
            ) : (
              filteredReviewQuestions.map((q, idx) => {
                const userChoiceList = userAnswers[q.id] || [];
                const evalResult = evaluateAnswer(userChoiceList, q.answer, q.question);
                const isCorrect = evalResult.isCorrect;
                const targetList = evalResult.targetAnswers;
                const isPick2 = evalResult.isPickTwo;
                const formattedAnswer = formatAnswerDisplay(q.answer, q.question);

                return (
                  <div key={q.id} className={`p-5 rounded-xl border ${
                    isCorrect ? 'border-emerald-200 bg-emerald-50/20' : 'border-rose-200 bg-rose-50/20'
                  }`}>
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ${
                          isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {isCorrect ? <Check className="w-3.5 h-3.5 mr-1" /> : <XCircle className="w-3.5 h-3.5 mr-1" />}
                          {isCorrect ? '正解' : '不正解'}
                        </span>
                        {isPick2 && (
                          <span className="bg-amber-100 text-amber-900 text-xs font-bold px-2 py-0.5 rounded border border-amber-200">
                            2つ選べ
                          </span>
                        )}
                        <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {q.id}
                        </span>
                        <span className="text-xs bg-teal-50 text-teal-800 px-2 py-0.5 rounded border border-teal-200">
                          {q.category}
                        </span>
                        <span className="text-xs text-slate-500">
                          第{q.year}回 ({idx + 1}問目)
                        </span>
                      </div>
                      <div className="text-xs text-slate-700 font-medium">
                        あなたの解答: <span className="font-bold">{userChoiceList.length > 0 ? userChoiceList.join(', ') : '未選択'}</span>
                        <span className="mx-2 text-slate-300">|</span>
                        正答: <span className="font-bold text-emerald-700">{formattedAnswer}</span>
                      </div>
                    </div>

                    <p className="text-sm font-semibold text-slate-900 mb-3 whitespace-pre-wrap leading-relaxed">
                      {q.question}
                    </p>

                    {q.imageUrl && (
                      <QuestionImage 
                        imageUrl={q.imageUrl}
                        alt={`問題 ${q.id} 画像`}
                        questionId={q.id}
                        maxHeightClass="max-h-56"
                      />
                    )}

                    {/* Choices preview */}
                    <div className="space-y-1.5 mb-3 text-xs">
                      {q.choices.map((c, cIdx) => {
                        const num = cIdx + 1;
                        const isThisCorrect = targetList.includes(num);
                        const isThisUser = userChoiceList.includes(num);

                        let style = 'bg-white border-slate-200 text-slate-700';
                        if (isThisCorrect && isThisUser) {
                          style = 'bg-emerald-100 border-emerald-300 text-emerald-950 font-semibold ring-1 ring-emerald-400';
                        } else if (isThisCorrect && !isThisUser) {
                          style = 'bg-emerald-50 border-emerald-200 text-emerald-900 font-medium';
                        } else if (isThisUser && !isThisCorrect) {
                          style = 'bg-rose-100 border-rose-300 text-rose-950 line-through';
                        }

                        return (
                          <div key={cIdx} className={`px-3 py-2 rounded-lg border flex items-center justify-between ${style}`}>
                            <div className="flex items-center space-x-2">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] ${
                                isThisUser ? 'bg-slate-900 text-white' : 'bg-slate-200/60 text-slate-700'
                              }`}>
                                {num}
                              </span>
                              <span>{c}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              {isThisCorrect && (
                                <span className="text-[10px] font-bold text-emerald-800 bg-white/90 border border-emerald-300 px-2 py-0.5 rounded">
                                  {targetList.length >= 3 ? '正答候補' : '正解'}
                                </span>
                              )}
                              {isThisUser && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  isThisCorrect ? 'bg-emerald-700 text-white' : 'bg-rose-700 text-white'
                                }`}>
                                  あなたの選択
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Explanation */}
                    <div className="mt-3 p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-700 leading-relaxed">
                      <div className="font-bold text-teal-800 mb-1 flex items-center justify-between">
                        <span className="flex items-center">
                          <HelpCircle className="w-3.5 h-3.5 mr-1 text-teal-600" />
                          解説（正答: {formattedAnswer}）
                        </span>
                        <span className={`text-[11px] font-semibold ${isCorrect ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {evalResult.detailText}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap">{q.explanation || '解説は登録されていません。'}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- SOLVING VIEW ---
  const evalCurrent = currentQ ? evaluateAnswer(selectedChoices, currentQ.answer, currentQ.question) : null;
  const currentTargetAnswers = currentQ ? normalizeAnswer(currentQ.answer) : [];
  const formattedCurrentAnswer = currentQ ? formatAnswerDisplay(currentQ.answer, currentQ.question) : '';

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Top Bar with Progress */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <button
              onClick={onExit}
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
              title="中断して戻る"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate max-w-[200px] sm:max-w-md">
                {title}
              </h2>
              <div className="flex items-center space-x-2 text-xs text-slate-500">
                <span>問 {currentIndex + 1} / {questions.length}</span>
                <span>•</span>
                <span>解答済: {answeredCount} / {questions.length}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Instant feedback toggle */}
            <button
              onClick={() => setInstantExplanation(!instantExplanation)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors hidden sm:flex items-center space-x-1 ${
                instantExplanation
                  ? 'bg-amber-50 text-amber-800 border-amber-200 font-medium'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
              title="選択した瞬間に正誤と解説を表示するか切り替えます"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>即時解説: {instantExplanation ? 'ON' : 'OFF'}</span>
            </button>

            {/* Questions Jump Drawer Trigger */}
            <button
              onClick={() => setShowQuestionsDrawer(!showQuestionsDrawer)}
              className="px-2.5 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
            >
              問題一覧
            </button>

            {/* Finish button */}
            <button
              id="submit-quiz-btn"
              onClick={handleSubmit}
              className="px-3.5 py-1.5 text-xs sm:text-sm bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl shadow-xs transition-colors"
            >
              採点・終了
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
          <div
            className="bg-teal-600 h-full transition-all duration-300 rounded-full"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>

        {/* Question Jump drawer / strip */}
        {showQuestionsDrawer && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-500 mb-2">問題ジャンプ:</div>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentIndex;
                const ans = userAnswers[q.id] || [];
                const isPick2 = isPickTwoQuestion(q.question, q.answer);
                const isAnswered = isPick2 ? ans.length === 2 : ans.length >= 1;

                let btnClass = 'bg-slate-100 text-slate-700 border-slate-200';
                if (isCurrent) {
                  btnClass = 'bg-teal-600 text-white font-bold ring-2 ring-teal-300';
                } else if (isAnswered) {
                  btnClass = 'bg-teal-50 text-teal-800 border-teal-200 font-medium';
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setCurrentIndex(idx);
                      setShowQuestionsDrawer(false);
                    }}
                    className={`w-7 h-7 text-xs rounded-lg border flex items-center justify-center transition-colors ${btnClass}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main Question Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        {/* Question Meta Badges */}
        <div className="flex items-center flex-wrap gap-2">
          <span className="font-mono text-xs font-bold bg-slate-900 text-white px-2.5 py-1 rounded-md">
            {currentQ.id}
          </span>
          <span className="text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 px-2.5 py-1 rounded-md">
            {currentQ.category}
          </span>
          <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md">
            第{currentQ.year}回 国試過去問
          </span>
          {currentIsPickTwo && (
            <span className="text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-1 rounded-md animate-pulse">
              2つ選べ
            </span>
          )}
        </div>

        {/* Question Text */}
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-relaxed whitespace-pre-wrap">
            {currentQ.question}
          </h3>
        </div>

        {/* Image Display if present */}
        {currentQ.imageUrl && (
          <QuestionImage
            imageUrl={currentQ.imageUrl}
            alt={`問題 ${currentQ.id} 画像`}
            questionId={currentQ.id}
            maxHeightClass="max-h-80"
          />
        )}

        {/* 5 Choices */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            {currentIsPickTwo ? (
              <span className="text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  【2つ選べ】 選択肢から <strong>2つ</strong> 選んでください（現在 <strong className="text-amber-900">{selectedChoices.length} / 2</strong> 選択中）
                </span>
              </span>
            ) : (
              <span className="text-slate-600">
                選択肢（1つ選択してください）:
              </span>
            )}
          </div>

          {currentQ.choices.map((choice, index) => {
            const choiceNum = index + 1;
            const isSelected = selectedChoices.includes(choiceNum);
            const isTargetAnswer = currentTargetAnswers.includes(choiceNum);

            let cardStyle = 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 bg-white text-slate-800';
            let circleStyle = 'bg-slate-100 text-slate-600 border-slate-300';

            if (isRevealed) {
              if (isTargetAnswer && isSelected) {
                // Correctly chosen
                cardStyle = 'border-emerald-500 bg-emerald-50/80 text-emerald-950 font-semibold ring-1 ring-emerald-400';
                circleStyle = 'bg-emerald-600 text-white border-emerald-600';
              } else if (isTargetAnswer && !isSelected) {
                // Correct answer but missed
                cardStyle = 'border-emerald-300 bg-emerald-50/40 text-emerald-900 font-medium';
                circleStyle = 'bg-emerald-100 text-emerald-800 border-emerald-300';
              } else if (isSelected && !isTargetAnswer) {
                // Wrong choice picked
                cardStyle = 'border-rose-400 bg-rose-50 text-rose-950 ring-1 ring-rose-300 line-through';
                circleStyle = 'bg-rose-600 text-white border-rose-600';
              } else {
                cardStyle = 'border-slate-200 bg-slate-50/50 text-slate-400 opacity-60';
                circleStyle = 'bg-slate-100 text-slate-400 border-slate-200';
              }
            } else if (isSelected) {
              cardStyle = 'border-teal-600 bg-teal-50/70 text-teal-950 font-medium ring-1 ring-teal-500 shadow-xs';
              circleStyle = 'bg-teal-600 text-white border-teal-600';
            }

            return (
              <button
                key={index}
                onClick={() => handleSelectChoice(choiceNum)}
                className={`w-full text-left p-3.5 sm:p-4 rounded-xl border transition-all flex items-center justify-between ${cardStyle}`}
              >
                <div className="flex items-center space-x-3 pr-2">
                  <span className={`w-7 h-7 shrink-0 rounded-full border flex items-center justify-center text-xs font-bold transition-colors ${circleStyle}`}>
                    {isSelected ? <Check className="w-4 h-4" /> : choiceNum}
                  </span>
                  <span className="text-sm sm:text-base leading-snug">{choice}</span>
                </div>

                {isRevealed && isTargetAnswer && (
                  <span className="shrink-0 flex items-center text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-md">
                    <CheckCircle className="w-3.5 h-3.5 mr-1" />
                    {currentTargetAnswers.length >= 3 ? '正答候補' : '正解'}
                  </span>
                )}
                {isRevealed && isSelected && !isTargetAnswer && (
                  <span className="shrink-0 flex items-center text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-1 rounded-md">
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    不正解
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Explanation Card (When revealed) */}
        {isRevealed && evalCurrent && (
          <div className="mt-6 p-5 bg-teal-50/70 border border-teal-200 rounded-xl space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-1.5 text-sm font-bold text-teal-950">
                <HelpCircle className="w-4 h-4 text-teal-600 shrink-0" />
                <span>正答と解説: 【正答: {formattedCurrentAnswer}】</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${
                  evalCurrent.isCorrect
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : selectedChoices.length === 0
                    ? 'bg-slate-100 text-slate-700 border border-slate-200'
                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                }`}>
                  {selectedChoices.length === 0 ? '正答確認' : evalCurrent.statusText}
                </span>
                {!isSubmitted && (
                  <button
                    type="button"
                    onClick={() => {
                      setRevealedExplanations(prev => ({
                        ...prev,
                        [currentQ.id]: false
                      }));
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-teal-100/60 transition-colors cursor-pointer"
                    title="解説を閉じる"
                  >
                    閉じる
                  </button>
                )}
              </div>
            </div>
            {selectedChoices.length > 0 && (
              <div className="text-xs font-semibold text-teal-900 pb-1">
                判定詳細: {evalCurrent.detailText}
              </div>
            )}
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pt-1 whitespace-pre-wrap border-t border-teal-100">
              {currentQ.explanation || '解説は準備中です。'}
            </p>
          </div>
        )}

        {/* Show explanation manual button */}
        {!isRevealed && (
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setRevealedExplanations(prev => ({
                  ...prev,
                  [currentQ.id]: true
                }));
              }}
              className="text-xs text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center space-x-1 cursor-pointer shadow-2xs"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>この問題の正答と解説を確認する</span>
            </button>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="px-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1.5 font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>前の問題</span>
          </button>

          {currentIndex < questions.length - 1 ? (
            <button
              onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
              className="px-5 py-2 text-xs sm:text-sm rounded-xl bg-slate-900 text-white hover:bg-slate-800 flex items-center space-x-1.5 font-semibold transition-colors shadow-xs"
            >
              <span>次の問題</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="px-5 py-2 text-xs sm:text-sm rounded-xl bg-teal-600 text-white hover:bg-teal-700 flex items-center space-x-1.5 font-bold transition-colors shadow-xs"
            >
              <span>採点して結果を見る</span>
              <Trophy className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Incomplete questions / Submit confirmation modal */}
      {showIncompleteConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className={`p-2 rounded-xl ${
                  getIncompleteQuestionsList().length > 0
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-teal-100 text-teal-700'
                }`}>
                  {getIncompleteQuestionsList().length > 0 ? (
                    <AlertCircle className="w-5 h-5" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {getIncompleteQuestionsList().length > 0
                      ? '未解答の問題があります'
                      : 'テストの採点・提出'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {getIncompleteQuestionsList().length > 0 ? (
                      <>全 {questions.length} 問中、<strong className="text-amber-700 font-bold">{getIncompleteQuestionsList().length} 問</strong> が未解答です</>
                    ) : (
                      <>全 {questions.length} 問の解答が完了しました</>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIncompleteConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Student Identity Input (for delivered tests) */}
            {testId && (
              <div className="bg-teal-50/70 border border-teal-200/80 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-teal-700" />
                    受験者情報（教員への提出・成績連携用）
                  </div>
                  <span className="text-[10px] text-teal-700">自動でクラウド集計されます</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <label className="text-[11px] font-bold text-slate-800 block mb-1">
                      学籍番号 <span className="text-rose-500 font-bold">* 必須</span>
                    </label>
                    <input
                      type="text"
                      value={studentId}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setStudentId(val);
                        try {
                          localStorage.setItem('ot_student_id', val);
                        } catch {}
                        const p = getStudentProfile();
                        saveStudentProfile({
                          studentId: val,
                          grade: p?.grade || 1,
                          name: studentName
                        });
                      }}
                      placeholder="例: OT2024001"
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 font-mono font-bold focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-lg text-xs"
                    />
                    {!studentId.trim() && (
                      <p className="text-[10px] text-rose-600 font-semibold mt-1">※テストの提出には学籍番号が必須です</p>
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-700 block mb-1">
                      氏名（任意）
                    </label>
                    <input
                      type="text"
                      value={studentName}
                      onChange={(e) => {
                        setStudentName(e.target.value);
                        try {
                          localStorage.setItem('ot_student_name', e.target.value);
                        } catch {}
                        const p = getStudentProfile();
                        if (p) {
                          saveStudentProfile({ ...p, name: e.target.value });
                        }
                      }}
                      placeholder="例: 山田 太郎"
                      className="w-full px-3 py-2 bg-white border border-slate-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {getIncompleteQuestionsList().length > 0 && (
              <>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  テスト途中で採点を実行すると、未解答または選択数が不足している問題は<strong>「不正解」</strong>として計算されます。
                  このまま終了して採点しますか？
                </p>

                {/* Incomplete questions list / jumps */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <div className="text-xs font-semibold text-slate-700 mb-2">
                    未解答の問題（クリックするとその問題にジャンプします）:
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
                    {getIncompleteQuestionsList().map((item) => (
                      <button
                        key={item.question.id}
                        type="button"
                        onClick={() => {
                          setCurrentIndex(item.index);
                          setShowIncompleteConfirmModal(false);
                        }}
                        className="px-2.5 py-1.5 text-xs bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 text-slate-700 hover:text-teal-800 rounded-lg font-medium transition-colors flex items-center gap-1.5 shadow-2xs"
                        title={`問 ${item.index + 1} に移動`}
                      >
                        <span className="font-bold text-slate-900">問 {item.index + 1}</span>
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
                          {item.isPick2 && item.currentSelectedCount === 1 ? 'あと1つ' : '未選択'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowIncompleteConfirmModal(false)}
                className="w-full sm:flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs sm:text-sm transition-colors flex items-center justify-center gap-1.5"
              >
                <span>問題に戻って続ける</span>
              </button>
              <button
                type="button"
                disabled={Boolean(testId && !studentId.trim())}
                onClick={executeGrading}
                className={`w-full sm:w-auto py-2.5 px-5 font-semibold rounded-xl text-xs sm:text-sm shadow-xs transition-colors flex items-center justify-center gap-1.5 ${
                  testId && !studentId.trim()
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-teal-600 hover:bg-teal-700 text-white'
                }`}
              >
                <Send className="w-3.5 h-3.5 mr-1" />
                {testId ? '採点・教員へ提出する' : 'このまま採点・終了する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
