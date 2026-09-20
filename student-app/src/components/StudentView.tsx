import React, { useState, useMemo, useEffect } from 'react';
import { Question, DeliveredTest, QuizAttemptResult, StudentLocalProfile } from '../types';
import { parseCategory, isPickTwoQuestion } from '../utils/categoryHelper';
import { StudentIdRegistrationModal } from './StudentIdRegistrationModal';
import { getStudentProfile, isTestEligibleForStudent } from '../services/studentRosterService';
import { 
  Search, 
  BookOpen, 
  Clock, 
  CheckCircle2, 
  CheckCircle,
  Play, 
  Award, 
  Filter, 
  Layers, 
  Sparkles,
  BarChart3,
  CheckSquare,
  RotateCcw,
  Image as ImageIcon,
  Loader2,
  Bell,
  ChevronRight,
  FileText,
  GraduationCap,
  UserCheck,
  Users,
  Edit3
} from 'lucide-react';

interface StudentViewProps {
  questions: Question[];
  deliveredTests: DeliveredTest[];
  quizHistory: QuizAttemptResult[];
  onStartQuiz: (
    selectedQuestions: Question[], 
    title: string, 
    testId?: string, 
    instantFeedback?: boolean
  ) => void;
  onViewHistoryResult: (result: QuizAttemptResult) => void;
  onJoinByCode?: (code: string) => Promise<boolean>;
}

