/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Question, DeliveredTest, QuizAttemptResult, isSampleQuestion, isSampleTest } from './types';
import { DEFAULT_QUESTIONS } from './data/defaultQuestions';
import { Navbar } from './components/Navbar';
import { StudentView } from './components/StudentView';
import { TeacherView } from './components/TeacherView';
import { QuizRunner } from './components/QuizRunner';
import { ReceivedTestModal } from './components/ReceivedTestModal';
import { TeacherAuthModal } from './components/TeacherAuthModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { decodeDeliveredTest, fetchTestFromServer, fetchAllServerTests, saveTestToServer } from './utils/shareTest';
import { normalizeImageUrl } from './utils/imageHelper';
import {
  subscribeDeliveredTests,
  saveDeliveredTestToCloud,
  deleteDeliveredTestFromCloud,
  fetchDeliveredTestsFromCloud,
  fetchQuestionsFromServer,
  saveQuestionsToServer,
  fetchQuestionsFromCloud,
  saveQuestionsToCloud
} from './services/testSyncService';
import { recordQuizAttempt } from './services/studentStudyHistoryService';
import { AlertTriangle, Bell, ChevronRight } from 'lucide-react';

const STORAGE_KEY_QUESTIONS = 'ot_exam_questions_db_v2';
const STORAGE_KEY_DELIVERED = 'ot_exam_delivered_tests_v2';
const STORAGE_KEY_HISTORY = 'ot_exam_quiz_history_v2';

