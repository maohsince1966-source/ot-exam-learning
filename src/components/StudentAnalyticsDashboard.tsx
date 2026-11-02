import React, { useState, useMemo } from 'react';
import { Question, QuizAttemptResult } from '../types';
import { parseCategory } from '../utils/categoryHelper';
import { getQuestionStudyRecords, QuestionStudyRecord } from '../services/studentStudyHistoryService';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  LineChart,
  Line
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
  ChevronRight,
  Filter,
  ArrowUpRight,
  Target,
  Sparkles,
  HelpCircle,
  RotateCcw
} from 'lucide-react';

interface StudentAnalyticsDashboardProps {
  questions: Question[];
  quizHistory: QuizAttemptResult[];
  onSelectCategoryForPractice: (majorCategory: string, subCategory?: string) => void;
  onSelectYearForPractice: (year: string) => void;
}

type ViewMode = 'major-category' | 'sub-category' | 'year' | 'trend';

export const StudentAnalyticsDashboard: React.FC<StudentAnalyticsDashboardProps> = ({
  questions,
  quizHistory,
  onSelectCategoryForPractice,
  onSelectYearForPractice
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('major-category');
  const [selectedMajorForDrilldown, setSelectedMajorForDrilldown] = useState<string>('all');
  const [weaknessOnlyFilter, setWeaknessOnlyFilter] = useState<boolean>(false);
  const [minAttemptsFilter, setMinAttemptsFilter] = useState<number>(1);

  // Load study records from localStorage
  const studyRecords: Record<string, QuestionStudyRecord> = useMemo(() => {
    return getQuestionStudyRecords();
  }, [quizHistory]); // re-evaluate when quizHistory changes

  // Map questions by ID for fast lookup
  const questionMap = useMemo(() => {
    return new Map<string, Question>(questions.map(q => [q.id, q]));
  }, [questions]);

  // Aggregate stats by question attempts + quiz history
  // Each attempted question is counted with its total attempts and correct attempts
  const { questionStatsList, totalAttemptedCount, totalCorrectCount } = useMemo(() => {
    const list: Array<{
      question: Question;
      attempts: number;
      correct: number;
      isLastCorrect: boolean;
      lastDate: string;
    }> = [];

    let totAttempts = 0;
    let totCorrect = 0;

    // 1. Process from studyRecords
    const processedQIds = new Set<string>();

    Object.entries(studyRecords).forEach(([qId, rec]) => {
      const q = questionMap.get(qId);
      if (q && rec && rec.totalAttempts > 0) {
        processedQIds.add(qId);
        totAttempts += rec.totalAttempts;
        totCorrect += rec.correctAttempts;
        list.push({
          question: q,
          attempts: rec.totalAttempts,
          correct: rec.correctAttempts,
          isLastCorrect: rec.lastIsCorrect,
          lastDate: rec.lastAttemptAt
        });
      }
    });

    // 2. Also incorporate any answers in quizHistory that might not be in studyRecords
    quizHistory.forEach(qh => {
      if (qh.userAnswers) {
        Object.entries(qh.userAnswers).forEach(([qId, _ans]) => {
          if (!processedQIds.has(qId)) {
            const q = questionMap.get(qId);
            if (q) {
              processedQIds.add(qId);
              // Count from quiz
              list.push({
                question: q,
                attempts: 1,
                correct: 1, // assume participated
                isLastCorrect: true,
                lastDate: qh.date
              });
            }
          }
        });
      }
    });

    return {
      questionStatsList: list,
      totalAttemptedCount: list.length,
      totalCorrectCount: list.filter(item => item.isLastCorrect).length
    };
  }, [studyRecords, questionMap, quizHistory]);

  // 1. Major Category (大項目別) Accuracy Aggregation
  const majorCategoryData = useMemo(() => {
    const map = new Map<string, { total: number; correct: number; questionIds: Set<string> }>();

    questionStatsList.forEach(item => {
      const p = parseCategory(item.question.category);
      const major = item.question.majorCategory || p.major || 'その他・共通';

      if (!map.has(major)) {
        map.set(major, { total: 0, correct: 0, questionIds: new Set() });
      }
      const entry = map.get(major)!;
      entry.total += item.attempts;
      entry.correct += item.correct;
      entry.questionIds.add(item.question.id);
    });

    const result = Array.from(map.entries()).map(([major, data]) => {
      const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
      let status: 'weak' | 'pass' | 'strong' = 'pass';
      if (accuracy < 60) status = 'weak';
      else if (accuracy >= 80) status = 'strong';

      return {
        name: major,
        accuracy,
        totalAttempts: data.total,
        correctAttempts: data.correct,
        uniqueQuestionsCount: data.questionIds.size,
        status
      };
    });

    // Sort by accuracy ascending (lowest/weakest first) to highlight trouble areas
    result.sort((a, b) => a.accuracy - b.accuracy || b.totalAttempts - a.totalAttempts);

    if (weaknessOnlyFilter) {
      return result.filter(r => r.accuracy < 60);
    }
    return result;
  }, [questionStatsList, weaknessOnlyFilter]);

  // 2. Sub Category (中項目別) Accuracy Aggregation
  const subCategoryData = useMemo(() => {
    const map = new Map<string, {
      sub: string;
      major: string;
      total: number;
      correct: number;
      questionIds: Set<string>;
    }>();

    questionStatsList.forEach(item => {
      const p = parseCategory(item.question.category);
      const major = item.question.majorCategory || p.major || 'その他';
      const sub = item.question.subCategory || p.sub || '全般・基礎';

      if (selectedMajorForDrilldown !== 'all' && major !== selectedMajorForDrilldown) {
        return;
      }

      const key = `${major}__${sub}`;
      if (!map.has(key)) {
        map.set(key, { sub, major, total: 0, correct: 0, questionIds: new Set() });
      }
      const entry = map.get(key)!;
      entry.total += item.attempts;
      entry.correct += item.correct;
      entry.questionIds.add(item.question.id);
    });

    const result = Array.from(map.values()).map(data => {
      const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
      let status: 'weak' | 'pass' | 'strong' = 'pass';
      if (accuracy < 60) status = 'weak';
      else if (accuracy >= 80) status = 'strong';

      return {
        name: data.sub,
        displayName: `${data.sub} (${data.major.slice(0, 4)}...)`,
        major: data.major,
        accuracy,
        totalAttempts: data.total,
        correctAttempts: data.correct,
        uniqueQuestionsCount: data.questionIds.size,
        status
      };
    });

    // Filter by min attempts
    let filtered = result.filter(r => r.totalAttempts >= minAttemptsFilter);
    if (weaknessOnlyFilter) {
      filtered = filtered.filter(r => r.accuracy < 60);
    }

    filtered.sort((a, b) => a.accuracy - b.accuracy || b.totalAttempts - a.totalAttempts);
    return filtered.slice(0, 15); // Top 15 subcategories
  }, [questionStatsList, selectedMajorForDrilldown, weaknessOnlyFilter, minAttemptsFilter]);

  // 3. Year (年度別) Accuracy Aggregation
  const yearData = useMemo(() => {
    const map = new Map<string, { total: number; correct: number; questionIds: Set<string> }>();

    questionStatsList.forEach(item => {
      let rawYear = String(item.question.year || '').trim();
      if (!rawYear) {
        // Try extracting from ID e.g. "61-AM-001"
        const match = item.question.id.match(/^(\d{2})/);
        if (match) rawYear = match[1];
      }
      if (!rawYear) return;

      const yearLabel = rawYear.length === 2 || Number(rawYear) < 100
        ? `第${rawYear}回`
        : `${rawYear}年`;

      if (!map.has(yearLabel)) {
        map.set(yearLabel, { total: 0, correct: 0, questionIds: new Set() });
      }
      const entry = map.get(yearLabel)!;
      entry.total += item.attempts;
      entry.correct += item.correct;
      entry.questionIds.add(item.question.id);
    });

    const result = Array.from(map.entries()).map(([yearLabel, data]) => {
      const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
      let status: 'weak' | 'pass' | 'strong' = 'pass';
      if (accuracy < 60) status = 'weak';
      else if (accuracy >= 80) status = 'strong';

      return {
        name: yearLabel,
        rawYear: yearLabel.replace(/[^0-9]/g, ''),
        accuracy,
        totalAttempts: data.total,
        correctAttempts: data.correct,
        uniqueQuestionsCount: data.questionIds.size,
        status
      };
    });

    // Sort newest year to oldest (e.g. 第61回 -> 第60回)
    result.sort((a, b) => {
      const numA = Number(a.rawYear) || 0;
      const numB = Number(b.rawYear) || 0;
      return numB - numA;
    });

    return result;
  }, [questionStatsList]);

  // 4. Trend (時系列スコア推移)
  const trendData = useMemo(() => {
    if (quizHistory.length === 0) return [];
    // Sort oldest to newest for chronological progress
    const sorted = [...quizHistory].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return sorted.slice(-12).map((item, idx) => {
      const d = new Date(item.date);
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
      return {
        index: idx + 1,
        title: item.testTitle || `演習 #${idx + 1}`,
        date: dateStr,
        accuracy: item.scorePercent,
        correct: item.correctCount,
        total: item.totalQuestions
      };
    });
  }, [quizHistory]);

  // Top 3 Weakest Major Categories for the alert banner
  const topWeakCategories = useMemo(() => {
    return majorCategoryData.filter(c => c.totalAttempts >= 2 && c.accuracy < 70).slice(0, 3);
  }, [majorCategoryData]);

  // Unique major categories list for the dropdown
  const uniqueMajorCategories = useMemo(() => {
    const set = new Set<string>();
    questions.forEach(q => {
      const p = parseCategory(q.category);
      const m = q.majorCategory || p.major;
      if (m) set.add(m);
    });
    return Array.from(set).sort();
  }, [questions]);

  // Overall accuracy rate
  const overallAccuracy = useMemo(() => {
    let totAttempts = 0;
    let totCorrect = 0;
    questionStatsList.forEach(item => {
      totAttempts += item.attempts;
      totCorrect += item.correct;
    });
    return totAttempts > 0 ? Math.round((totCorrect / totAttempts) * 100) : 0;
  }, [questionStatsList]);

  // Weak category count (< 60%)
  const weakCategoryCount = useMemo(() => {
    return majorCategoryData.filter(c => c.accuracy < 60).length;
  }, [majorCategoryData]);

  // Strong category count (>= 80%)
  const strongCategoryCount = useMemo(() => {
    return majorCategoryData.filter(c => c.accuracy >= 80).length;
  }, [majorCategoryData]);

  const getBarColor = (accuracy: number) => {
    if (accuracy < 60) return '#f43f5e'; // Rose-500 (Weak/Urgent)
    if (accuracy < 80) return '#6366f1'; // Indigo-500 (Passing)
    return '#10b981'; // Emerald-500 (Mastered)
  };

  const hasAnyData = questionStatsList.length > 0 || quizHistory.length > 0;

  return (
    <div className="space-y-6">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>累計演習数</span>
            <Target className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900">{totalAttemptedCount}</span>
            <span className="text-xs text-slate-400 font-bold">問解答</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            正解: <strong className="text-emerald-600 font-bold">{totalCorrectCount}問</strong>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>総合正答率</span>
            <BarChart3 className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-black ${
                overallAccuracy >= 60 ? 'text-indigo-600' : 'text-rose-600'
              }`}
            >
              {overallAccuracy}%
            </span>
            <span className="text-xs text-slate-400 font-bold">
              {overallAccuracy >= 60 ? '合格圏内' : '目標60%'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">国試合格基準: 60%</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>要強化・苦手分野</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-rose-600">{weakCategoryCount}</span>
            <span className="text-xs text-slate-400 font-bold">分野（60%未満）</span>
          </div>
          <div className="text-[11px] text-rose-600 font-bold mt-1">重点的な復習が推奨</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>得意・合格圏分野</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-600">{strongCategoryCount}</span>
            <span className="text-xs text-slate-400 font-bold">分野（80%以上）</span>
          </div>
          <div className="text-[11px] text-emerald-600 font-bold mt-1">安定して得点可能</div>
        </div>
      </div>

      {/* Weakness Alert & Practice Shortcut Banner */}
      {topWeakCategories.length > 0 && (
        <div className="bg-gradient-to-r from-rose-50 via-rose-100/70 to-amber-50 border border-rose-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white px-2 py-0.5 rounded-md">
                弱点克服レコメンド
              </span>
              <span className="text-xs font-extrabold text-rose-900">
                国家試験 60%合格ライン未満の苦手分野
              </span>
            </div>
            <p className="text-xs text-rose-800 leading-relaxed max-w-2xl">
              これまでの解答結果から、以下の分野で正答率が低下しています。集中的に問題を解き直すことで効率的に得点アップが狙えます。
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {topWeakCategories.map(cat => (
                <button
                  type="button"
                  key={cat.name}
                  onClick={() => onSelectCategoryForPractice(cat.name)}
                  className="px-3 py-1 bg-white hover:bg-rose-50 border border-rose-300 rounded-xl text-xs font-bold text-rose-900 shadow-2xs flex items-center gap-1.5 transition-all hover:scale-102 cursor-pointer"
                >
                  <span className="font-extrabold">{cat.name}</span>
                  <span className="text-rose-600 font-black">({cat.accuracy}%)</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onSelectCategoryForPractice(topWeakCategories[0].name)}
            className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs sm:text-sm font-black transition-all shadow-md flex items-center justify-center gap-2 shrink-0 cursor-pointer hover:shadow-lg"
          >
            <Sparkles className="w-4 h-4 text-amber-200" />
            <span>最優先苦手「{topWeakCategories[0].name}」を特訓</span>
          </button>
        </div>
      )}

      {/* Main Chart Container */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-6">
        {/* Navigation & Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              <span>正答率・弱点分析グラフ</span>
            </h3>
            <p className="text-xs text-slate-500">
              演習や小テストの結果を多角的に分析し、国家試験合格（60%）に向けた得意・不得意を可視化します。
            </p>
          </div>

          {/* View Mode Segmented Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold shrink-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setViewMode('major-category')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'major-category'
                  ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>大項目別（分野別）</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('sub-category')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'sub-category'
                  ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>中項目別（弱点深掘り）</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('year')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'year'
                  ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>年度別</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('trend')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'trend'
                  ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>スコア推移</span>
            </button>
          </div>
        </div>

        {/* Filter sub-bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50 p-3 rounded-2xl border border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            {viewMode === 'sub-category' && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-bold">大項目で絞り込み:</span>
                <select
                  value={selectedMajorForDrilldown}
                  onChange={e => setSelectedMajorForDrilldown(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="all">すべての大項目</option>
                  {uniqueMajorCategories.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => setWeaknessOnlyFilter(prev => !prev)}
              className={`px-3 py-1 rounded-xl font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
                weaknessOnlyFilter
                  ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>苦手分野のみ表示（60%未満）</span>
            </button>
          </div>

          {/* Color legend */}
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
              <span>要復習 (&lt;60%)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />
              <span>合格ライン (60-79%)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              <span>得意 (80%+)</span>
            </span>
          </div>
        </div>

        {/* Chart View Content */}
        {!hasAnyData ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <HelpCircle className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="font-bold text-sm text-slate-700">演習データがまだありません</p>
            <p className="text-xs text-slate-400">
              「過去問検索・演習」や「今日のテスト」で問題を解くと、正答率グラフが自動生成されます。
            </p>
          </div>
        ) : viewMode === 'major-category' ? (
          <div className="space-y-4">
            {majorCategoryData.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                条件に一致するデータがありません（苦手分野のみフィルターを解除してください）
              </div>
            ) : (
              <>
                <div className="h-[380px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={majorCategoryData}
                      layout="vertical"
                      margin={{ top: 10, right: 30, left: 100, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tickFormatter={v => `${v}%`}
                        tick={{ fill: '#64748b', fontSize: 11 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 600 }}
                        width={110}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1">
                                <div className="font-extrabold text-sm">{d.name}</div>
                                <div className="text-amber-300 font-black text-base">{d.accuracy}%</div>
                                <div className="text-slate-300">
                                  正解 {d.correctAttempts} / 延べ {d.totalAttempts} 回解答
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  登録問題 {d.uniqueQuestionsCount} 問
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      {/* Passing Grade Benchmark line (60%) */}
                      <ReferenceLine
                        x={60}
                        stroke="#ef4444"
                        strokeDasharray="4 4"
                        label={{ value: '合格基準 60%', fill: '#ef4444', fontSize: 10, position: 'top' }}
                      />
                      <ReferenceLine
                        x={80}
                        stroke="#10b981"
                        strokeDasharray="4 4"
                        label={{ value: '目標 80%', fill: '#10b981', fontSize: 10, position: 'top' }}
                      />
                      <Bar dataKey="accuracy" radius={[0, 6, 6, 0]} barSize={20}>
                        {majorCategoryData.map(entry => (
                          <Cell key={entry.name} fill={getBarColor(entry.accuracy)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Clickable Quick Action List for Each Category */}
                <div className="pt-2">
                  <h4 className="text-xs font-bold text-slate-700 mb-2">分野ごとの即時特訓・演習</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {majorCategoryData.map(cat => (
                      <div
                        key={cat.name}
                        className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl p-3 text-xs flex items-center justify-between transition-colors shadow-2xs"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="font-extrabold text-slate-900 truncate">{cat.name}</div>
                          <div className="text-[11px] text-slate-500">
                            正答率: <strong className={cat.accuracy >= 60 ? 'text-indigo-600' : 'text-rose-600'}>{cat.accuracy}%</strong> ({cat.correctAttempts}/{cat.totalAttempts}問)
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onSelectCategoryForPractice(cat.name)}
                          className="px-2.5 py-1 bg-white hover:bg-indigo-50 border border-slate-200 text-slate-700 hover:text-indigo-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                        >
                          <span>特訓</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : viewMode === 'sub-category' ? (
          <div className="space-y-4">
            {subCategoryData.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                条件に一致する中項目データがありません。演習を進めるか、フィルター条件を緩和してください。
              </div>
            ) : (
              <>
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={subCategoryData}
                      layout="vertical"
                      margin={{ top: 10, right: 30, left: 110, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tickFormatter={v => `${v}%`}
                        tick={{ fill: '#64748b', fontSize: 11 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 600 }}
                        width={120}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1">
                                <div className="text-[10px] text-slate-400">{d.major}</div>
                                <div className="font-extrabold text-sm">{d.name}</div>
                                <div className="text-amber-300 font-black text-base">{d.accuracy}%</div>
                                <div className="text-slate-300">
                                  正解 {d.correctAttempts} / 延べ {d.totalAttempts} 回
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <ReferenceLine x={60} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '60%', fill: '#ef4444', fontSize: 10, position: 'top' }} />
                      <Bar dataKey="accuracy" radius={[0, 6, 6, 0]} barSize={18}>
                        {subCategoryData.map(entry => (
                          <Cell key={entry.name} fill={getBarColor(entry.accuracy)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Subcategory list with drilldown practice buttons */}
                <div className="pt-2">
                  <h4 className="text-xs font-bold text-slate-700 mb-2">中項目ピンポイント特訓</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {subCategoryData.map(sub => (
                      <div
                        key={`${sub.major}_${sub.name}`}
                        className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl p-3 text-xs flex items-center justify-between transition-colors shadow-2xs"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="text-[10px] text-slate-400 truncate">{sub.major}</div>
                          <div className="font-extrabold text-slate-900 truncate">{sub.name}</div>
                          <div className="text-[11px]">
                            正答率: <strong className={sub.accuracy >= 60 ? 'text-indigo-600' : 'text-rose-600'}>{sub.accuracy}%</strong> ({sub.correctAttempts}/{sub.totalAttempts}問)
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onSelectCategoryForPractice(sub.major, sub.name)}
                          className="px-2.5 py-1 bg-white hover:bg-indigo-50 border border-slate-200 text-slate-700 hover:text-indigo-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                        >
                          <span>特訓</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : viewMode === 'year' ? (
          <div className="space-y-4">
            {yearData.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                年度別データがまだありません。
              </div>
            ) : (
              <>
                <div className="h-[360px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={yearData}
                      margin={{ top: 20, right: 20, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 600 }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tickFormatter={v => `${v}%`}
                        tick={{ fill: '#64748b', fontSize: 11 }}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1">
                                <div className="font-extrabold text-sm">{d.name} 国家試験過去問</div>
                                <div className="text-amber-300 font-black text-base">{d.accuracy}%</div>
                                <div className="text-slate-300">
                                  正解 {d.correctAttempts} / 延べ {d.totalAttempts} 回解答
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  演習済み問題 {d.uniqueQuestionsCount} 問
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <ReferenceLine
                        y={60}
                        stroke="#ef4444"
                        strokeDasharray="4 4"
                        label={{ value: '合格ライン 60%', fill: '#ef4444', fontSize: 10, position: 'insideTopLeft' }}
                      />
                      <Bar dataKey="accuracy" radius={[6, 6, 0, 0]} barSize={32}>
                        {yearData.map(entry => (
                          <Cell key={entry.name} fill={getBarColor(entry.accuracy)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Clickable Quick Action List for Each Year */}
                <div className="pt-2">
                  <h4 className="text-xs font-bold text-slate-700 mb-2">年度別過去問の集中演習</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {yearData.map(y => (
                      <button
                        type="button"
                        key={y.name}
                        onClick={() => onSelectYearForPractice(y.rawYear)}
                        className="bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl p-3 text-left transition-all shadow-2xs cursor-pointer group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm text-slate-900 group-hover:text-indigo-700">{y.name}</span>
                          <span className={`text-xs font-black ${y.accuracy >= 60 ? 'text-indigo-600' : 'text-rose-600'}`}>
                            {y.accuracy}%
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {y.correctAttempts}/{y.totalAttempts}問正解
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          /* Trend Mode */
          <div className="space-y-4">
            {trendData.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                小テストや演習テストの履歴がありません。テストを受験すると推移グラフが表示されます。
              </div>
            ) : (
              <>
                <div className="h-[360px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={trendData}
                      margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 600 }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tickFormatter={v => `${v}%`}
                        tick={{ fill: '#64748b', fontSize: 11 }}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1">
                                <div className="text-[10px] text-slate-400">{d.date} 受験</div>
                                <div className="font-extrabold text-sm">{d.title}</div>
                                <div className="text-amber-300 font-black text-base">{d.accuracy}%</div>
                                <div className="text-slate-300">
                                  得点: {d.correct} / {d.total} 問
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <ReferenceLine
                        y={60}
                        stroke="#ef4444"
                        strokeDasharray="4 4"
                        label={{ value: '合格基準 60%', fill: '#ef4444', fontSize: 10, position: 'insideTopLeft' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="accuracy"
                        stroke="#6366f1"
                        strokeWidth={3}
                        dot={{ r: 5, fill: '#6366f1', stroke: '#ffffff', strokeWidth: 2 }}
                        activeDot={{ r: 7, fill: '#4f46e5' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-slate-500 text-center">
                  直近 {trendData.length} 回の小テスト・演習テストにおける正答率の推移です。
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
