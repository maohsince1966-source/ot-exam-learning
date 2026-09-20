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
  FileSpreadsheet
} from 'lucide-react';
import { isPickTwoQuestion } from '../utils/categoryHelper';

interface TestAnalyticsModalProps {
  test: DeliveredTest;
  questions: Question[];
  onClose: () => void;
}

export const TestAnalyticsModal: React.FC<TestAnalyticsModalProps> = ({
  test,
  questions,
  onClose
}) => {
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'students' | 'questions'>('students');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'scoreHigh' | 'scoreLow' | 'name'>('date');
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<SubmissionRecord | null>(null);

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

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
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
                          <th className="py-3 px-3 sm:px-4 text-right">解答明細</th>
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
                              <button
                                onClick={() => setSelectedStudentDetail(sub)}
                                className="px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors inline-flex items-center gap-1"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>確認</span>
                              </button>
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
    </div>
  );
};