export default function App() {
  const [mode, setMode] = useState<'student' | 'teacher'>('student');

  // One-time cleanup for localStorage to prevent mobile QuotaExceeded and memory crashes
  useEffect(() => {
    try {
      localStorage.removeItem('ot_exam_questions_db_v1');
      localStorage.removeItem('ot_exam_questions_db_v2');
      localStorage.removeItem('ot_exam_delivered_tests_v1');

      const savedD = localStorage.getItem(STORAGE_KEY_DELIVERED);
      if (savedD) {
        const parsedD = JSON.parse(savedD);
        if (Array.isArray(parsedD)) {
          const cleanedD = parsedD.filter((t: DeliveredTest) => !isSampleTest(t));
          localStorage.setItem(STORAGE_KEY_DELIVERED, JSON.stringify(cleanedD));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Questions Database - Loaded asynchronously from Server/Cloud (avoids 4.4MB localStorage crash on mobile)
  const [questions, setQuestions] = useState<Question[]>([]);

  // Delivered Tests (by Teacher) - Excludes sample test
  const [deliveredTests, setDeliveredTests] = useState<DeliveredTest[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DELIVERED);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((t: DeliveredTest) => !isSampleTest(t));
        }
      }
    } catch {
      // fallback
    }
    return [];
  });

  // Quiz Attempt History
  const [quizHistory, setQuizHistory] = useState<QuizAttemptResult[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // fallback
    }
    return [];
  });

  // Active Quiz State (if solving or reviewing)
  const [activeQuiz, setActiveQuiz] = useState<{
    questions: Question[];
    title: string;
    testId?: string;
    instantExplanation?: boolean;
    initialSubmitted?: boolean;
    initialUserAnswers?: Record<string, number[]>;
    initialSubmissionStatus?: 'idle' | 'submitting' | 'submitted' | 'error';
    isReviewMode?: boolean;
  } | null>(null);

  // Incoming test received via shared URL (#test=...) or QR code
  const [receivedTest, setReceivedTest] = useState<{
    test: DeliveredTest;
    questions: Question[];
  } | null>(null);

  // Real-time toast alert when a new test arrives while student is on screen
  const [newTestAlert, setNewTestAlert] = useState<{
    test: DeliveredTest;
    questions: Question[];
  } | null>(null);

  // Track known test IDs to identify genuinely new deliveries
  const knownTestIdsRef = React.useRef<Set<string>>(new Set(deliveredTests.map(t => t.id)));
  const isInitialSyncDoneRef = React.useRef<boolean>(false);

  // Teacher Authentication state (passcode lock)
  const [isTeacherAuthenticated, setIsTeacherAuthenticated] = useState(false);
  const [showTeacherAuthModal, setShowTeacherAuthModal] = useState(false);

  // In-app confirmation modal (avoids iframe window.confirm blocking)
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);

  // Fetch and synchronize delivered tests and questions from server and Firestore
  const syncAllTests = React.useCallback(async () => {
    let latestTestsList: DeliveredTest[] = [];

    // 1. Fetch from server API with high reliability
    try {
      const serverTests = await fetchAllServerTests();
      if (serverTests && serverTests.length > 0) {
        const validServerTests = serverTests.filter(t => !isSampleTest(t));
        if (validServerTests.length > 0) {
          latestTestsList = validServerTests;
          setDeliveredTests(prev => {
            const existingMap = new Map<string, DeliveredTest>(prev.map(t => [t.id, t]));
            validServerTests.forEach(st => {
              existingMap.set(st.id, st);
            });
            const merged = Array.from(existingMap.values());
            merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            return merged;
          });

          // Also harvest questions into questions state
          setQuestions(prev => {
            const map = new Map(prev.map(q => [q.id, q]));
            let added = false;
            validServerTests.forEach(st => {
              if (Array.isArray(st.questions)) {
                st.questions.forEach(q => {
                  if (q && q.id && !isSampleQuestion(q) && !map.has(q.id)) {
                    map.set(q.id, {
                      ...q,
                      imageUrl: q.imageUrl ? normalizeImageUrl(q.imageUrl) : q.imageUrl
                    });
                    added = true;
                  }
                });
              }
            });
            return added ? Array.from(map.values()) : prev;
          });
        }
      }
    } catch (e) {
      console.warn('Server test sync notice:', e);
    }

    // 2. Fetch directly from Cloud Firestore as well (for cross-container / multi-user cloud sync)
    try {
      const cloudTests = await fetchDeliveredTestsFromCloud();
      if (cloudTests && cloudTests.length > 0) {
        const validCloudTests = cloudTests.filter(t => !isSampleTest(t));
        if (validCloudTests.length > 0) {
          latestTestsList = [...latestTestsList, ...validCloudTests];
          setDeliveredTests(prev => {
            const existingMap = new Map<string, DeliveredTest>(prev.map(t => [t.id, t]));
            validCloudTests.forEach(ct => {
              existingMap.set(ct.id, ct);
            });
            const merged = Array.from(existingMap.values());
            merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            return merged;
          });

          // Harvest questions
          setQuestions(prev => {
            const map = new Map(prev.map(q => [q.id, q]));
            let added = false;
            validCloudTests.forEach(ct => {
              if (Array.isArray(ct.questions)) {
                ct.questions.forEach(q => {
                  if (q && q.id && !isSampleQuestion(q) && !map.has(q.id)) {
                    map.set(q.id, {
                      ...q,
                      imageUrl: q.imageUrl ? normalizeImageUrl(q.imageUrl) : q.imageUrl
                    });
                    added = true;
                  }
                });
              }
            });
            return added ? Array.from(map.values()) : prev;
          });
        }
      }
    } catch (e) {
      console.warn('Cloud test sync notice:', e);
    }

    // Detect newly arrived tests for active student notification
    if (isInitialSyncDoneRef.current && latestTestsList.length > 0) {
      for (const t of latestTestsList) {
        if (!knownTestIdsRef.current.has(t.id)) {
          knownTestIdsRef.current.add(t.id);
          // Only pop alert if student is not already taking a quiz
          setNewTestAlert({
            test: t,
            questions: t.questions || []
          });
          break;
        }
      }
    } else {
      latestTestsList.forEach(t => knownTestIdsRef.current.add(t.id));
      isInitialSyncDoneRef.current = true;
    }
  }, []);

  useEffect(() => {
    // Initial immediate sync
    syncAllTests();

    // Fast 3.5s auto-polling to ensure instant delivery even across separate devices and network hops
    const pollTimer = setInterval(syncAllTests, 3500);

    // Instant sync triggers on tab focus, visibility change, online reconnect, or custom storage event
    const handleActiveSync = () => {
      syncAllTests();
    };

    window.addEventListener('focus', handleActiveSync);
    window.addEventListener('online', handleActiveSync);
    window.addEventListener('delivered_tests_updated', handleActiveSync);
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY_DELIVERED) {
        handleActiveSync();
      }
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleActiveSync();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Fetch past questions from server API (fallback to Cloud Firestore once)
    fetchQuestionsFromServer().then(async (serverQs) => {
      let finalQs = serverQs;
      if (!finalQs || finalQs.length === 0) {
        finalQs = await fetchQuestionsFromCloud();
      }
      if (finalQs && finalQs.length > 0) {
        const validQs = finalQs.filter(q => !isSampleQuestion(q));
        setQuestions(prev => {
          const map = new Map(prev.map(q => [q.id, q]));
          validQs.forEach(q => {
            if (!map.has(q.id)) {
              map.set(q.id, {
                ...q,
                imageUrl: q.imageUrl ? normalizeImageUrl(q.imageUrl) : q.imageUrl
              });
            }
          });
          return Array.from(map.values());
        });
      }
    });

    // Real-time subscribe to Firestore delivered tests (for immediate exam delivery via WebSocket/gRPC)
    const unsubscribeTests = subscribeDeliveredTests((cloudTests) => {
      const validCloudTests = cloudTests.filter(t => !isSampleTest(t));
      if (validCloudTests.length > 0) {
        setDeliveredTests(prev => {
          const map = new Map<string, DeliveredTest>(prev.map(t => [t.id, t]));
          validCloudTests.forEach(ct => {
            map.set(ct.id, ct);
          });
          const merged = Array.from(map.values());
          merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          return merged;
        });

        // Trigger new test notification if appropriate
        if (isInitialSyncDoneRef.current) {
          for (const t of validCloudTests) {
            if (!knownTestIdsRef.current.has(t.id)) {
              knownTestIdsRef.current.add(t.id);
              setNewTestAlert({
                test: t,
                questions: t.questions || []
              });
              break;
            }
          }
        } else {
          validCloudTests.forEach(t => knownTestIdsRef.current.add(t.id));
          isInitialSyncDoneRef.current = true;
        }

        // Extract questions from cloud tests as well
        setQuestions(prev => {
          const map = new Map(prev.map(q => [q.id, q]));
          let added = false;
          validCloudTests.forEach(ct => {
            if (Array.isArray(ct.questions)) {
              ct.questions.forEach(q => {
                if (q && q.id && !isSampleQuestion(q) && !map.has(q.id)) {
                  map.set(q.id, {
                    ...q,
                    imageUrl: q.imageUrl ? normalizeImageUrl(q.imageUrl) : q.imageUrl
                  });
                  added = true;
                }
              });
            }
          });
          return added ? Array.from(map.values()) : prev;
        });
      }
    });

    return () => {
      clearInterval(pollTimer);
      window.removeEventListener('focus', handleActiveSync);
      window.removeEventListener('online', handleActiveSync);
      window.removeEventListener('delivered_tests_updated', handleActiveSync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribeTests();
    };
  }, [syncAllTests]);

  // Check for shared test in URL (?code=... or #test=...) on mount and on hash changes
  useEffect(() => {
    const handleCheckUrlTest = async () => {
      const hash = window.location.hash;
      const search = window.location.search;

      // 1. Check for ?code=... or #code=...
      const urlParams = new URLSearchParams(search);
      let codeParam = urlParams.get('code');
      if (!codeParam && hash) {
        const hashMatch = hash.match(/code=([^&]+)/);
        if (hashMatch) codeParam = hashMatch[1];
      }

      if (codeParam) {
        const result = await fetchTestFromServer(codeParam);
        if (result && result.questions.length > 0) {
          setMode('student');

          setQuestions(prev => {
            const existingIds = new Set(prev.map(q => q.id));
            const newOnes = result.questions.filter(q => !existingIds.has(q.id));
            return [...prev, ...newOnes];
          });

          setDeliveredTests(prev => {
            const filtered = prev.filter(t => t.id !== result.test.id);
            return [result.test, ...filtered];
          });

          setReceivedTest(result);

          try {
            window.history.replaceState(null, '', window.location.pathname);
          } catch {
            // ignore
          }
          return;
        }
      }

      // 2. Fallback: Check for ?test=... or #test=... (compressed payload)
      const raw = hash || search;
      if (raw && (raw.includes('test=') || raw.startsWith('#test='))) {
        const decoded = decodeDeliveredTest(raw);
        if (decoded && decoded.questions.length > 0) {
          // Switch to student mode
          setMode('student');

          // Add questions to local database without duplicates
          setQuestions(prev => {
            const existingIds = new Set(prev.map(q => q.id));
            const newOnes = decoded.questions.filter(q => !existingIds.has(q.id));
            return [...prev, ...newOnes];
          });

          // Register in deliveredTests
          setDeliveredTests(prev => {
            const filtered = prev.filter(t => t.id !== decoded.test.id);
            return [decoded.test, ...filtered];
          });

          // Show the incoming test notification modal
          setReceivedTest(decoded);

          // Clean up URL hash so refresh doesn't trigger repeatedly
          try {
            window.history.replaceState(null, '', window.location.pathname);
          } catch {
            // ignore
          }
        }
      }
    };

    handleCheckUrlTest();
    window.addEventListener('hashchange', handleCheckUrlTest);
    return () => window.removeEventListener('hashchange', handleCheckUrlTest);
  }, []);

  // Save delivered tests and history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DELIVERED, JSON.stringify(deliveredTests));
    } catch (e) {
      console.error('Failed to save deliveredTests to localStorage', e);
    }
  }, [deliveredTests]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(quizHistory));
    } catch (e) {
      console.error('Failed to save quizHistory to localStorage', e);
    }
  }, [quizHistory]);

  // Start a Quiz
  const handleStartQuiz = (
    selectedQuestions: Question[],
    title: string,
    testId?: string,
    instantExplanation?: boolean
  ) => {
    setActiveQuiz({
      questions: selectedQuestions,
      title,
      testId,
      instantExplanation
    });
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Quiz Finish Handler
  const handleQuizFinish = (result: QuizAttemptResult) => {
    setQuizHistory(prev => [result, ...prev.filter(r => r.id !== result.id)]);
    recordQuizAttempt(result, activeQuiz?.questions || questions);
  };

  // Exit Quiz
  const handleExitQuiz = () => {
    setActiveQuiz(null);
  };

  // View Historical Result (Review Mode: shows previous score, user choices and detailed explanations)
  const handleViewHistoryResult = (result: QuizAttemptResult) => {
    const questionMap = new Map(questions.map(q => [q.id, q]));
    let matchedQuestions = (result.questionIds || [])
      .map(id => questionMap.get(id))
      .filter((q): q is Question => q !== undefined);

    // If not found in general pool, check deliveredTests
    if (matchedQuestions.length === 0 && result.testId) {
      const delivered = deliveredTests.find(t => t.id === result.testId);
      if (delivered && Array.isArray(delivered.questions) && delivered.questions.length > 0) {
        matchedQuestions = delivered.questions;
      }
    }

    if (matchedQuestions.length === 0) {
      alert('このテストの問題データが見つかりませんでした。');
      return;
    }

    setActiveQuiz({
      questions: matchedQuestions,
      title: result.testTitle,
      testId: result.testId,
      instantExplanation: true,
      initialSubmitted: true,
      initialUserAnswers: result.userAnswers || {},
      initialSubmissionStatus: 'submitted',
      isReviewMode: true
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Teacher actions
  const handleAddQuestion = (newQ: Question) => {
    setQuestions(prev => {
      const updated = [newQ, ...prev];
      saveQuestionsToServer(updated, false);
      saveQuestionsToCloud([newQ]);
      return updated;
    });
  };

  const handleImportQuestions = (imported: Question[], replace: boolean) => {
    if (replace) {
      setQuestions(imported);
      saveQuestionsToServer(imported, true);
      saveQuestionsToCloud(imported);
    } else {
      setQuestions(prev => {
        const existingIds = new Set(prev.map(q => q.id));
        const newOnes = imported.filter(q => !existingIds.has(q.id));
        const updated = [...prev, ...newOnes];
        saveQuestionsToServer(updated, false);
        saveQuestionsToCloud(newOnes);
        return updated;
      });
    }
  };

  const handleDeliverTest = async (test: DeliveredTest) => {
    const qs = (test.questions && test.questions.length > 0)
      ? test.questions
      : test.questionIds.map(id => questions.find(q => q.id === id)).filter((q): q is Question => q !== undefined);

    let assignedCode = test.code;
    try {
      // 1. Save to server API first to generate official 6-digit code
      const serverRes = await saveTestToServer(test, qs);
      if (serverRes && serverRes.code) {
        assignedCode = serverRes.code;
      }
    } catch (e) {
      console.warn('Server save error in handleDeliverTest:', e);
    }

    const updatedTest: DeliveredTest = {
      ...test,
      code: assignedCode || test.code,
      questions: qs
    };

    // 2. Update local state immediately & mark as known
    knownTestIdsRef.current.add(updatedTest.id);
    setDeliveredTests(prev => {
      const merged = [updatedTest, ...prev.filter(t => t.id !== test.id)];
      try {
        localStorage.setItem(STORAGE_KEY_DELIVERED, JSON.stringify(merged));
      } catch {}
      return merged;
    });

    // Notify other tabs and components immediately
    window.dispatchEvent(new CustomEvent('delivered_tests_updated'));

    // 3. Save to Firestore Cloud in background (non-blocking)
    saveDeliveredTestToCloud(updatedTest, qs).catch(err => {
      console.warn('Firestore cloud save notice:', err);
    });
  };

  const handleDeleteDeliveredTest = (testId: string) => {
    setConfirmAction({
      title: '配信小テストの削除',
      message: 'この小テストの配信を削除しますか？\n（学生はアクセスできなくなります）',
      confirmLabel: '削除する',
      onConfirm: async () => {
        setDeliveredTests(prev => prev.filter(t => t.id !== testId));
        await deleteDeliveredTestFromCloud(testId);
        try {
          await fetch(`/api/tests/${testId}`, { method: 'DELETE' });
        } catch (e) {
          console.warn('Failed to delete test from server API:', e);
        }
      }
    });
  };

  const handleClearAllQuestions = () => {
    setConfirmAction({
      title: '過去問データベースの初期化',
      message: '登録されているすべての過去問データを消去しますか？\n（この操作は元に戻せません）',
      confirmLabel: '消去する',
      onConfirm: () => {
        setQuestions([]);
        try {
          localStorage.removeItem(STORAGE_KEY_QUESTIONS);
        } catch {
          // ignore
        }
        saveQuestionsToServer([], true);
      }
    });
  };

  const handleSyncQuestionsToCloud = async (): Promise<{ success: boolean; count: number }> => {
    try {
      const serverOk = await saveQuestionsToServer(questions, false);
      const cloudOk = await saveQuestionsToCloud(questions);
      return { success: serverOk || cloudOk, count: questions.length };
    } catch {
      return { success: false, count: 0 };
    }
  };

  // Start received test immediately
  const handleStartReceivedTest = () => {
    if (!receivedTest) return;
    const { test, questions: testQs } = receivedTest;
    setReceivedTest(null);
    handleStartQuiz(testQs, test.title, test.id, false);
  };

  const handleSaveReceivedTestForLater = () => {
    setReceivedTest(null);
  };

  // Join test by 6-character code
  const handleJoinByCode = async (code: string): Promise<boolean> => {
    const result = await fetchTestFromServer(code);
    if (result && result.questions.length > 0) {
      setQuestions(prev => {
        const existingIds = new Set(prev.map(q => q.id));
        const newOnes = result.questions.filter(q => !existingIds.has(q.id));
        return [...prev, ...newOnes];
      });

      setDeliveredTests(prev => {
        const filtered = prev.filter(t => t.id !== result.test.id);
        return [result.test, ...filtered];
      });

      setReceivedTest(result);
      return true;
    }
    return false;
  };

  // Mode switch protection with 6-digit passcode
  const handleRequestSwitchMode = (targetMode: 'student' | 'teacher') => {
    if (targetMode === 'teacher') {
      if (isTeacherAuthenticated) {
        setMode('teacher');
      } else {
        setShowTeacherAuthModal(true);
      }
    } else {
      setMode('student');
    }
    if (activeQuiz) {
      setActiveQuiz(null); // Exit active quiz on mode switch
    }
  };

  const handleTeacherAuthSuccess = () => {
    setIsTeacherAuthenticated(true);
    setShowTeacherAuthModal(false);
    setMode('teacher');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-['Noto_Sans_JP','Plus_Jakarta_Sans',sans-serif]">
      {/* Top Navigation */}
      <Navbar
        mode={mode}
        onToggleMode={handleRequestSwitchMode}
        pendingTestsCount={deliveredTests.length}
      />

      {/* Offline Status Bar when disconnected */}
      <OfflineIndicator />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {activeQuiz ? (
          <QuizRunner
            questions={activeQuiz.questions}
            title={activeQuiz.title}
            testId={activeQuiz.testId}
            instantExplanationDefault={activeQuiz.instantExplanation}
            initialSubmitted={activeQuiz.initialSubmitted}
            initialUserAnswers={activeQuiz.initialUserAnswers}
            initialSubmissionStatus={activeQuiz.initialSubmissionStatus}
            isReviewMode={activeQuiz.isReviewMode}
            onFinish={handleQuizFinish}
            onExit={handleExitQuiz}
          />
        ) : mode === 'student' ? (
          <StudentView
            questions={questions}
            deliveredTests={deliveredTests}
            quizHistory={quizHistory}
            onStartQuiz={handleStartQuiz}
            onViewHistoryResult={handleViewHistoryResult}
            onSwitchToTeacherMode={() => handleRequestSwitchMode('teacher')}
            onJoinByCode={handleJoinByCode}
            onRefreshTests={syncAllTests}
          />
        ) : (
          <TeacherView
            questions={questions}
            deliveredTests={deliveredTests}
            onAddQuestion={handleAddQuestion}
            onImportQuestions={handleImportQuestions}
            onDeliverTest={handleDeliverTest}
            onDeleteDeliveredTest={handleDeleteDeliveredTest}
            onClearAllQuestions={handleClearAllQuestions}
            onSyncQuestionsToCloud={handleSyncQuestionsToCloud}
            onSwitchToStudentMode={() => setMode('student')}
          />
        )}
      </main>

      {/* Received Test Prompt Modal for Students arriving via Link or QR */}
      {receivedTest && (
        <ReceivedTestModal
          test={receivedTest.test}
          questions={receivedTest.questions}
          onStartNow={handleStartReceivedTest}
          onSaveForLater={handleSaveReceivedTestForLater}
        />
      )}

      {/* Real-time New Test Delivery Alert Toast for Students */}
      {newTestAlert && mode === 'student' && !activeQuiz && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 max-w-md w-[calc(100vw-2rem)] bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-teal-500/50 flex flex-col gap-3 animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500 text-white flex items-center justify-center shrink-0 shadow-md">
                <Bell className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <span className="text-[10px] font-black tracking-wider uppercase bg-teal-500/20 text-teal-300 border border-teal-500/40 px-2 py-0.5 rounded">
                  小テストが配信されました
                </span>
                <h4 className="font-bold text-sm text-white mt-1 line-clamp-1">
                  {newTestAlert.test.title}
                </h4>
                <p className="text-xs text-slate-300">
                  全{newTestAlert.test.totalQuestions || newTestAlert.questions.length}問
                  {newTestAlert.test.targetType === 'grade' && newTestAlert.test.targetGrades && (
                    <span>（{newTestAlert.test.targetGrades.join('・')}年生対象）</span>
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNewTestAlert(null)}
              className="text-slate-400 hover:text-white p-1 rounded transition-colors text-xs"
              title="閉じる"
            >
              ✕
            </button>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setNewTestAlert(null)}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              あとで
            </button>
            <button
              type="button"
              onClick={() => {
                const alertData = newTestAlert;
                setNewTestAlert(null);
                const testQs = alertData.questions.length > 0
                  ? alertData.questions
                  : alertData.test.questionIds.map(id => questions.find(q => q.id === id)).filter((q): q is Question => q !== undefined);
                
                if (testQs.length > 0) {
                  handleStartQuiz(testQs, alertData.test.title, alertData.test.id, true);
                } else {
                  handleJoinByCode(alertData.test.code || alertData.test.id);
                }
              }}
              className="px-4 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span>今すぐ受験する</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* In-app Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-amber-600">
              <div className="p-2 bg-amber-100 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">{confirmAction.title}</h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line">
              {confirmAction.message}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmAction.onConfirm();
                  setConfirmAction(null);
                }}
                className="px-4 py-2 text-xs sm:text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors"
              >
                {confirmAction.confirmLabel || '実行する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Teacher Auth Passcode Modal */}
      <TeacherAuthModal
        isOpen={showTeacherAuthModal}
        onSuccess={handleTeacherAuthSuccess}
        onClose={() => setShowTeacherAuthModal(false)}
      />

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <p>© 作業療法士 国家試験 演習＆小テスト プラットフォーム</p>
        <p className="mt-1 text-slate-400">Created by Shunsuke Usui.</p>
      </footer>
    </div>
  );
}
