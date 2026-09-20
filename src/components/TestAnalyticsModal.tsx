import React, { useState, useEffect, useMemo } from 'react';
import { 
  DeliveredTest, 
  Question, 
  SubmissionRecord 
} from '../types';
import { 
  subscribeSubmissionsForTest 
} from '../services/testSyncService';
import { 
  X, 
  Users, 
  Award, 
  TrendingUp, 
  Download, 
  Search, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  BarChart3, 
  Clock, 
  ArrowUpDown,
  ChevronRight,
  Eye,
  RefreshCw,
  FileSpreadsheet,
  BookOpen,
  FileText,
  Lightbulb,
  GraduationCap,
  Printer,
  Sparkles,
  ClipboardList,
  Copy,
  Check,
  ChevronLeft,
  Target,
  User
} from 'lucide-react';
import { isPickTwoQuestion, evaluateAnswer, parseCategory } from '../utils/categoryHelper';
import { StudentFeedbackSheetModal } from './StudentFeedbackSheetModal';

interface TestAnalyticsModalProps {
  test: DeliveredTest;
  questions: Question[];
  initialTab?: 'students' | 'questions' | 'guidance';
  onOpenComprehensiveGuidance?: (studentId?: string) => void;
  onClose: () => void;
}

export const TestAnalyticsModal: React.FC<TestAnalyticsModalProps> = ({
  test,
  questions,
  initialTab = 'students',
  onOpenComprehensiveGuidance,
  onClose
}) => {
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'students' | 'questions' | 'guidance'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'scoreHigh' | 'scoreLow' | 'name'>('date');
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<SubmissionRecord | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackStudentId, setFeedbackStudentId] = useState<string | undefined>(undefined);
  const [feedbackSheetMode, setFeedbackSheetMode] = useState<'guidance' | 'feedback'>('guidance');
  const [guidanceViewMode, setGuidanceViewMode] = useState<'individual' | 'class'>('individual');
  const [selectedGuidanceStudentId, setSelectedGuidanceStudentId] = useState<string>('');
  const [copiedGuidanceToast, setCopiedGuidanceToast] = useState(false);
  const [individualGuidanceNotes, setIndividualGuidanceNotes] = useState<Record<string, string>>({});

  // Subscribe to submissions for this test in real time
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1500);

    const unsubscribe = subscribeSubmissionsForTest(test.id, (records) => {
      setSubmissions(records);
      setLoading(false);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [test.id]);

  // Overall Statistics Calculations
  const stats = useMemo(() => {
    const totalSubmissions = submissions.length;
    if (totalSubmissions === 0) {
      return {
        count: 0,
        avgScore: 0,
        avgPercent: 0,
        passCount: 0,
        passRate: 0,
        maxScore: 0,
        minScore: 0
      };
    }

    const scores = submissions.map(s => s.score);
    const percents = submissions.map(s => s.scorePercent);
    const passCount = submissions.filter(s => s.passed).length;
    const avgScore = scores.reduce((a, b) => a + b, 0) / totalSubmissions;
    const avgPercent = percents.reduce((a, b) => a + b, 0) / totalSubmissions;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);

    return {
      count: totalSubmissions,
      avgScore: Number(avgScore.toFixed(1)),
      avgPercent: Number(avgPercent.toFixed(1)),
      passCount,
      passRate: Number(((passCount / totalSubmissions) * 100).toFixed(1)),
      maxScore,
      minScore
    };
  }, [submissions]);

  // Question-by-question analytics
  const questionAnalytics = useMemo(() => {
    if (!questions || questions.length === 0) return [];

    return questions.map((q, idx) => {
      const qId = q.id;
      const isPick2 = isPickTwoQuestion(q.question, q.answer);
      const correctAnswers = Array.isArray(q.answer) ? q.answer : [q.answer];

      let correctCount = 0;
      // Frequency for choice 1, 2, 3, 4, 5
      const choiceCounts = [0, 0, 0, 0, 0];

      submissions.forEach(sub => {
        const answers = sub.userAnswers?.[qId] || [];
        // count choices
        answers.forEach(c => {
          if (c >= 1 && c <= 5) {
            choiceCounts[c - 1]++;
          }
        });

        // check correct
        let isCorrect = false;
        if (isPick2) {
          isCorrect = answers.length === 2 && answers.every(a => correctAnswers.includes(a));
        } else {
          isCorrect = answers.length === 1 && correctAnswers.includes(answers[0]);
        }

        if (isCorrect) {
          correctCount++;
        }
      });

      const totalResponses = submissions.length;
      const accuracyPercent = totalResponses > 0 
        ? Number(((correctCount / totalResponses) * 100).toFixed(1)) 
        : 0;

      return {
        question: q,
        index: idx,
        accuracyPercent,
        correctCount,
        totalResponses,
        choiceCounts,
        isPick2,
        correctAnswers
      };
    });
  }, [questions, submissions]);

  // Category-level Analytics & Weakness Analysis
  const categoryAnalytics = useMemo(() => {
    if (!questions || questions.length === 0 || submissions.length === 0) return [];

    const catMap = new Map<string, {
      major: string;
      subCategories: Set<string>;
      questions: Question[];
      totalResponses: number;
      correctCount: number;
    }>();

    questions.forEach(q => {
      const p = parseCategory(q.category);
      const major = p.major || '未分類';
      if (!catMap.has(major)) {
        catMap.set(major, {
          major,
          subCategories: new Set(),
          questions: [],
          totalResponses: 0,
          correctCount: 0
        });
      }
      const item = catMap.get(major)!;
      if (p.sub) item.subCategories.add(p.sub);
      item.questions.push(q);
    });

    // Evaluate answers across all submissions
    submissions.forEach(sub => {
      questions.forEach(q => {
        const p = parseCategory(q.category);
        const major = p.major || '未分類';
        const item = catMap.get(major);
        if (!item) return;

        item.totalResponses += 1;
        const userAns = sub.userAnswers?.[q.id] || [];
        const evalRes = evaluateAnswer(userAns, q.answer, q.question);
        if (evalRes.isCorrect) {
          item.correctCount += 1;
        }
      });
    });

    return Array.from(catMap.values()).map(item => {
      const accuracyPercent = item.totalResponses > 0 
        ? Number(((item.correctCount / item.totalResponses) * 100).toFixed(1))
        : 0;
      const errorCount = item.totalResponses - item.correctCount;
      const errorPercent = Number((100 - accuracyPercent).toFixed(1));

      return {
        major: item.major,
        subCategories: Array.from(item.subCategories),
        questionCount: item.questions.length,
        totalResponses: item.totalResponses,
        correctCount: item.correctCount,
        errorCount,
        accuracyPercent,
        errorPercent,
        questions: item.questions,
        status: accuracyPercent < 50 ? 'critical' : accuracyPercent < 70 ? 'warning' : 'good'
      };
    }).sort((a, b) => a.accuracyPercent - b.accuracyPercent); // Lowest accuracy first (weakest first)
  }, [questions, submissions]);

  // Questions sorted by lowest accuracy (most mistakes first)
  const mistakeRanking = useMemo(() => {
    if (submissions.length === 0) return [];
    
    return [...questionAnalytics]
      .filter(q => q.totalResponses > 0)
      .map(item => {
        // Find most common wrong distractor
        let maxDistractorChoice = -1;
        let maxDistractorCount = 0;
        
        item.choiceCounts.forEach((count, idx) => {
          const choiceNum = idx + 1;
          const isCorrect = item.correctAnswers.includes(choiceNum);
          if (!isCorrect && count > maxDistractorCount) {
            maxDistractorCount = count;
            maxDistractorChoice = choiceNum;
          }
        });

        const distractorPercent = item.totalResponses > 0 
          ? Math.round((maxDistractorCount / item.totalResponses) * 100)
          : 0;

        return {
          ...item,
          errorCount: item.totalResponses - item.correctCount,
          errorPercent: Number((100 - item.accuracyPercent).toFixed(1)),
          maxDistractorChoice,
          maxDistractorCount,
          distractorPercent
        };
      })
      .sort((a, b) => a.accuracyPercent - b.accuracyPercent); // lowest accuracy first
  }, [questionAnalytics, submissions.length]);

  // Filtered & Sorted Submissions
  const filteredSubmissions = useMemo(() => {
    let list = [...submissions];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(s => 
        s.studentName.toLowerCase().includes(q) || 
        (s.studentId && s.studentId.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      }
      if (sortBy === 'scoreHigh') {
        return b.scorePercent - a.scorePercent;
      }
      if (sortBy === 'scoreLow') {
        return a.scorePercent - b.scorePercent;
      }
      if (sortBy === 'name') {
        return a.studentName.localeCompare(b.studentName, 'ja');
      }
      return 0;
    });

    return list;
  }, [submissions, searchQuery, sortBy]);

  // Selected student for individual guidance view in Tab 3
  const activeGuidanceStudent = useMemo(() => {
    if (submissions.length === 0) return null;
    if (selectedGuidanceStudentId) {
      const found = submissions.find(s => s.id === selectedGuidanceStudentId || s.studentId === selectedGuidanceStudentId);
      if (found) return found;
    }
    return submissions[0];
  }, [submissions, selectedGuidanceStudentId]);

  // Detailed weakness and question analysis for the selected individual student
  const activeStudentAnalysis = useMemo(() => {
    if (!activeGuidanceStudent) return null;
    const sub = activeGuidanceStudent;

    const wrongQuestions: Array<{
      question: Question;
      questionIndex: number;
      userSelected: number[];
      targetAnswers: number[];
      isPickTwo: boolean;
      categoryMajor: string;
      categorySub: string;
    }> = [];

    const categoryMap = new Map<string, { total: number; correct: number; incorrect: number; subCategories: Set<string> }>();

    questions.forEach((q, idx) => {
      const userAns = sub.userAnswers?.[q.id] || [];
      const evalRes = evaluateAnswer(userAns, q.answer, q.question);
      const p = parseCategory(q.category);
      const catKey = p.major || '一般';

      if (!categoryMap.has(catKey)) {
        categoryMap.set(catKey, { total: 0, correct: 0, incorrect: 0, subCategories: new Set() });
      }
      const cStat = categoryMap.get(catKey)!;
      cStat.total += 1;
      if (p.sub) cStat.subCategories.add(p.sub);

      if (evalRes.isCorrect) {
        cStat.correct += 1;
      } else {
        cStat.incorrect += 1;
        wrongQuestions.push({
          question: q,
          questionIndex: idx + 1,
          userSelected: evalRes.userSelected,
          targetAnswers: evalRes.targetAnswers,
          isPickTwo: evalRes.isPickTwo,
          categoryMajor: p.major,
          categorySub: p.sub
        });
      }
    });

    const categorySummary = Array.from(categoryMap.entries()).map(([name, stat]) => {
      const accuracyPercent = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
      const catClassData = categoryAnalytics.find(c => c.major === name);
      const classAvg = catClassData ? catClassData.accuracyPercent : accuracyPercent;
      const diff = accuracyPercent - classAvg;

      let priority: 'critical' | 'warning' | 'good' = 'good';
      if (accuracyPercent < 50 || stat.incorrect >= 2) {
        priority = 'critical';
      } else if (accuracyPercent < 80 && stat.incorrect > 0) {
        priority = 'warning';
      }

      return {
        name,
        subCategories: Array.from(stat.subCategories),
        total: stat.total,
        correct: stat.correct,
        incorrect: stat.incorrect,
        accuracyPercent,
        classAvg,
        diff,
        priority
      };
    }).sort((a, b) => a.accuracyPercent - b.accuracyPercent);

    const weakCategories = categorySummary.filter(c => c.incorrect > 0);
    const primaryWeak = weakCategories.length > 0 ? weakCategories[0] : null;

    // Generated tutoring guidance tip
    let tutoringPlan = '';
    if (primaryWeak) {
      tutoringPlan = `【最優先重点指導分野: ${primaryWeak.name}】（正答率${primaryWeak.accuracyPercent}%、失点${primaryWeak.incorrect}問）\n・基礎概念のキーワードと定義を口頭試問で確認し、なぜ誤答選択肢を選んだのかの思考回路を点検する。\n・同分野の過去問類似問題を2〜3問追加出題して定着を確認する。`;
    } else {
      tutoringPlan = '全問正解または高得点のため、応用問題や複合問題の過去問を提示してさらなる得点源としての深化を図る。';
    }

    return {
      submission: sub,
      wrongQuestions,
      categorySummary,
      weakCategories,
      primaryWeak,
      tutoringPlan
    };
  }, [activeGuidanceStudent, questions, categoryAnalytics]);

  // Export to Excel / CSV with BOM
  const handleExportCSV = () => {
    if (submissions.length === 0) {
      alert('出力する提出データがありません。');
      return;
    }

    const headers = [
      '学籍番号',
      '氏名',
      '提出日時',
      '得点',
      '総問題数',
      '正答率(%)',
      '合否判定',
      ...questions.map((_, i) => `問${i + 1}(正誤)`)
    ];

    const rows = submissions.map(s => {
      const perQuestionResults = questions.map(q => {
        const answers = s.userAnswers?.[q.id] || [];
        const correctAnswers = Array.isArray(q.answer) ? q.answer : [q.answer];
        const isPick2 = isPickTwoQuestion(q.question, q.answer);
        let isCorrect = false;
        if (isPick2) {
          isCorrect = answers.length === 2 && answers.every(a => correctAnswers.includes(a));
        } else {
          isCorrect = answers.length === 1 && correctAnswers.includes(answers[0]);
        }
        return isCorrect ? '正解' : `不正解(選:${answers.join(',') || '無'})`;
      });

      return [
        `"${s.studentId || ''}"`,
        `"${s.studentName.replace(/"/g, '""')}"`,
        `"${new Date(s.submittedAt).toLocaleString('ja-JP')}"`,
        s.score,
        s.total,
        `${s.scorePercent}%`,
        s.passed ? '合格' : '要復習',
        ...perQuestionResults.map(r => `"${r}"`)
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${test.title}_提出成績一覧_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Copy guidance summary text to clipboard
  const handleCopyGuidanceText = () => {
    if (!activeStudentAnalysis) return;
    const { submission, primaryWeak, wrongQuestions, categorySummary, tutoringPlan } = activeStudentAnalysis;
    const teacherNote = individualGuidanceNotes[submission.id] || '';

    const text = `【個別苦手分析・指導資料】
学生氏名: ${submission.studentName} (学籍番号: ${submission.studentId || '未設定'})
テスト名: ${test.title}
得点: ${submission.score} / ${submission.total} 問 (${submission.scorePercent}%) - ${submission.passed ? '合格' : '要復習'}
クラス平均比: ${(submission.scorePercent - stats.avgPercent) >= 0 ? '+' : ''}${(submission.scorePercent - stats.avgPercent).toFixed(1)}% (クラス平均: ${stats.avgPercent.toFixed(1)}%)

■ 最優先補強分野:
${primaryWeak ? `${primaryWeak.name} (正答率: ${primaryWeak.accuracyPercent}%, 誤答: ${primaryWeak.incorrect}問)` : '顕著な苦手分野なし（理解良好）'}

■ 分野別成績一覧:
${categorySummary.map(c => `・${c.name}: ${c.correct}/${c.total}問 (${c.accuracyPercent}%) [クラス平均: ${c.classAvg}%] - ${c.priority === 'critical' ? '要重点指導' : c.priority === 'warning' ? '要復習' : '良好'}`).join('\n')}

■ つまずいた設問 (${wrongQuestions.length}問):
${wrongQuestions.length === 0 ? '全問正解' : wrongQuestions.map((w, i) => `${i + 1}. 問${w.questionIndex} (${w.question.id} / ${w.categoryMajor || ''})\n   問題: ${w.question.question.slice(0, 60)}...\n   学生解答: [${w.userSelected.join(',') || '無解答'}] vs 正解: [${w.targetAnswers.join(',')}]\n   解説要点: ${w.question.explanation || '解説なし'}`).join('\n\n')}

■ 指導処方箋:
${tutoringPlan}
${teacherNote ? `\n■ 面談・指導メモ:\n${teacherNote}` : ''}`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedGuidanceToast(true);
      setTimeout(() => setCopiedGuidanceToast(false), 2500);
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                提出状況・リアルタイム成績管理
              </span>
              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                クラウド自動集計中
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 line-clamp-1">
              {test.title}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>出題数: <strong className="text-slate-800">{questions.length} 問</strong></span>
              {test.category && <span>分野: <strong className="text-slate-800">{test.category}</strong></span>}
              <span>配信日: {new Date(test.createdAt).toLocaleDateString('ja-JP')}</span>
              {test.code && (
                <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold">
                  参加コード: {test.code}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenComprehensiveGuidance && (
              <button
                onClick={() => onOpenComprehensiveGuidance(activeGuidanceStudent?.studentId || undefined)}
                className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                title="これまで配信したすべての小テスト結果を総合した個別弱点カルテ・指導資料を作成"
              >
                <Sparkles className="w-4 h-4 text-amber-200 animate-pulse" />
                <span className="hidden sm:inline">🌟 全試験総合</span>
                <span>弱点分析・指導資料</span>
              </button>
            )}
            <button
              onClick={() => {
                setFeedbackStudentId(undefined);
                setFeedbackSheetMode('guidance');
                setShowFeedbackModal(true);
              }}
              disabled={submissions.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50 shadow-2xs"
              title="学生個人別の苦手分野分析・指導カルテを一括作成・A4印刷"
            >
              <ClipboardList className="w-4 h-4 text-amber-200" />
              <span className="hidden sm:inline">個人別</span>
              <span>指導資料作成</span>
            </button>
            <button
              onClick={() => {
                setFeedbackStudentId(undefined);
                setFeedbackSheetMode('feedback');
                setShowFeedbackModal(true);
              }}
              disabled={submissions.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50 shadow-2xs"
              title="学生返却用の個別フィードバックシートを一括作成・A4印刷"
            >
              <FileText className="w-4 h-4 text-teal-200" />
              <span className="hidden sm:inline">学生返却用</span>
              <span>シート作成</span>
            </button>
            <button
              onClick={handleExportCSV}
              disabled={submissions.length === 0}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 shadow-2xs"
              title="CSV形式でダウンロード"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>CSV出力</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Submissions Count */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 sm:p-4">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
                <span>受験・提出数</span>
                <Users className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-bold text-slate-900">
                  {stats.count}
                </span>
                <span className="text-xs text-slate-500 font-medium">名</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {stats.count > 0 ? '全解答データを受信済み' : '生徒の提出を待機中'}
              </p>
            </div>

            {/* Average Score */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 sm:p-4">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
                <span>平均正答率 / 平均点</span>
                <TrendingUp className="w-4 h-4 text-teal-600" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-bold text-teal-700">
                  {stats.count > 0 ? `${stats.avgPercent}%` : '-'}
                </span>
                {stats.count > 0 && (
                  <span className="text-xs text-slate-500 font-medium">
                    ({stats.avgScore} / {questions.length}問)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {stats.count > 0 ? `最高: ${stats.maxScore}問 / 最低: ${stats.minScore}問` : 'データなし'}
              </p>
            </div>

            {/* Pass Rate */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 sm:p-4">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
                <span>合格率（60%基準）</span>
                <Award className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-bold text-amber-700">
                  {stats.count > 0 ? `${stats.passRate}%` : '-'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {stats.count > 0 ? `合格 ${stats.passCount}名 / 要復習 ${stats.count - stats.passCount}名` : 'データなし'}
              </p>
            </div>

            {/* Question Accuracy Highlights */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 sm:p-4">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
                <span>出題・難易度傾向</span>
                <BarChart3 className="w-4 h-4 text-purple-600" />
              </div>
              {stats.count > 0 ? (
                <div>
                  {(() => {
                    const lowAccuracyCount = questionAnalytics.filter(q => q.accuracyPercent < 50).length;
                    return (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className={`text-2xl sm:text-3xl font-bold ${lowAccuracyCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {lowAccuracyCount}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">問 正答率50%未満</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          {lowAccuracyCount > 0 ? '重点解説推奨の問題あり' : '全体的に良好な理解度'}
                        </p>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="text-sm text-slate-400 mt-1">提出後に自動算出</div>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('students')}
              className={`pb-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'students'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>受験者・成績一覧 ({submissions.length}名)</span>
            </button>
            <button
              onClick={() => setActiveTab('questions')}
              className={`pb-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'questions'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>問題別 正答率・誤答分析 ({questions.length}問)</span>
            </button>
            <button
              onClick={() => setActiveTab('guidance')}
              className={`pb-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'guidance'
                  ? 'border-amber-600 text-amber-800'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <BookOpen className="w-4 h-4 text-amber-600" />
              <span>苦手分野分析・指導資料</span>
              <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                個人別・全体
              </span>
            </button>
          </div>

          {/* TAB 1: Students Table */}
          {activeTab === 'students' && (
            <div className="space-y-4">
              {/* Controls bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="氏名・学籍番号で検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
                  <button
                    onClick={() => {
                      setFeedbackStudentId(undefined);
                      setFeedbackSheetMode('guidance');
                      setShowFeedbackModal(true);
                    }}
                    disabled={submissions.length === 0}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
                    title="全員分の個人別 苦手分析・指導カルテを一括作成・印刷"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    <span>全員の指導資料</span>
                  </button>

                  <button
                    onClick={() => {
                      setFeedbackStudentId(undefined);
                      setFeedbackSheetMode('feedback');
                      setShowFeedbackModal(true);
                    }}
                    disabled={submissions.length === 0}
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
                    title="全生徒の返却用フィードバックシートを一括作成・A4印刷"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>全員の返却シート</span>
                  </button>

                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    <span>並び替え:</span>
                  </div>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 font-medium"
                  >
                    <option value="date">提出日時（新しい順）</option>
                    <option value="scoreHigh">得点（高い順）</option>
                    <option value="scoreLow">得点（低い順）</option>
                    <option value="name">氏名順</option>
                  </select>

                  <button
                    onClick={handleExportCSV}
                    disabled={submissions.length === 0}
                    className="sm:hidden px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    CSV
                  </button>
                </div>
              </div>

              {/* Students List Table */}
              {loading ? (
                <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                  <span>提出データを同期中...</span>
                </div>
              ) : filteredSubmissions.length === 0 ? (
                <div className="py-16 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-6">
                  <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">まだ提出データがありません</p>
                  <p className="text-xs text-slate-500 mt-1">
                    生徒が共有URLまたはQRコードから小テストを受験して終了すると、ここに自動で成績が即時反映されます。
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold">
                        <tr>
                          <th className="py-3 px-3.5 sm:px-4">学籍番号 / 氏名</th>
                          <th className="py-3 px-3 sm:px-4">提出日時</th>
                          <th className="py-3 px-3 sm:px-4 text-center">得点</th>
                          <th className="py-3 px-3 sm:px-4 text-center">正答率</th>
                          <th className="py-3 px-3 sm:px-4 text-center">合否</th>
                          <th className="py-3 px-3 sm:px-4 text-right">個別指導・明細</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredSubmissions.map((sub, idx) => (
                          <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-3.5 sm:px-4 font-medium text-slate-900">
                              <div className="flex items-center gap-2">
                                <span className="w-5 text-center text-xs text-slate-400 font-mono">
                                  {idx + 1}
                                </span>
                                <div>
                                  <div className="font-bold text-slate-900">{sub.studentName}</div>
                                  {sub.studentId && (
                                    <div className="text-[11px] text-slate-400 font-mono">
                                      学籍番号: {sub.studentId}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 sm:px-4 text-slate-500 text-xs">
                              {new Date(sub.submittedAt).toLocaleString('ja-JP', {
                                month: 'numeric',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </td>
                            <td className="py-3 px-3 sm:px-4 text-center font-bold text-slate-800">
                              {sub.score} <span className="text-slate-400 font-normal">/ {sub.total}問</span>
                            </td>
                            <td className="py-3 px-3 sm:px-4 text-center">
                              <span className={`font-bold ${
                                sub.scorePercent >= 80 
                                  ? 'text-emerald-600' 
                                  : sub.scorePercent >= 60 
                                    ? 'text-teal-600' 
                                    : 'text-rose-600'
                              }`}>
                                {sub.scorePercent}%
                              </span>
                            </td>
                            <td className="py-3 px-3 sm:px-4 text-center">
                              {sub.passed ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3" />
                                  合格
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  <AlertTriangle className="w-3 h-3" />
                                  要復習
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 sm:px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    setFeedbackStudentId(sub.id);
                                    setFeedbackSheetMode('guidance');
                                    setShowFeedbackModal(true);
                                  }}
                                  className="px-2 py-1 text-xs font-bold text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors inline-flex items-center gap-1 shadow-2xs"
                                  title="この学生の苦手分野分析・個別指導カルテを作成・印刷"
                                >
                                  <ClipboardList className="w-3.5 h-3.5 text-amber-600" />
                                  <span>指導資料</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setFeedbackStudentId(sub.id);
                                    setFeedbackSheetMode('feedback');
                                    setShowFeedbackModal(true);
                                  }}
                                  className="px-2 py-1 text-xs font-bold text-teal-800 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors inline-flex items-center gap-1 shadow-2xs"
                                  title="この学生への返却用フィードバックシートを作成・印刷"
                                >
                                  <FileText className="w-3.5 h-3.5 text-teal-600" />
                                  <span>返却シート</span>
                                </button>
                                <button
                                  onClick={() => setSelectedStudentDetail(sub)}
                                  className="px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors inline-flex items-center gap-1"
                                  title="解答明細を確認"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>確認</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Question-by-question Analytics */}
          {activeTab === 'questions' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>項目分析（Item Analysis）:</strong> 各問題のクラス全体正答率と、生徒が選んだ選択肢の分布です。
                  正答率が50%未満の問題は赤色で警告され、学生がつまずいたポイント（どの誤答選択肢に引っかかったか）をピンポイントで確認できます。
                </div>
              </div>

              <div className="space-y-3">
                {questionAnalytics.map((item) => {
                  const isWarning = submissions.length > 0 && item.accuracyPercent < 50;
                  return (
                    <div 
                      key={item.question.id}
                      className={`bg-white border rounded-xl p-4 transition-all ${
                        isWarning ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            isWarning 
                              ? 'bg-rose-100 text-rose-800' 
                              : item.accuracyPercent >= 75 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : 'bg-slate-100 text-slate-800'
                          }`}>
                            問 {item.index + 1}
                          </span>
                          <span className="text-xs text-slate-500 font-mono">
                            {item.question.id}
                          </span>
                          {item.question.category && (
                            <span className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                              {item.question.category}
                            </span>
                          )}
                          {item.isPick2 && (
                            <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded font-semibold">
                              2つ選択
                            </span>
                          )}
                        </div>

                        {/* Accuracy Percentage Badge */}
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-xs text-slate-500">正答率: </span>
                            <span className={`text-base font-bold ${
                              item.accuracyPercent >= 75 
                                ? 'text-emerald-600' 
                                : item.accuracyPercent >= 50 
                                  ? 'text-amber-600' 
                                  : 'text-rose-600'
                            }`}>
                              {submissions.length > 0 ? `${item.accuracyPercent}%` : '-'}
                            </span>
                            {submissions.length > 0 && (
                              <span className="text-xs text-slate-400 ml-1">
                                ({item.correctCount}/{item.totalResponses}名 正解)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Question Text Preview */}
                      <p className="text-xs sm:text-sm text-slate-800 font-medium mb-3 line-clamp-2">
                        {item.question.question}
                      </p>

                      {/* Choice Breakdown / Distribution */}
                      <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        <div className="text-[11px] font-semibold text-slate-500 mb-1">
                          選択肢ごとの回答選択分布:
                        </div>
                        {item.question.choices.map((choiceText, cIdx) => {
                          const choiceNum = cIdx + 1;
                          const isCorrectChoice = item.correctAnswers.includes(choiceNum);
                          const count = item.choiceCounts[cIdx] || 0;
                          const percent = item.totalResponses > 0 
                            ? Math.round((count / item.totalResponses) * 100) 
                            : 0;

                          return (
                            <div key={choiceNum} className="flex items-center gap-2 text-xs">
                              <span className={`w-5 text-center font-bold rounded ${
                                isCorrectChoice 
                                  ? 'bg-emerald-500 text-white' 
                                  : 'bg-slate-200 text-slate-700'
                              }`}>
                                {choiceNum}
                              </span>
                              <span className="flex-1 text-slate-700 truncate">
                                {choiceText}
                              </span>
                              <div className="w-24 sm:w-32 bg-slate-100 rounded-full h-2 overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${
                                    isCorrectChoice ? 'bg-emerald-500' : 'bg-slate-400'
                                  }`}
                                  style={{ width: `${percent}%` }}
                                ></div>
                              </div>
                              <span className="w-14 text-right text-xs font-mono font-medium text-slate-600">
                                {count}名 ({percent}%)
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: Weakness Category Analysis & Teaching Guidance Material */}
          {activeTab === 'guidance' && (
            <div className="space-y-6">
              {/* Banner with Action Bar */}
              <div className="bg-linear-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5 text-amber-700" />
                      教員用 指導資料・弱点分析レポート
                    </span>
                    <span className="text-[11px] text-amber-700 font-medium">
                      全{submissions.length}名の解答傾向から苦手分野を自動抽出
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    学生がつまずきやすい分野の特定と、解説を活用した重点指導の手引き
                  </h3>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {onOpenComprehensiveGuidance && (
                    <button
                      onClick={() => onOpenComprehensiveGuidance(activeGuidanceStudent?.studentId || undefined)}
                      className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
                      title="これまでのすべての小テスト結果を総合して苦手分野を特定・指導カルテを作成"
                    >
                      <Sparkles className="w-4 h-4 text-amber-200 animate-pulse" />
                      <span>🌟 これまでの全試験を総合した指導資料</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setFeedbackStudentId(activeGuidanceStudent?.id || undefined);
                      setFeedbackSheetMode('guidance');
                      setShowFeedbackModal(true);
                    }}
                    disabled={submissions.length === 0}
                    className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
                    title="この学生の個人別指導カルテをA4印刷 / PDF保存"
                  >
                    <ClipboardList className="w-4 h-4" />
                    <span>指導カルテ A4印刷</span>
                  </button>
                  <button
                    onClick={() => {
                      setFeedbackStudentId(activeGuidanceStudent?.id || undefined);
                      setFeedbackSheetMode('feedback');
                      setShowFeedbackModal(true);
                    }}
                    disabled={submissions.length === 0}
                    className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
                    title="学生ごとの個別フィードバックシートを作成・印刷"
                  >
                    <FileText className="w-4 h-4" />
                    <span>返却シート作成</span>
                  </button>
                  <button
                    onClick={() => {
                      setFeedbackStudentId(undefined);
                      setFeedbackSheetMode('guidance');
                      setShowFeedbackModal(true);
                    }}
                    disabled={submissions.length === 0}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
                    title="全員分の個別指導カルテを一括作成・印刷"
                  >
                    <Printer className="w-4 h-4" />
                    <span>全員分を一括印刷</span>
                  </button>
                </div>
              </div>

              {/* Sub-view Switcher: Individual Student vs Class-wide Analytics */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setGuidanceViewMode('individual')}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                      guidanceViewMode === 'individual'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>👤 学生個人別 苦手分析・指導資料</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      guidanceViewMode === 'individual' ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {submissions.length}名
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuidanceViewMode('class')}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                      guidanceViewMode === 'class'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>👥 クラス全体 集計・分析</span>
                  </button>
                </div>

                {guidanceViewMode === 'individual' && submissions.length > 0 && activeGuidanceStudent && (
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-slate-500 font-medium">表示中の学生:</span>
                    <span className="font-bold text-slate-900 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-amber-700" />
                      {activeGuidanceStudent.studentName} {activeGuidanceStudent.studentId ? `(${activeGuidanceStudent.studentId})` : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* INDIVIDUAL STUDENT GUIDANCE VIEW */}
              {guidanceViewMode === 'individual' && (
                <div className="space-y-6">
                  {submissions.length === 0 ? (
                    <div className="py-16 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-6">
                      <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-bold text-slate-700">まだ提出データがありません</p>
                      <p className="text-xs text-slate-500 mt-1">
                        生徒が小テストを受験して提出すると、ここに生徒別の苦手分野分析と指導カルテが自動生成されます。
                      </p>
                    </div>
                  ) : activeStudentAnalysis ? (
                    <div className="space-y-6">
                      {/* Student Selector Bar */}
                      <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
                          <span className="text-xs font-bold text-amber-900 shrink-0">対象学生を選択:</span>
                          <select
                            value={activeGuidanceStudent?.id || ''}
                            onChange={(e) => setSelectedGuidanceStudentId(e.target.value)}
                            className="px-3 py-1.5 bg-white border border-amber-300 rounded-xl text-xs sm:text-sm font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500 min-w-56"
                          >
                            {submissions.map((sub, i) => (
                              <option key={sub.id} value={sub.id}>
                                {i + 1}. {sub.studentName} {sub.studentId ? `(${sub.studentId})` : ''} - 正答率: {sub.scorePercent}%
                              </option>
                            ))}
                          </select>

                          {/* Prev / Next buttons */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const curIdx = submissions.findIndex(s => s.id === activeGuidanceStudent?.id);
                                if (curIdx > 0) {
                                  setSelectedGuidanceStudentId(submissions[curIdx - 1].id);
                                }
                              }}
                              disabled={submissions.findIndex(s => s.id === activeGuidanceStudent?.id) <= 0}
                              className="p-1.5 bg-white rounded-lg border border-amber-200 hover:bg-amber-100 disabled:opacity-40 transition-colors"
                              title="前の学生"
                            >
                              <ChevronLeft className="w-4 h-4 text-slate-700" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const curIdx = submissions.findIndex(s => s.id === activeGuidanceStudent?.id);
                                if (curIdx >= 0 && curIdx < submissions.length - 1) {
                                  setSelectedGuidanceStudentId(submissions[curIdx + 1].id);
                                }
                              }}
                              disabled={submissions.findIndex(s => s.id === activeGuidanceStudent?.id) >= submissions.length - 1}
                              className="p-1.5 bg-white rounded-lg border border-amber-200 hover:bg-amber-100 disabled:opacity-40 transition-colors"
                              title="次の学生"
                            >
                              <ChevronRight className="w-4 h-4 text-slate-700" />
                            </button>
                          </div>
                        </div>

                        {/* Fast Actions for this Student */}
                        <div className="flex items-center gap-2 shrink-0 flex-wrap w-full md:w-auto justify-end">
                          <button
                            type="button"
                            onClick={handleCopyGuidanceText}
                            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs"
                            title="この学生の指導方針・弱点分析テキストをクリップボードにコピー"
                          >
                            {copiedGuidanceToast ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-emerald-700">コピー完了!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-slate-500" />
                                <span>指導テキストコピー</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFeedbackStudentId(activeGuidanceStudent?.id);
                              setFeedbackSheetMode('guidance');
                              setShowFeedbackModal(true);
                            }}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs"
                            title="この学生の指導カルテを印刷"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>指導カルテ A4印刷</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFeedbackStudentId(activeGuidanceStudent?.id);
                              setFeedbackSheetMode('feedback');
                              setShowFeedbackModal(true);
                            }}
                            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs"
                            title="学生返却用シートを作成"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>返却シート</span>
                          </button>
                        </div>
                      </div>

                      {/* Student Profile & Diagnostic Overview */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                        {/* Student Score & Status */}
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
                            <span>学生成績・合否状況</span>
                            <GraduationCap className="w-4 h-4 text-indigo-600" />
                          </div>
                          <div className="mt-1">
                            <div className="text-lg font-black text-slate-900 truncate">
                              {activeStudentAnalysis.submission.studentName}
                            </div>
                            {activeStudentAnalysis.submission.studentId && (
                              <div className="text-xs text-slate-400 font-mono">
                                学籍番号: {activeStudentAnalysis.submission.studentId}
                              </div>
                            )}
                          </div>
                          <div className="flex items-baseline gap-2 mt-2">
                            <span className={`text-2xl font-black ${
                              activeStudentAnalysis.submission.scorePercent >= 80
                                ? 'text-emerald-600'
                                : activeStudentAnalysis.submission.scorePercent >= 60
                                  ? 'text-teal-600'
                                  : 'text-rose-600'
                            }`}>
                              {activeStudentAnalysis.submission.scorePercent}%
                            </span>
                            <span className="text-xs text-slate-500 font-medium">
                              ({activeStudentAnalysis.submission.score} / {activeStudentAnalysis.submission.total}問 正解)
                            </span>
                          </div>
                          <div className="mt-2">
                            {activeStudentAnalysis.submission.passed ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                合格基準クリア
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                要重点復習・再指導
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Benchmark Comparison */}
                        <div className="bg-white border border-indigo-200 rounded-xl p-4 shadow-2xs">
                          <div className="flex items-center justify-between text-xs font-bold text-indigo-700 mb-1">
                            <span>クラス平均との比較ベンチマーク</span>
                            <TrendingUp className="w-4 h-4 text-indigo-500" />
                          </div>
                          <div className="mt-1">
                            {(() => {
                              const diff = activeStudentAnalysis.submission.scorePercent - stats.avgPercent;
                              return (
                                <>
                                  <div className="flex items-baseline gap-1.5">
                                    <span className={`text-2xl font-black ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      {diff >= 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`}
                                    </span>
                                    <span className="text-xs text-slate-500 font-medium">
                                      (平均比)
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-600 mt-1 font-medium">
                                    クラス平均正答率: <strong className="text-slate-800">{stats.avgPercent}%</strong>
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-2">
                                    {diff >= 10
                                      ? 'クラス平均を大きく上回り、理解が非常に進んでいます。'
                                      : diff >= 0
                                        ? 'クラス平均以上の理解を達成しています。'
                                        : 'クラス平均を下回っているため、つまずいた基礎分野の個別補習が効果的です。'}
                                  </p>
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Primary Weak Category */}
                        <div className="bg-white border border-rose-200 rounded-xl p-4 shadow-2xs">
                          <div className="flex items-center justify-between text-xs font-bold text-rose-700 mb-1">
                            <span>この学生の最優先補強分野</span>
                            <Target className="w-4 h-4 text-rose-500" />
                          </div>
                          {activeStudentAnalysis.primaryWeak ? (
                            <div className="mt-1">
                              <div className="text-lg font-black text-rose-700 truncate" title={activeStudentAnalysis.primaryWeak.name}>
                                {activeStudentAnalysis.primaryWeak.name}
                              </div>
                              <div className="flex items-baseline gap-2 mt-1">
                                <span className="text-xs text-slate-500 font-medium">本人正答率:</span>
                                <span className="text-xl font-black text-rose-700">
                                  {activeStudentAnalysis.primaryWeak.accuracyPercent}%
                                </span>
                                <span className="text-xs text-rose-600 font-bold">
                                  ({activeStudentAnalysis.primaryWeak.incorrect}問 失点)
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-1">
                                クラス平均: {activeStudentAnalysis.primaryWeak.classAvg}%
                              </div>
                            </div>
                          ) : (
                            <div className="py-2">
                              <div className="text-sm font-bold text-emerald-700">顕著な苦手分野なし</div>
                              <p className="text-xs text-slate-500 mt-1">
                                出題された全分野で高い正答率を達成しています。
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Category Breakdown Diagnostic Table */}
                      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                        <div className="p-3.5 sm:p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-amber-600" />
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                              個人別 分野・中項目別 苦手度診断表
                            </h4>
                          </div>
                          <span className="text-xs text-slate-500 font-medium">
                            全{activeStudentAnalysis.categorySummary.length}分野の出題結果
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs sm:text-sm">
                            <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-600 text-xs font-semibold">
                              <tr>
                                <th className="py-2.5 px-3 sm:px-4">分野名（大項目）</th>
                                <th className="py-2.5 px-3 sm:px-4">含まれる中項目</th>
                                <th className="py-2.5 px-3 sm:px-4 text-center">出題数</th>
                                <th className="py-2.5 px-3 sm:px-4 text-center">正解 / 誤答</th>
                                <th className="py-2.5 px-3 sm:px-4">本人の正答率</th>
                                <th className="py-2.5 px-3 sm:px-4 text-center">クラス平均</th>
                                <th className="py-2.5 px-3 sm:px-4 text-center">指導優先度</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {activeStudentAnalysis.categorySummary.map((cat) => (
                                <tr key={cat.name} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-2.5 px-3 sm:px-4 font-bold text-slate-900">
                                    {cat.name}
                                  </td>
                                  <td className="py-2.5 px-3 sm:px-4 text-xs text-slate-600">
                                    {cat.subCategories.length > 0 ? cat.subCategories.join(', ') : '-'}
                                  </td>
                                  <td className="py-2.5 px-3 sm:px-4 text-center font-bold text-slate-800">
                                    {cat.total}問
                                  </td>
                                  <td className="py-2.5 px-3 sm:px-4 text-center text-xs">
                                    <span className="text-emerald-700 font-bold">{cat.correct}正</span>
                                    <span className="text-slate-300 mx-1">/</span>
                                    <span className={`font-bold ${cat.incorrect > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                      {cat.incorrect}誤
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 sm:px-4">
                                    <div className="flex items-center gap-2">
                                      <div className="w-20 bg-slate-100 rounded-full h-2 overflow-hidden">
                                        <div 
                                          className={`h-full rounded-full ${
                                            cat.accuracyPercent >= 80 
                                              ? 'bg-emerald-500' 
                                              : cat.accuracyPercent >= 60 
                                                ? 'bg-amber-500' 
                                                : 'bg-rose-500'
                                          }`}
                                          style={{ width: `${cat.accuracyPercent}%` }}
                                        ></div>
                                      </div>
                                      <span className={`font-mono font-bold text-xs ${
                                        cat.accuracyPercent >= 80 
                                          ? 'text-emerald-700' 
                                          : cat.accuracyPercent >= 60 
                                            ? 'text-amber-700' 
                                            : 'text-rose-700'
                                      }`}>
                                        {cat.accuracyPercent}%
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 sm:px-4 text-center text-xs text-slate-600 font-mono">
                                    {cat.classAvg}%
                                  </td>
                                  <td className="py-2.5 px-3 sm:px-4 text-center">
                                    {cat.priority === 'critical' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                        <AlertTriangle className="w-3 h-3" />
                                        要重点指導
                                      </span>
                                    ) : cat.priority === 'warning' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                        要復習
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <CheckCircle2 className="w-3 h-3" />
                                        良好
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Missed Questions & Teaching Insights */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Lightbulb className="w-4 h-4 text-amber-600" />
                            <h4 className="text-sm sm:text-base font-bold text-slate-900">
                              この学生がつまずいた問題と指導用解説 ({activeStudentAnalysis.wrongQuestions.length}問)
                            </h4>
                          </div>
                          <span className="text-xs text-slate-500 font-medium">
                            誤答選択肢と正解の対比・解説文を活用した指導
                          </span>
                        </div>

                        {activeStudentAnalysis.wrongQuestions.length === 0 ? (
                          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
                            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                            <p className="text-sm font-bold text-emerald-900">
                              全問正解です！つまずいた設問はありません
                            </p>
                            <p className="text-xs text-emerald-700 mt-1">
                              このテストの全出題範囲を高い水準で習得できています。さらなる発展問題や過去問演習へのステップアップを推奨します。
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {activeStudentAnalysis.wrongQuestions.map((item) => (
                              <div
                                key={item.question.id}
                                className="bg-white border border-rose-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3"
                              >
                                {/* Question Header */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="bg-rose-100 text-rose-800 text-xs font-black px-2.5 py-0.5 rounded-lg border border-rose-200">
                                      問 {item.questionIndex} (失点)
                                    </span>
                                    <span className="text-xs font-mono text-slate-500">
                                      ID: {item.question.id}
                                    </span>
                                    {item.question.year && (
                                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                        第{item.question.year}回
                                      </span>
                                    )}
                                    {item.categoryMajor && (
                                      <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                                        {item.categoryMajor}
                                        {item.categorySub ? ` / ${item.categorySub}` : ''}
                                      </span>
                                    )}
                                    {item.isPickTwo && (
                                      <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded">
                                        2つ選択
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-xs text-rose-600 font-bold flex items-center gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    <span>本人解答: 誤答</span>
                                  </div>
                                </div>

                                {/* Question Text */}
                                <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-medium">
                                  {item.question.question}
                                </p>

                                {/* Choices Comparison: Student Answer vs Correct Answer */}
                                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5 text-xs">
                                  <div className="font-bold text-slate-700 text-[11px] mb-1">
                                    選択肢の判定と解答対比:
                                  </div>
                                  <div className="space-y-1">
                                    {item.question.choices.map((choiceText, cIdx) => {
                                      const choiceNum = cIdx + 1;
                                      const isUserChoice = item.userSelected.includes(choiceNum);
                                      const isCorrectChoice = item.targetAnswers.includes(choiceNum);

                                      let rowStyle = 'bg-white text-slate-700 border-slate-200';
                                      if (isUserChoice && !isCorrectChoice) {
                                        rowStyle = 'bg-rose-50 text-rose-900 border-rose-300 font-bold';
                                      } else if (isCorrectChoice) {
                                        rowStyle = 'bg-emerald-50 text-emerald-900 border-emerald-300 font-bold';
                                      }

                                      return (
                                        <div
                                          key={cIdx}
                                          className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${rowStyle}`}
                                        >
                                          <span className="w-5 text-center font-mono font-bold">
                                            {choiceNum}.
                                          </span>
                                          <span className="flex-1">{choiceText}</span>
                                          {isUserChoice && !isCorrectChoice && (
                                            <span className="text-[10px] bg-rose-600 text-white px-1.5 py-0.5 rounded font-bold shrink-0">
                                              本人の解答 (誤答)
                                            </span>
                                          )}
                                          {isCorrectChoice && (
                                            <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold shrink-0">
                                              正解
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Explanation Reference Box */}
                                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 space-y-1.5 text-xs text-amber-950">
                                  <div className="flex items-center gap-1.5 font-bold text-amber-900 text-xs">
                                    <Lightbulb className="w-4 h-4 text-amber-600 shrink-0" />
                                    <span>解説・指導参考資料（指導用バックデータ）</span>
                                  </div>
                                  <p className="text-xs leading-relaxed text-slate-800 whitespace-pre-wrap pl-5 font-normal">
                                    {item.question.explanation || '解説文は現在登録されていません。'}
                                  </p>
                                </div>

                                {/* Teaching Tip & Guidance Advice */}
                                <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-950 flex items-start gap-2">
                                  <GraduationCap className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                                  <div className="space-y-0.5">
                                    <span className="font-bold text-indigo-900">指導上の着眼点・発問例:</span>
                                    <p className="text-slate-700 leading-relaxed">
                                      {item.userSelected.length > 0 
                                        ? `選択肢[${item.userSelected.join(', ')}]を選択した理由について「何を根拠として判断したか」を学生に口頭試問し、正しい定義・基準とのズレを整理させてください。`
                                        : '無解答または未回答のため、問題の難易度や時間配分について聞き取りを行い、基本知識の再確認を促してください。'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Teacher Tutoring Prescription & Interview Notes */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ClipboardList className="w-4 h-4 text-indigo-600" />
                            <h4 className="text-sm sm:text-base font-bold text-slate-900">
                              個別指導処方箋＆面談指導記録メモ
                            </h4>
                          </div>
                          <span className="text-xs text-slate-500 font-medium">
                            指導カルテ（A4印刷）に連動反映
                          </span>
                        </div>

                        {/* Automated Tutoring Advice */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-xs text-slate-700">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                            <span>自動生成された指導方針提案:</span>
                          </div>
                          <p className="whitespace-pre-wrap leading-relaxed text-slate-800">
                            {activeStudentAnalysis.tutoringPlan}
                          </p>
                        </div>

                        {/* Editable Teacher Notes */}
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-700">
                            教員自由記述・面談記録（特記事項・個別宿題）:
                          </label>
                          <textarea
                            rows={3}
                            value={individualGuidanceNotes[activeStudentAnalysis.submission.id] || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setIndividualGuidanceNotes(prev => ({
                                ...prev,
                                [activeStudentAnalysis.submission.id]: val
                              }));
                            }}
                            placeholder="例: 面談にて誤答の原因を聞き取り済み。〇〇の定義についてのまとめノートを次回提出させること。"
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all resize-y"
                          />
                          <p className="text-[11px] text-slate-500">
                            ※ 入力したメモは「指導カルテ A4印刷」の特記事項欄にも自動反映されます。
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* CLASS-WIDE AGGREGATE GUIDANCE VIEW */}
              {guidanceViewMode === 'class' && (
                <div className="space-y-6">
                  {/* Overview Highlights Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                {/* Weakest Field */}
                <div className="bg-white border border-rose-200 rounded-xl p-4 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-bold text-rose-700 mb-1">
                    <span>最優先指導分野（ワースト1）</span>
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                  </div>
                  {categoryAnalytics.length > 0 ? (
                    <div>
                      <div className="text-lg sm:text-xl font-black text-rose-700 truncate" title={categoryAnalytics[0].major}>
                        {categoryAnalytics[0].major}
                      </div>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-xs text-slate-500">正答率:</span>
                        <span className="text-base font-black text-rose-600">
                          {categoryAnalytics[0].accuracyPercent}%
                        </span>
                        <span className="text-xs text-slate-400">
                          ({categoryAnalytics[0].errorCount}件の誤答)
                        </span>
                      </div>
                      {categoryAnalytics[0].subCategories.length > 0 && (
                        <div className="text-[11px] text-slate-500 mt-1 truncate">
                          該当項目: {categoryAnalytics[0].subCategories.join(', ')}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 mt-2">提出後に算出</div>
                  )}
                </div>

                {/* Critical Questions (<50% accuracy) */}
                <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-700 mb-1">
                    <span>要重点解説問題数</span>
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                  </div>
                  {submissions.length > 0 ? (
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-amber-700">
                          {mistakeRanking.filter(q => q.accuracyPercent < 50).length}
                        </span>
                        <span className="text-xs text-slate-500 font-bold">問（正答率50%未満）</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        半数以上の学生が誤答した設問。次回の講義や復習演習で重点解説を推奨します。
                      </p>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 mt-2">提出後に算出</div>
                  )}
                </div>

                {/* Recommended Strategy */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-700 mb-1">
                    <span>指導方針のアドバイス</span>
                    <GraduationCap className="w-4 h-4 text-indigo-500" />
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mt-1">
                    {categoryAnalytics.length > 0 && categoryAnalytics[0].accuracyPercent < 60
                      ? `「${categoryAnalytics[0].major}」に関する基礎概念や定義の整理を講義冒頭で5分程度行い、以下の解説資料のポイントを伝えると理解度が大幅に向上します。`
                      : '全体的に基礎知識は定着しています。引っかけ選択肢や「2つ選べ」の複合問題における精度の向上を促しましょう。'}
                  </p>
                </div>
              </div>

              {/* Section 1: Category Breakdown Table */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-teal-600" />
                    <h4 className="text-sm font-bold text-slate-900">
                      分野別（大項目・中項目）正誤・苦手度分析
                    </h4>
                  </div>
                  <span className="text-xs text-slate-500">
                    正答率の低い順（苦手分野順）に表示
                  </span>
                </div>

                {categoryAnalytics.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    生徒の提出データが集約されると、分野別の得意・苦手傾向が自動計算されます。
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">分野（大項目）</th>
                          <th className="py-2.5 px-3">出題数</th>
                          <th className="py-2.5 px-3">総解答数</th>
                          <th className="py-2.5 px-3">正解 / 誤答</th>
                          <th className="py-2.5 px-3 w-44">正答率グラフ</th>
                          <th className="py-2.5 px-3 text-center">指導優先度</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {categoryAnalytics.map((cat) => (
                          <tr key={cat.major} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2.5 px-3 font-bold text-slate-900">
                              <div className="flex flex-col">
                                <span>{cat.major}</span>
                                {cat.subCategories.length > 0 && (
                                  <span className="text-[10px] text-slate-400 font-normal">
                                    {cat.subCategories.join(', ')}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-700">
                              {cat.questionCount}問
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {cat.totalResponses}件
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="text-emerald-700 font-bold">{cat.correctCount}</span>
                              <span className="text-slate-400 mx-1">/</span>
                              <span className="text-rose-600 font-bold">{cat.errorCount}</span>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full ${
                                      cat.accuracyPercent >= 70 
                                        ? 'bg-emerald-500' 
                                        : cat.accuracyPercent >= 50 
                                          ? 'bg-amber-500' 
                                          : 'bg-rose-500'
                                    }`}
                                    style={{ width: `${cat.accuracyPercent}%` }}
                                  />
                                </div>
                                <span className={`w-10 text-right font-mono font-bold ${
                                  cat.accuracyPercent >= 70 
                                    ? 'text-emerald-600' 
                                    : cat.accuracyPercent >= 50 
                                      ? 'text-amber-600' 
                                      : 'text-rose-600'
                                }`}>
                                  {cat.accuracyPercent}%
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {cat.status === 'critical' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
                                  <AlertTriangle className="w-3 h-3" />
                                  要重点指導
                                </span>
                              ) : cat.status === 'warning' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  ▲ 要復習
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  ● 理解良好
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Section 2: Most Frequent Mistake Questions & Explanations */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-rose-600" />
                    <h4 className="text-sm font-bold text-slate-900">
                      学生が間違えやすい問題ランキング＆指導用解説資料
                    </h4>
                  </div>
                  <span className="text-xs text-slate-500">
                    正答率が低い問題（クラス全体がつまずいたポイント）順に整理
                  </span>
                </div>

                {mistakeRanking.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    提出データがありません
                  </div>
                ) : (
                  <div className="space-y-4">
                    {mistakeRanking.map((item, rIdx) => {
                      const isWarning = item.accuracyPercent < 50;
                      const isCritical = item.accuracyPercent < 40;

                      return (
                        <div 
                          key={item.question.id}
                          className={`p-4 rounded-xl border transition-all space-y-3 ${
                            isCritical 
                              ? 'border-rose-300 bg-rose-50/30 ring-1 ring-rose-200' 
                              : isWarning 
                                ? 'border-amber-200 bg-amber-50/20' 
                                : 'border-slate-200 bg-white'
                          }`}
                        >
                          {/* Header row */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-2.5 py-0.5 rounded text-xs font-black ${
                                isCritical
                                  ? 'bg-rose-600 text-white'
                                  : isWarning
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-slate-700 text-white'
                              }`}>
                                誤答率 第 {rIdx + 1} 位
                              </span>
                              <span className="text-xs font-bold text-slate-800">
                                問 {item.index + 1}
                              </span>
                              <span className="text-xs font-mono text-slate-500">
                                {item.question.id}
                              </span>
                              {item.question.category && (
                                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                                  {item.question.category}
                                </span>
                              )}
                              {item.isPick2 && (
                                <span className="text-[11px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded border border-amber-300">
                                  2つ選べ
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className="text-xs text-slate-500">正答率: </span>
                                <span className={`text-base font-black ${
                                  item.accuracyPercent >= 70 
                                    ? 'text-emerald-600' 
                                    : item.accuracyPercent >= 50 
                                      ? 'text-amber-600' 
                                      : 'text-rose-600'
                                }`}>
                                  {item.accuracyPercent}%
                                </span>
                                <span className="text-xs text-slate-500 ml-1 font-medium">
                                  ({item.errorCount}名 誤答 / {item.totalResponses}名中)
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Question statement */}
                          <div className="text-xs sm:text-sm font-bold text-slate-900 bg-white p-3 rounded-lg border border-slate-200 leading-relaxed">
                            {item.question.question}
                          </div>

                          {/* Common Distractor Analysis */}
                          {item.maxDistractorChoice > 0 && item.maxDistractorCount > 0 && (
                            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold text-rose-900">
                                  学生のつまずき傾向（最多誤答選択肢）:
                                </span>
                                <span className="text-rose-800 ml-1">
                                  誤答した学生のうち、<strong>{item.maxDistractorCount}名（{item.distractorPercent}%）</strong>が
                                  選択肢<strong>[{item.maxDistractorChoice}]</strong>を選択しています。
                                  正解の選択肢[{item.correctAnswers.join(', ')}]との差異について特に注意して解説してください。
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Choices distribution mini table */}
                          <div className="space-y-1 pt-1">
                            <div className="text-[11px] font-semibold text-slate-500 mb-1">
                              各選択肢の回答状況:
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {item.question.choices.map((cText, cIdx) => {
                                const cNum = cIdx + 1;
                                const isCorrect = item.correctAnswers.includes(cNum);
                                const isMostDistractor = cNum === item.maxDistractorChoice && item.maxDistractorCount > 0;
                                const count = item.choiceCounts[cIdx] || 0;
                                const percent = item.totalResponses > 0 ? Math.round((count / item.totalResponses) * 100) : 0;

                                return (
                                  <div 
                                    key={cNum}
                                    className={`p-1.5 rounded flex items-center gap-2 text-xs ${
                                      isCorrect 
                                        ? 'bg-emerald-50 border border-emerald-200 font-bold text-emerald-900' 
                                        : isMostDistractor 
                                          ? 'bg-rose-50 border border-rose-200 text-rose-900' 
                                          : 'bg-slate-50 text-slate-700'
                                    }`}
                                  >
                                    <span className={`w-4 text-center font-bold rounded ${
                                      isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                                    }`}>
                                      {cNum}
                                    </span>
                                    <span className="flex-1 truncate" title={cText}>{cText}</span>
                                    <span className="font-mono text-[11px] shrink-0">
                                      {count}名 ({percent}%)
                                    </span>
                                    {isCorrect && (
                                      <span className="text-[9px] bg-emerald-600 text-white px-1 py-0.2 rounded shrink-0">正解</span>
                                    )}
                                    {isMostDistractor && !isCorrect && (
                                      <span className="text-[9px] bg-rose-600 text-white px-1 py-0.2 rounded shrink-0">最多誤答</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Detailed Explanation / Reference Material Box */}
                          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 space-y-1.5 text-xs text-amber-950">
                            <div className="flex items-center gap-1.5 font-bold text-amber-900 text-xs">
                              <Lightbulb className="w-4 h-4 text-amber-600" />
                              <span>解説・指導参考資料（指導用バックデータ）</span>
                            </div>
                            <p className="text-xs leading-relaxed text-slate-800 whitespace-pre-wrap pl-5 font-normal">
                              {item.question.explanation || '解説文は現在登録されていません。'}
                            </p>
                          </div>

                          {/* Teaching Tips / Instruction Advice */}
                          <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-950 flex items-start gap-2">
                            <GraduationCap className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <span className="font-bold text-indigo-900">指導上の着眼点:</span>
                              <p className="text-slate-700">
                                {isWarning 
                                  ? `選択肢[${item.maxDistractorChoice > 0 ? item.maxDistractorChoice : '誤答'}]との対比を板書で整理し、「なぜこの選択肢が間違いなのか」を根拠とともに問いかけることで、学生の曖昧な知識を明確な判断基準へと引き上げることができます。`
                                  : `比較的理解度は良好です。周辺の関連知識や類似の過去問への応用力を確認する補足発問を行うとより効果的です。`}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Firestore クラウド同期中: 学生が終了した瞬間に自動集約されます</span>
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-medium transition-colors text-center"
          >
            閉じる
          </button>
        </div>
      </div>

      {/* Student Detail Modal (Inspect individual student's answers) */}
      {selectedStudentDetail && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  個別解答確認
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {selectedStudentDetail.studentName} さんの解答結果
                </h3>
                <div className="text-xs text-slate-500">
                  得点: <strong className="text-slate-800">{selectedStudentDetail.score} / {selectedStudentDetail.total} 問</strong> ({selectedStudentDetail.scorePercent}%)
                  {' '}- {selectedStudentDetail.passed ? '合格' : '要復習'}
                </div>
              </div>
              <button
                onClick={() => setSelectedStudentDetail(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {questions.map((q, idx) => {
                const userAns = selectedStudentDetail.userAnswers?.[q.id] || [];
                const correctAnswers = Array.isArray(q.answer) ? q.answer : [q.answer];
                const isPick2 = isPickTwoQuestion(q.question, q.answer);
                let isCorrect = false;
                if (isPick2) {
                  isCorrect = userAns.length === 2 && userAns.every(a => correctAnswers.includes(a));
                } else {
                  isCorrect = userAns.length === 1 && correctAnswers.includes(userAns[0]);
                }

                return (
                  <div key={q.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">問 {idx + 1} ({q.id})</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {isCorrect ? '正解' : '不正解'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-800 font-medium">{q.question}</p>
                    <div className="space-y-1 text-xs">
                      {q.choices.map((choice, cIdx) => {
                        const num = cIdx + 1;
                        const isStudentChoice = userAns.includes(num);
                        const isRightChoice = correctAnswers.includes(num);

                        return (
                          <div 
                            key={num} 
                            className={`p-1.5 rounded flex items-center gap-2 ${
                              isStudentChoice && isRightChoice 
                                ? 'bg-emerald-100 border border-emerald-300 font-semibold' 
                                : isStudentChoice && !isRightChoice
                                  ? 'bg-rose-100 border border-rose-300 font-semibold'
                                  : isRightChoice
                                    ? 'bg-emerald-50 text-emerald-800'
                                    : 'text-slate-600'
                            }`}
                          >
                            <span className="w-5 text-center font-bold">[{num}]</span>
                            <span className="flex-1">{choice}</span>
                            {isStudentChoice && (
                              <span className="text-[10px] bg-slate-800 text-white px-1.5 py-0.2 rounded">
                                生徒の選択
                              </span>
                            )}
                            {isRightChoice && (
                              <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.2 rounded font-bold">
                                正解
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 text-right">
              <button
                onClick={() => setSelectedStudentDetail(null)}
                className="px-4 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-xl"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Feedback & Guidance Sheet Modal */}
      {showFeedbackModal && (
        <StudentFeedbackSheetModal
          test={test}
          questions={questions}
          submissions={submissions}
          initialStudentId={feedbackStudentId}
          initialMode={feedbackSheetMode}
          onClose={() => {
            setShowFeedbackModal(false);
            setFeedbackStudentId(undefined);
          }}
        />
      )}
    </div>
  );
};