export const StudentView: React.FC<StudentViewProps> = ({
  questions,
  deliveredTests,
  quizHistory,
  onStartQuiz,
  onViewHistoryResult,
  onJoinByCode
}) => {
  const [activeTab, setActiveTab] = useState<'practice' | 'today-tests' | 'history'>('practice');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [inputTestCode, setInputTestCode] = useState('');
  const [isJoiningCode, setIsJoiningCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Student device profile state
  const [studentProfile, setStudentProfile] = useState<StudentLocalProfile | null>(() => getStudentProfile());
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [filterMyGradeOnly, setFilterMyGradeOnly] = useState(true);
  const [registrationToast, setRegistrationToast] = useState<string | null>(null);

  // Eligible delivered tests filtered by student's grade / ID
  const eligibleDeliveredTests = useMemo(() => {
    if (!filterMyGradeOnly || !studentProfile) return deliveredTests;
    return deliveredTests.filter(t => isTestEligibleForStudent(t, studentProfile).eligible);
  }, [deliveredTests, filterMyGradeOnly, studentProfile]);

  const [selectedMajorCategory, setSelectedMajorCategory] = useState<string>('all');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [filterPickTwoOnly, setFilterPickTwoOnly] = useState<boolean>(false);
  const [filterHasImageOnly, setFilterHasImageOnly] = useState<boolean>(false);
  
  // 10-question increments selection (10 to 50, -1 for all)
  const [questionCountLimit, setQuestionCountLimit] = useState<number>(10);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [instantFeedbackMode, setInstantFeedbackMode] = useState(true);

  // Pagination for mobile safety (avoid rendering 4000+ DOM cards at once)
  const [visibleQuestionsCount, setVisibleQuestionsCount] = useState<number>(30);

  // Reset visible limit whenever filters change
  useEffect(() => {
    setVisibleQuestionsCount(30);
  }, [selectedMajorCategory, selectedSubCategory, selectedYear, filterPickTwoOnly, filterHasImageOnly, searchKeyword]);

  // Extract unique major categories
  const majorCategories = useMemo(() => {
    const set = new Set<string>();
    questions.forEach(q => {
      const p = parseCategory(q.category);
      const major = q.majorCategory || p.major;
      if (major) set.add(major);
    });
    return Array.from(set).sort();
  }, [questions]);

  // Extract unique subcategories (filtered by selected major category if set)
  const availableSubCategories = useMemo(() => {
    const set = new Set<string>();
    questions.forEach(q => {
      const p = parseCategory(q.category);
      const major = q.majorCategory || p.major;
      const sub = q.subCategory || p.sub;
      if ((selectedMajorCategory === 'all' || major === selectedMajorCategory) && sub) {
        set.add(sub);
      }
    });
    return Array.from(set).sort();
  }, [questions, selectedMajorCategory]);

  const years = useMemo(() => {
    const set = new Set<string>();
    questions.forEach(q => {
      if (q.year) set.add(String(q.year));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [questions]);

  // Filtered questions based on criteria
  const filteredQuestions = useMemo(() => {
    return questions.filter(q => {
      const p = parseCategory(q.category);
      const major = q.majorCategory || p.major;
      const sub = q.subCategory || p.sub;

      const matchMajor = selectedMajorCategory === 'all' || major === selectedMajorCategory;
      const matchSub = selectedSubCategory === 'all' || sub === selectedSubCategory;
      const matchYear = selectedYear === 'all' || String(q.year) === selectedYear;
      
      if (!matchMajor || !matchSub || !matchYear) return false;

      if (filterPickTwoOnly) {
        if (!isPickTwoQuestion(q.question, q.answer)) return false;
      }

      if (filterHasImageOnly) {
        if (!q.imageUrl) return false;
      }

      if (!searchKeyword.trim()) return true;

      const kw = searchKeyword.toLowerCase();
      return (
        q.id.toLowerCase().includes(kw) ||
        q.question.toLowerCase().includes(kw) ||
        q.explanation.toLowerCase().includes(kw) ||
        (q.category && q.category.toLowerCase().includes(kw)) ||
        (sub && sub.toLowerCase().includes(kw)) ||
        q.choices.some(c => c.toLowerCase().includes(kw))
      );
    });
  }, [questions, selectedMajorCategory, selectedSubCategory, selectedYear, searchKeyword, filterPickTwoOnly, filterHasImageOnly]);

  // Safe subset for rendering to prevent mobile DOM memory crash
  const visibleQuestions = useMemo(() => {
    return filteredQuestions.slice(0, visibleQuestionsCount);
  }, [filteredQuestions, visibleQuestionsCount]);

  // Launch practice session
  const handleStartPractice = () => {
    let pool = [...filteredQuestions];
    if (pool.length === 0) {
      alert('条件に一致する過去問がありません。検索条件を変更してください。');
      return;
    }

    if (shuffleQuestions) {
      pool.sort(() => Math.random() - 0.5);
    }

    const count = questionCountLimit === -1 ? pool.length : Math.min(pool.length, questionCountLimit);
    const selected = pool.slice(0, count);

    const categoryTitle = selectedMajorCategory === 'all' 
      ? '総合演習' 
      : `${selectedMajorCategory}${selectedSubCategory !== 'all' ? `（${selectedSubCategory}）` : ''}`;
    const title = `過去問演習（${categoryTitle}・${selected.length}問）`;

    onStartQuiz(selected, title, undefined, instantFeedbackMode);
  };

  // Launch single question
  const handleStartSingle = (question: Question) => {
    onStartQuiz([question], `第${question.year}回 ${question.id} 過去問演習`, undefined, true);
  };

  // Pending test waiting for student ID registration
  const [pendingTestToStart, setPendingTestToStart] = useState<DeliveredTest | null>(null);

  // Launch delivered test
  const handleStartDeliveredTest = (test: DeliveredTest, overrideProfile?: StudentLocalProfile | null) => {
    const activeProfile = overrideProfile !== undefined ? overrideProfile : (studentProfile || getStudentProfile());
    if (!activeProfile || !activeProfile.studentId) {
      setPendingTestToStart(test);
      setShowRegistrationModal(true);
      return;
    }

    const questionMap = new Map(questions.map(q => [q.id, q]));
    const testQuestions = (test.questions && test.questions.length > 0)
      ? test.questions
      : test.questionIds
          .map(id => questionMap.get(id))
          .filter((q): q is Question => q !== undefined);

    if (testQuestions.length === 0) {
      alert('この小テストの問題データが見つかりません。');
      return;
    }

    onStartQuiz(testQuestions, test.title, test.id, false);
  };

  const countOptions = [10, 20, 30, 40, 50, -1];

  const handleResetFilters = () => {
    setSelectedMajorCategory('all');
    setSelectedSubCategory('all');
    setSelectedYear('all');
    setSearchKeyword('');
    setFilterPickTwoOnly(false);
    setFilterHasImageOnly(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Banner / Student Greeting */}
      <div className="bg-gradient-to-r from-teal-700 to-teal-900 rounded-2xl p-6 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-teal-200 text-xs font-semibold tracking-wide uppercase flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            作業療法士 国家試験 対策ラーニング（学生専用）
          </span>
          <h1 className="text-xl sm:text-2xl font-bold mt-1">過去問演習 ＆ 今日の小テスト</h1>
          <p className="text-xs sm:text-sm text-teal-100 mt-1 max-w-xl">
            分野（大項目・中項目）や問題形式（単一正答・「2つ選べ」）で細かく指定し、10〜50問・全問単位で演習できます。
          </p>
        </div>

        {/* Student Profile Pill & Quick Stats */}
        <div className="flex flex-wrap items-center gap-3">
          {studentProfile ? (
            <div className="flex items-center gap-2.5 bg-white/15 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-white/20">
              <div className="p-1.5 bg-teal-600/60 rounded-lg">
                <GraduationCap className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-teal-200 uppercase tracking-wider">{studentProfile.grade}年生</span>
                  <span className="font-mono font-bold text-sm text-white tracking-wide">{studentProfile.studentId}</span>
                </div>
                <div className="text-[11px] text-teal-100">
                  {studentProfile.name ? studentProfile.name : '学生端末登録済'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRegistrationModal(true)}
                className="ml-1 p-1 text-teal-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="学籍番号・学年の変更"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowRegistrationModal(true)}
              className="px-3.5 py-2.5 bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 animate-pulse"
            >
              <UserCheck className="w-4 h-4" />
              <span>学籍番号を端末に登録</span>
            </button>
          )}

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-xs px-4 py-2.5 rounded-xl border border-white/15">
            <div className="text-center">
              <span className="text-[11px] text-teal-200 block">登録問題数</span>
              <span className="text-xl font-bold text-white">{questions.length}問</span>
            </div>
            <div className="h-7 w-px bg-white/20" />
            <div className="text-center">
              <span className="text-[11px] text-teal-200 block">配信小テスト</span>
              <span className="text-xl font-bold text-amber-300">{deliveredTests.length}件</span>
            </div>
          </div>
        </div>
      </div>

      {/* Unregistered Alert Banner */}
      {!studentProfile && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center justify-between gap-3 text-amber-900 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <GraduationCap className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="text-xs sm:text-sm">
              <span className="font-bold">学籍番号がまだ端末に登録されていません。</span>
              <span className="text-amber-700 ml-1 hidden sm:inline">
                学年や個人宛に配信された小テストを受信・解答するために、学籍番号と学年を登録してください。
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowRegistrationModal(true)}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition-colors whitespace-nowrap shadow-2xs"
          >
            今すぐ登録
          </button>
        </div>
      )}

      {/* Success Toast Notification */}
      {registrationToast && (
        <div className="bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
            <CheckCircle className="w-4 h-4 text-emerald-200 shrink-0" />
            <span>{registrationToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setRegistrationToast(null)}
            className="text-emerald-200 hover:text-white p-1 rounded-md"
          >
            ×
          </button>
        </div>
      )}

      {/* Student Profile Registration Modal */}
      <StudentIdRegistrationModal
        isOpen={showRegistrationModal}
        initialProfile={studentProfile}
        onClose={() => {
          setShowRegistrationModal(false);
          setPendingTestToStart(null);
        }}
        onSaved={(newProfile) => {
          setStudentProfile(newProfile);
          setShowRegistrationModal(false);
          setRegistrationToast(`学籍番号「${newProfile.studentId}」（${newProfile.grade}年生）をこの端末に登録しました！`);
          setTimeout(() => setRegistrationToast(null), 5000);
          if (pendingTestToStart) {
            const test = pendingTestToStart;
            setPendingTestToStart(null);
            handleStartDeliveredTest(test, newProfile);
          }
        }}
      />

      {/* Tabs */}
      <div className="flex border-b border-slate-200 space-x-2 sm:space-x-4">
        <button
          onClick={() => setActiveTab('practice')}
          className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'practice'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>過去問検索・演習</span>
        </button>

        <button
          onClick={() => setActiveTab('today-tests')}
          className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center space-x-2 transition-colors relative ${
            activeTab === 'today-tests'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>今日のテスト</span>
          {deliveredTests.length > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs animate-pulse">
              <span>{deliveredTests.length}</span>
              <span className="hidden sm:inline text-[9px]">配信中</span>
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'history'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>学習履歴・成績</span>
          {quizHistory.length > 0 && (
            <span className="bg-slate-200 text-slate-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {quizHistory.length}
            </span>
          )}
        </button>
      </div>

      {/* 🔔 配信中の小テストがある場合の通知バナー */}
      {deliveredTests.length > 0 && activeTab === 'practice' && (
        <div className="bg-gradient-to-r from-amber-500/15 via-teal-500/10 to-emerald-500/15 border-2 border-amber-400/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-fade-in">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md">
              <Bell className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-black uppercase tracking-wider bg-amber-500 text-white px-2 py-0.5 rounded-md shadow-2xs">
                  教員から小テストが届いています
                </span>
                <span className="text-xs font-semibold text-slate-600">
                  {deliveredTests.length}件配信中
                </span>
              </div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base mt-1">
                {deliveredTests[0].title}
                <span className="text-xs font-normal text-slate-500 ml-2">
                  （全{deliveredTests[0].totalQuestions || deliveredTests[0].questions?.length || deliveredTests[0].questionIds?.length || 0}問）
                </span>
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('today-tests')}
              className="w-full sm:w-auto px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>小テスト一覧・受験画面へ</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: 過去問検索・演習 */}
      {activeTab === 'practice' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Search & Settings Controls */}
          <div className="lg:col-span-1 space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 flex items-center">
                  <Search className="w-4 h-4 text-teal-600 mr-1.5" />
                  過去問検索フィルター
                </h2>
                {(selectedMajorCategory !== 'all' || selectedSubCategory !== 'all' || selectedYear !== 'all' || searchKeyword || filterPickTwoOnly) && (
                  <button
                    onClick={handleResetFilters}
                    className="text-xs text-slate-500 hover:text-teal-700 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    リセット
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  キーワード検索
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="問題文、解説、ID（例: 61-AM）"
                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  分野（大項目）
                </label>
                <select
                  value={selectedMajorCategory}
                  onChange={(e) => {
                    setSelectedMajorCategory(e.target.value);
                    setSelectedSubCategory('all');
                  }}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-medium"
                >
                  <option value="all">すべての分野（大項目） ({questions.length}問)</option>
                  {majorCategories.map(cat => {
                    const count = questions.filter(q => {
                      const p = parseCategory(q.category);
                      return (q.majorCategory || p.major) === cat;
                    }).length;
                    return (
                      <option key={cat} value={cat}>
                        {cat} ({count}問)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  中項目（（）内指定）
                </label>
                <select
                  value={selectedSubCategory}
                  onChange={(e) => setSelectedSubCategory(e.target.value)}
                  disabled={availableSubCategories.length === 0}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50 font-medium"
                >
                  <option value="all">すべての中項目 ({availableSubCategories.length > 0 ? '指定なし' : '中項目なし'})</option>
                  {availableSubCategories.map(sub => {
                    const count = questions.filter(q => {
                      const p = parseCategory(q.category);
                      const majorMatch = selectedMajorCategory === 'all' || (q.majorCategory || p.major) === selectedMajorCategory;
                      return majorMatch && (q.subCategory || p.sub) === sub;
                    }).length;
                    return (
                      <option key={sub} value={sub}>
                        {sub} ({count}問)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  実施回・年
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                >
                  <option value="all">すべての年度</option>
                  {years.map(y => (
                    <option key={y} value={y}>
                      第{y}回 国家試験
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-2">
                <label className="flex items-center space-x-2 text-xs font-semibold text-slate-700 cursor-pointer bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 hover:bg-teal-50/50 hover:border-teal-200 transition-colors">
                  <input
                    type="checkbox"
                    checked={filterPickTwoOnly}
                    onChange={(e) => setFilterPickTwoOnly(e.target.checked)}
                    className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                  />
                  <span className="flex items-center gap-1.5">
                    <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                      2つ選べ
                    </span>
                    「2つ選べ」問題のみに絞り込む
                  </span>
                </label>

                <label className="flex items-center space-x-2 text-xs font-semibold text-slate-700 cursor-pointer bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 hover:bg-teal-50/50 hover:border-teal-200 transition-colors">
                  <input
                    type="checkbox"
                    checked={filterHasImageOnly}
                    onChange={(e) => setFilterHasImageOnly(e.target.checked)}
                    className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                  />
                  <span className="flex items-center gap-1.5">
                    <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                      <ImageIcon className="w-3 h-3" />
                      図・画像
                    </span>
                    「図・画像あり」問題のみに絞り込む
                  </span>
                </label>
              </div>
            </div>

            {/* Practice Setup Card: 10〜50問、全問選択 */}
            <div className="bg-white rounded-2xl border border-teal-200 bg-teal-50/20 p-5 shadow-xs space-y-4">
              <h2 className="text-sm font-bold text-slate-900 flex items-center">
                <Layers className="w-4 h-4 text-teal-600 mr-1.5" />
                出題問題数の設定（10〜50問・全問）
              </h2>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  出題数を選択:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {countOptions.map(cnt => {
                    const label = cnt === -1 ? '全問' : `${cnt}問`;
                    const isSelected = questionCountLimit === cnt;
                    return (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setQuestionCountLimit(cnt)}
                        className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  ※現在の抽出問題数: <strong>{filteredQuestions.length}問</strong>
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                <label className="flex items-center space-x-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={shuffleQuestions}
                    onChange={(e) => setShuffleQuestions(e.target.checked)}
                    className="rounded text-teal-600 focus:ring-teal-500"
                  />
                  <span>問題をランダム順に出題する</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={instantFeedbackMode}
                    onChange={(e) => setInstantFeedbackMode(e.target.checked)}
                    className="rounded text-teal-600 focus:ring-teal-500"
                  />
                  <span>1問ごとに正解・解説をすぐ確認する</span>
                </label>
              </div>

              <button
                type="button"
                onClick={handleStartPractice}
                disabled={filteredQuestions.length === 0}
                className="w-full py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-2"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>
                  演習を開始する ({questionCountLimit === -1 ? filteredQuestions.length : Math.min(filteredQuestions.length, questionCountLimit)}問)
                </span>
              </button>
            </div>
          </div>

          {/* Right Column: Question List Preview */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-slate-200">
              <div className="text-xs font-semibold text-slate-700 flex items-center space-x-2">
                <Filter className="w-4 h-4 text-teal-600" />
                <span>検索該当: <strong className="text-teal-700 font-bold">{filteredQuestions.length}</strong> 問</span>
                {selectedMajorCategory !== 'all' && (
                  <span className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded text-[11px]">
                    {selectedMajorCategory}
                    {selectedSubCategory !== 'all' && `（${selectedSubCategory}）`}
                  </span>
                )}
                {filterPickTwoOnly && (
                  <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[11px] font-bold">
                    2つ選べ
                  </span>
                )}
              </div>
            </div>

            {questions.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 sm:p-10 text-center text-slate-500 space-y-4 shadow-xs">
                <div className="flex justify-center">
                  <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center text-teal-600">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-base text-slate-800">過去問データを読み込み中...</p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {deliveredTests.length > 0
                      ? '配信中の小テストを受験する場合は、上の「今日のテスト」タブを開いてください。'
                      : 'サーバーから過去問データを取得しています。数秒お待ちください。'}
                  </p>
                </div>
                {deliveredTests.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('today-tests')}
                    className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors inline-flex items-center gap-2"
                  >
                    <span>配信中の小テスト一覧へ進む（{deliveredTests.length}件）</span>
                  </button>
                )}
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 space-y-2">
                <Filter className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="font-semibold text-sm">該当する過去問が見つかりません</p>
                <p className="text-xs">分野や中項目、キーワードを変更して検索してください。</p>
                <button
                  onClick={handleResetFilters}
                  className="text-xs text-teal-600 underline font-semibold mt-2"
                >
                  フィルターをリセット
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[720px] overflow-y-auto pr-1">
                {visibleQuestions.map(q => {
                  const p = parseCategory(q.category);
                  const major = q.majorCategory || p.major;
                  const sub = q.subCategory || p.sub;
                  const isPick2 = isPickTwoQuestion(q.question, q.answer);

                  return (
                    <div
                      key={q.id}
                      className="bg-white rounded-xl border border-slate-200 p-4 hover:border-teal-300 transition-colors shadow-2xs space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center flex-wrap gap-1.5">
                          <span className="font-mono text-xs font-bold bg-slate-900 text-white px-2 py-0.5 rounded">
                            {q.id}
                          </span>
                          <span className="text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded">
                            {major}
                          </span>
                          {sub && (
                            <span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                              {sub}
                            </span>
                          )}
                          {isPick2 && (
                            <span className="text-[11px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded flex items-center gap-1">
                              <CheckSquare className="w-3 h-3" />
                              2つ選べ
                            </span>
                          )}
                          {q.imageUrl && (
                            <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded flex items-center gap-1">
                              <ImageIcon className="w-3 h-3 text-indigo-600" />
                              図・画像あり
                            </span>
                          )}
                          <span className="text-xs text-slate-500">
                            第{q.year}回
                          </span>
                        </div>

                        <button
                          onClick={() => handleStartSingle(q)}
                          className="text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-1 rounded-lg transition-colors flex items-center space-x-1 shrink-0"
                        >
                          <Play className="w-3 h-3 fill-teal-700" />
                          <span>この問題を解く</span>
                        </button>
                      </div>

                      <p className="text-sm font-medium text-slate-800 line-clamp-2">
                        {q.question}
                      </p>

                      <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                        {q.choices.map((c, i) => (
                          <span key={i} className="truncate max-w-[200px]">
                            {i + 1}. {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {filteredQuestions.length > visibleQuestionsCount && (
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 mt-2">
                    <p className="text-xs text-slate-600 font-medium">
                      全 <strong className="text-slate-900 font-bold">{filteredQuestions.length}</strong> 問中 <strong className="text-teal-700 font-bold">{visibleQuestionsCount}</strong> 問を表示中
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setVisibleQuestionsCount(prev => Math.min(prev + 30, filteredQuestions.length))}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
                      >
                        さらに30問を表示
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisibleQuestionsCount(filteredQuestions.length)}
                        className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                      >
                        全件表示
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: 今日のテスト (教員配信) */}
      {activeTab === 'today-tests' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">教員から配信された小テスト</h2>
              <p className="text-xs sm:text-sm text-slate-500">学年や個人宛に配信された「今日のテスト」がここに表示されます。</p>
            </div>

            {/* Grade Filter Toggle */}
            {studentProfile && (
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setFilterMyGradeOnly(true)}
                  className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                    filterMyGradeOnly
                      ? 'bg-white text-teal-800 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5 text-teal-600" />
                  <span>{studentProfile.grade}年生宛のみ表示</span>
                  <span className="bg-teal-100 text-teal-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                    {deliveredTests.filter(t => isTestEligibleForStudent(t, studentProfile).eligible).length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMyGradeOnly(false)}
                  className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                    !filterMyGradeOnly
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>全件表示</span>
                  <span className="bg-slate-200 text-slate-700 text-[10px] px-1.5 py-0.2 rounded-full">
                    {deliveredTests.length}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Test Code Entry Box */}
          {onJoinByCode && (
            <div className="bg-gradient-to-r from-indigo-50/80 to-indigo-100/50 border border-indigo-200 rounded-2xl p-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">小テスト参加コードをお持ちですか？</h3>
                    <p className="text-xs text-slate-600">先生から伝えられた6桁のコードを入力して直接参加できます</p>
                  </div>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!inputTestCode.trim() || isJoiningCode) return;
                    setCodeError(null);
                    setIsJoiningCode(true);
                    try {
                      const success = await onJoinByCode(inputTestCode.trim());
                      if (success) {
                        setInputTestCode('');
                      } else {
                        setCodeError('該当する小テストが見つかりませんでした。コードをご確認ください。');
                      }
                    } catch {
                      setCodeError('小テストの取得に失敗しました。');
                    } finally {
                      setIsJoiningCode(false);
                    }
                  }}
                  className="flex items-center gap-2 w-full sm:w-auto"
                >
                  <input
                    type="text"
                    placeholder="例: K9X2P4"
                    value={inputTestCode}
                    onChange={(e) => {
                      setInputTestCode(e.target.value.toUpperCase());
                      if (codeError) setCodeError(null);
                    }}
                    maxLength={10}
                    className="uppercase font-mono text-sm px-3.5 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none w-full sm:w-36 text-center font-bold tracking-wider text-indigo-900 placeholder:text-slate-400 placeholder:font-normal"
                  />
                  <button
                    type="submit"
                    disabled={!inputTestCode.trim() || isJoiningCode}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors shrink-0 shadow-xs cursor-pointer"
                  >
                    {isJoiningCode ? '取得中...' : 'テストを受験'}
                  </button>
                </form>
              </div>
              {codeError && (
                <p className="text-xs text-rose-600 font-medium mt-2 text-right">
                  ⚠️ {codeError}
                </p>
              )}
            </div>
          )}

          {eligibleDeliveredTests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 space-y-3">
              <Clock className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="font-bold text-base text-slate-700">
                {studentProfile && filterMyGradeOnly
                  ? `${studentProfile.grade}年生向けに配信された小テストはありません`
                  : '配信された小テストはありません'}
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {studentProfile && filterMyGradeOnly ? (
                  <span>
                    全学年や他学年向けのテストを確認したい場合は、右上の「全件表示」を押してください。
                  </span>
                ) : (
                  <span>先生から小テストが配信されると、ここに表示されます。</span>
                )}
              </p>
              {studentProfile && filterMyGradeOnly && deliveredTests.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterMyGradeOnly(false)}
                  className="mt-2 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors inline-block"
                >
                  すべての配信テスト ({deliveredTests.length}件) を表示
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {eligibleDeliveredTests.map(test => {
                const historyMatch = quizHistory.find(h => h.testId === test.id);
                const isPersonalTarget = test.targetType === 'individual' && studentProfile && test.targetStudentIds?.includes(studentProfile.studentId.toUpperCase());

                return (
                  <div
                    key={test.id}
                    className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:shadow-sm transition-all space-y-4 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full flex items-center">
                            <Clock className="w-3 h-3 mr-1" />
                            今日のテスト
                          </span>

                          {test.targetType === 'grade' && test.targetGrades && test.targetGrades.length > 0 && (
                            <span className="text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                              <GraduationCap className="w-3 h-3 text-teal-600" />
                              <span>{test.targetGrades.join('・')}年生対象</span>
                            </span>
                          )}

                          {test.targetType === 'individual' && (
                            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border ${
                              isPersonalTarget
                                ? 'bg-purple-50 text-purple-800 border-purple-300 font-extrabold'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}>
                              <Users className="w-3 h-3" />
                              <span>{isPersonalTarget ? '✨ あなた宛の配信' : '特定学生限定'}</span>
                            </span>
                          )}

                          {(!test.targetType || test.targetType === 'all') && (
                            <span className="text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                              全学年共通
                            </span>
                          )}

                          {test.code && (
                            <span className="text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md">
                              コード: {test.code}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400">
                          {new Date(test.createdAt).toLocaleDateString('ja-JP')}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-slate-900 mb-1">
                        {test.title}
                      </h3>

                      {test.instructions && (
                        <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-3">
                          💬 {test.instructions}
                        </p>
                      )}

                      <div className="flex items-center space-x-3 text-xs text-slate-500 flex-wrap gap-y-1">
                        <span>
                          問題数: <strong className="text-slate-800">{test.totalQuestions || test.questions?.length || test.questionIds?.length || 0} 問</strong>
                        </span>
                        {test.category && (
                          <>
                            <span>•</span>
                            <span>対象分野: <strong className="text-teal-700">{test.category}</strong></span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                      {historyMatch ? (
                        <div className="flex items-center space-x-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs font-semibold text-emerald-700">
                            受験済み ({historyMatch.scorePercent}点)
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                          未解答
                        </span>
                      )}

                      <div className="flex items-center gap-2">
                        {historyMatch && (
                          <button
                            onClick={() => onViewHistoryResult(historyMatch)}
                            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>前回の結果・解説</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleStartDeliveredTest(test)}
                          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>{historyMatch ? 'もう一度解く' : 'テストを開始する'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: 学習履歴・成績 */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">演習および小テストの解答履歴</h2>
            <p className="text-xs sm:text-sm text-slate-500">過去の正答率と見直しが確認できます。</p>
          </div>

          {quizHistory.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 space-y-2">
              <Award className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="font-semibold text-slate-700 text-sm">まだ解答履歴がありません</p>
              <p className="text-xs">「過去問検索・演習」や「今日のテスト」を解答するとここに結果が保存されます。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {quizHistory.map(res => (
                <div
                  key={res.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        res.scorePercent >= 60 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {res.scorePercent >= 60 ? '基準到達' : '再挑戦'}
                      </span>
                      <span className="text-xs text-slate-400">{res.date}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">{res.testTitle}</h3>
                    <p className="text-xs text-slate-500">
                      正答数: {res.correctCount} / {res.totalQuestions} 問 ({res.scorePercent}%)
                    </p>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className={`text-xl font-extrabold ${res.scorePercent >= 60 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {res.scorePercent}点
                    </span>
                    <button
                      onClick={() => onViewHistoryResult(res)}
                      className="px-3.5 py-2 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>前回の結果・解説を見直す</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
