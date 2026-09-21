import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Question, DeliveredTest, QuizAttemptResult, StudentLocalProfile } from './types';
import { StudentNavbar } from './components/StudentNavbar';
import { StudentView } from './components/StudentView';
import { QuizRunner } from './components/QuizRunner';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ReceivedTestModal } from './components/ReceivedTestModal';
import { StudentIdRegistrationModal } from './components/StudentIdRegistrationModal';
import { 
  fetchDeliveredTests, 
  fetchTestByCode, 
  fetchTestFromServer,
  fetchQuestionsFromServer,
  subscribeDeliveredTests,
  onNewDeliveredTest 
} from './services/testSyncService';
import { getStudentProfile, isTestEligibleForStudent } from './services/studentRosterService';
import { Loader2, AlertCircle } from 'lucide-react';
import { recordQuizAttempt } from './services/studentStudyHistoryService';

export const App: React.FC = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [deliveredTests, setDeliveredTests] = useState<DeliveredTest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const knownTestIdsRef = useRef<Set<string>>(new Set());
  const isInitialSyncDoneRef = useRef<boolean>(false);

  // Local quiz history
  const [quizHistory, setQuizHistory] = useState<QuizAttemptResult[]>(() => {
    try {
      const saved = localStorage.getItem('ot_quiz_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Active quiz session
  const [activeQuiz, setActiveQuiz] = useState<{
    questions: Question[];
    title: string;
    testId?: string;
    instantFeedback?: boolean;
  } | null>(null);

  // Review mode for past quiz attempt
  const [reviewResult, setReviewResult] = useState<QuizAttemptResult | null>(null);

  // Incoming test notification popup
  const [newlyReceivedTest, setNewlyReceivedTest] = useState<DeliveredTest | null>(null);

  // Student Profile Registration Modal
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [studentProfile, setStudentProfile] = useState<StudentLocalProfile | null>(() => getStudentProfile());

  // Load questions and delivered tests
  const loadData = useCallback(async () => {
    try {
      // 1. Fetch questions from server API / Firestore
      const loadedQs = await fetchQuestionsFromServer();
      if (loadedQs.length > 0) {
        setQuestions(prev => {
          const map = new Map(prev.map(q => [q.id, q]));
          loadedQs.forEach(q => map.set(q.id, q));
          return Array.from(map.values());
        });
      }

      // 2. Fetch delivered tests from API & Firestore
      const tests = await fetchDeliveredTests();
      setDeliveredTests(tests);

      // Detect newly arrived tests for notification
      if (isInitialSyncDoneRef.current && tests.length > 0) {
        for (const t of tests) {
          if (!knownTestIdsRef.current.has(t.id)) {
            knownTestIdsRef.current.add(t.id);
            const profile = getStudentProfile();
            if (isTestEligibleForStudent(t, profile).eligible) {
              setNewlyReceivedTest(t);
              break;
            }
          }
        }
      } else {
        tests.forEach(t => knownTestIdsRef.current.add(t.id));
        isInitialSyncDoneRef.current = true;
      }
    } catch (err: any) {
      console.error('Error loading data:', err);
      setLoadError(err?.message || 'データの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Fast 3.5s auto-polling to ensure instant sync even across Render / AI Studio
    const pollInterval = setInterval(loadData, 3500);

    // Instant sync triggers on tab focus, visibility change, or online reconnect
    const handleActiveSync = () => {
      loadData();
    };
    window.addEventListener('focus', handleActiveSync);
    window.addEventListener('online', handleActiveSync);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleActiveSync();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Real-time Firestore subscription
    const unsubscribeCloud = subscribeDeliveredTests((tests) => {
      setDeliveredTests(tests);
      if (isInitialSyncDoneRef.current) {
        for (const t of tests) {
          if (!knownTestIdsRef.current.has(t.id)) {
            knownTestIdsRef.current.add(t.id);
            const profile = getStudentProfile();
            if (isTestEligibleForStudent(t, profile).eligible) {
              setNewlyReceivedTest(t);
              break;
            }
          }
        }
      } else {
        tests.forEach(t => knownTestIdsRef.current.add(t.id));
        isInitialSyncDoneRef.current = true;
      }
    });

    // Check for ?code=... or #code=... in URL on mount
    const checkUrlCode = async () => {
      try {
        const search = window.location.search;
        const hash = window.location.hash;
        const params = new URLSearchParams(search);
        let code = params.get('code');
        if (!code && hash) {
          const match = hash.match(/code=([^&]+)/);
          if (match) code = match[1];
        }
        if (code) {
          const res = await fetchTestFromServer(code);
          if (res && res.questions.length > 0) {
            setDeliveredTests(prev => {
              const filtered = prev.filter(t => t.id !== res.test.id);
              return [res.test, ...filtered];
            });
            setNewlyReceivedTest(res.test);
            try {
              window.history.replaceState(null, '', window.location.pathname);
            } catch {}
          }
        }
      } catch (e) {
        console.warn('URL test code parse note:', e);
      }
    };
    checkUrlCode();

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleActiveSync);
      window.removeEventListener('online', handleActiveSync);
      document.removeEventListener('visibilitychange', handleVisibility);
      unsubscribeCloud();
    };
  }, [loadData]);

  // Handle starting a quiz session
  const handleStartQuiz = (
    selectedQuestions: Question[],
    title: string,
    testId?: string,
    instantFeedback?: boolean
  ) => {
    setReviewResult(null);
    setActiveQuiz({
      questions: selectedQuestions,
      title,
      testId,
      instantFeedback
    });
  };

  // Handle viewing a past attempt's result / explanation
  const handleViewHistoryResult = (result: QuizAttemptResult) => {
    // Find the original questions from either questions list or construct stubs
    const questionMap = new Map<string, Question>(questions.map(q => [q.id, q]));
    const targetQuestions: Question[] = [];

    if (result.questionIds) {
      result.questionIds.forEach(id => {
        const q = questionMap.get(id);
        if (q) targetQuestions.push(q);
      });
    }

    // If questions couldn't be resolved, fallback to existing matching
    if (targetQuestions.length === 0 && result.testId) {
      const delivered = deliveredTests.find(t => t.id === result.testId);
      if (delivered && delivered.questions) {
        targetQuestions.push(...(delivered.questions as Question[]));
      }
    }

    if (targetQuestions.length === 0) {
      alert('この解答履歴に対応する問題データが見つかりませんでした。');
      return;
    }

    setActiveQuiz(null);
    setReviewResult(result);
  };

  // Save quiz result to history
  const handleQuizFinish = (result: QuizAttemptResult) => {
    setQuizHistory(prev => {
      const updated = [result, ...prev.filter(r => r.id !== result.id)];
      try {
        localStorage.setItem('ot_quiz_history', JSON.stringify(updated));
      } catch (err) {
        console.warn('Failed to save quiz history:', err);
      }
      return updated;
    });
    recordQuizAttempt(result, activeQuiz?.questions || questions);
  };

  // Join test by 6-character code
  const handleJoinByCode = async (code: string): Promise<boolean> => {
    const test = await fetchTestByCode(code);
    if (!test) return false;

    // Add to delivered tests list if not already present
    setDeliveredTests(prev => {
      if (prev.some(t => t.id === test.id)) return prev;
      return [test, ...prev];
    });

    // Start the test directly
    const questionMap = new Map(questions.map(q => [q.id, q]));
    const testQuestions = (test.questions && test.questions.length > 0)
      ? test.questions
      : test.questionIds
          .map(id => questionMap.get(id))
          .filter((q): q is Question => q !== undefined);

    if (testQuestions.length === 0) {
      alert('テスト内の問題データが見つかりませんでした。');
      return false;
    }

    handleStartQuiz(testQuestions, test.title, test.id, false);
    return true;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-teal-500 selection:text-white">
      {/* Student Navigation Header */}
      <StudentNavbar 
        studentProfile={studentProfile}
        onOpenProfile={() => setShowProfileModal(true)}
        pendingTestsCount={deliveredTests.length}
        onRefreshTests={loadData}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {isLoading && questions.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center text-teal-600 shadow-xs">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
            <p className="text-sm font-semibold text-slate-700">国家試験問題データを読み込んでいます...</p>
          </div>
        ) : activeQuiz ? (
          /* Active Quiz Runner */
          <QuizRunner
            questions={activeQuiz.questions}
            title={activeQuiz.title}
            testId={activeQuiz.testId}
            instantExplanationDefault={activeQuiz.instantFeedback}
            onFinish={handleQuizFinish}
            onExit={() => setActiveQuiz(null)}
          />
        ) : reviewResult ? (
          /* Review Mode for past attempt */
          (() => {
            const questionMap = new Map(questions.map(q => [q.id, q]));
            const reviewQuestions = (reviewResult.questionIds || [])
              .map(id => questionMap.get(id))
              .filter((q): q is Question => q !== undefined);

            return (
              <QuizRunner
                questions={reviewQuestions.length > 0 ? reviewQuestions : questions.slice(0, reviewResult.totalQuestions)}
                title={reviewResult.testTitle}
                testId={reviewResult.testId}
                initialSubmitted={true}
                initialUserAnswers={reviewResult.userAnswers}
                initialSubmissionStatus="submitted"
                isReviewMode={true}
                onFinish={() => {}}
                onExit={() => setReviewResult(null)}
              />
            );
          })()
        ) : (
          /* Standard Student Dashboard */
          <StudentView
            questions={questions}
            deliveredTests={deliveredTests}
            quizHistory={quizHistory}
            studentProfile={studentProfile}
            onOpenProfile={() => setShowProfileModal(true)}
            onProfileUpdate={(profile) => setStudentProfile(profile)}
            onStartQuiz={handleStartQuiz}
            onViewHistoryResult={handleViewHistoryResult}
            onJoinByCode={handleJoinByCode}
            onRefreshTests={loadData}
          />
        )}
      </main>

      {/* Popups & Floats */}
      <OfflineIndicator />

      {/* Newly Delivered Test Alert Modal */}
      {newlyReceivedTest && (
        <ReceivedTestModal
          test={newlyReceivedTest}
          onClose={() => setNewlyReceivedTest(null)}
          onStartNow={(test) => {
            setNewlyReceivedTest(null);
            const questionMap = new Map(questions.map(q => [q.id, q]));
            const testQuestions = (test.questions && test.questions.length > 0)
              ? test.questions
              : test.questionIds
                  .map(id => questionMap.get(id))
                  .filter((q): q is Question => q !== undefined);

            if (testQuestions.length > 0) {
              handleStartQuiz(testQuestions, test.title, test.id, false);
            } else {
              alert('問題データを読み込み中または見つかりません。');
            }
          }}
        />
      )}

      {/* Student Profile Registration Modal */}
      <StudentIdRegistrationModal
        isOpen={showProfileModal}
        initialProfile={studentProfile}
        onClose={() => setShowProfileModal(false)}
        onSaved={(profile) => {
          setStudentProfile(profile);
          setShowProfileModal(false);
        }}
      />
    </div>
  );
};

export default App;
