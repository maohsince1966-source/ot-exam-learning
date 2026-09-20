import React, { useState, useMemo } from 'react';
import { DeliveredTest, Question, SubmissionRecord } from '../types';
import { evaluateAnswer, parseCategory } from '../utils/categoryHelper';
import { 
  X, 
  Printer, 
  Copy, 
  Check, 
  BookOpen, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  MessageSquare, 
  ChevronLeft, 
  ChevronRight, 
  Lightbulb, 
  GraduationCap,
  ClipboardList,
  Target
} from 'lucide-react';

export type SheetMode = 'guidance' | 'feedback';

interface StudentFeedbackSheetModalProps {
  test: DeliveredTest;
  questions: Question[];
  submissions: SubmissionRecord[];
  initialStudentId?: string;
  initialMode?: SheetMode;
  onClose: () => void;
}

export const StudentFeedbackSheetModal: React.FC<StudentFeedbackSheetModalProps> = ({
  test,
  questions,
  submissions,
  initialStudentId,
  initialMode = 'guidance',
  onClose
}) => {
  // Mode: 'guidance' (教員用 個人別 苦手分野分析・個別指導カルテ) or 'feedback' (学生配布用 個別フィードバックシート)
  const [sheetMode, setSheetMode] = useState<SheetMode>(initialMode);

  // -1 means "Batch mode (All students)"
  const [selectedStudentIndex, setSelectedStudentIndex] = useState<number>(() => {
    if (initialStudentId) {
      const idx = submissions.findIndex(s => s.id === initialStudentId || s.studentId === initialStudentId);
      return idx >= 0 ? idx : 0;
    }
    return submissions.length > 0 ? 0 : -1;
  });

  const [customComments, setCustomComments] = useState<Record<string, string>>({});
  const [copiedToast, setCopiedToast] = useState(false);

  // Class-wide statistics for comparative analysis
  const classStats = useMemo(() => {
    if (submissions.length === 0) {
      return { avgPercent: 0, categoryAvg: new Map<string, number>() };
    }
    const totalPercents = submissions.map(s => s.scorePercent);
    const avgPercent = Math.round(totalPercents.reduce((a, b) => a + b, 0) / submissions.length);

    // Class average per category
    const catTotals = new Map<string, { total: number; correct: number }>();
    submissions.forEach(sub => {
      questions.forEach(q => {
        const p = parseCategory(q.category);
        const catKey = p.major || '一般';
        if (!catTotals.has(catKey)) {
          catTotals.set(catKey, { total: 0, correct: 0 });
        }
        const stat = catTotals.get(catKey)!;
        stat.total += 1;
        const evalRes = evaluateAnswer(sub.userAnswers?.[q.id] || [], q.answer, q.question);
        if (evalRes.isCorrect) stat.correct += 1;
      });
    });

    const categoryAvg = new Map<string, number>();
    catTotals.forEach((val, key) => {
      categoryAvg.set(key, val.total > 0 ? Math.round((val.correct / val.total) * 100) : 0);
    });

    return { avgPercent, categoryAvg };
  }, [submissions, questions]);

  // Compute student results details
  const studentAnalysisList = useMemo(() => {
    return submissions.map(sub => {
      const wrongQuestions: Array<{
        question: Question;
        questionIndex: number;
        userSelected: number[];
        targetAnswers: number[];
        isPickTwo: boolean;
        categoryMajor: string;
        categorySub: string;
      }> = [];

      const correctQuestions: Array<{
        question: Question;
        questionIndex: number;
        userSelected: number[];
        targetAnswers: number[];
      }> = [];

      // Category stats: category -> { total, correct, incorrect, subCategories }
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
          correctQuestions.push({
            question: q,
            questionIndex: idx + 1,
            userSelected: evalRes.userSelected,
            targetAnswers: evalRes.targetAnswers
          });
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

      // Category summary sorted by lowest accuracy first (weakest first)
      const categorySummary = Array.from(categoryMap.entries()).map(([name, stat]) => {
        const accuracyPercent = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
        const classAvg = classStats.categoryAvg.get(name) ?? accuracyPercent;
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
      const primaryWeakCategory = weakCategories.length > 0 ? weakCategories[0] : null;

      // Smart default advice based on score and weak areas
      let defaultAdvice = '';
      if (sub.scorePercent >= 80) {
        if (wrongQuestions.length === 0) {
          defaultAdvice = '全問正解です！非常に高い理解度を維持できています。国家試験本番に向けて難問や応用問題へのチャレンジを継続してください。';
        } else {
          const weakNames = weakCategories.map(c => c.name).join('・');
          defaultAdvice = `全体的に大変良好な成績です（正答率${sub.scorePercent}%）。間違えた${weakNames ? `「${weakNames}」分野の` : ''}設問（${wrongQuestions.map(w => `問${w.questionIndex}`).join('・')}）の解説を再確認し、取りこぼしのない万全な知識へと定着させましょう。`;
        }
      } else if (sub.scorePercent >= 60) {
        const weakNames = weakCategories.map(c => c.name).join('・');
        defaultAdvice = `合格基準（60%）に到達しています。特に${weakNames ? `【${weakNames}】分野` : '間違えた問題'}で失点が見られます。掲載している解説資料を熟読し、なぜその選択肢が誤答・正解なのか判断基準を確認してください。`;
      } else {
        const weakNames = weakCategories.map(c => c.name).join('・');
        defaultAdvice = `今回は合格基準点に届きませんでした。特に${weakNames ? `【${weakNames}】分野` : '間違えた問題'}の基礎概念を重点補強する必要があります。まずは解説資料を読み、該当する教科書・過去問の類似問題を早急に再復習しましょう。`;
      }

      // Teacher-specific tutoring guidance recommendation
      let tutoringPlan = '';
      if (primaryWeakCategory) {
        tutoringPlan = `【最優先重点指導分野: ${primaryWeakCategory.name}】（正答率${primaryWeakCategory.accuracyPercent}%、失点${primaryWeakCategory.incorrect}問）\n・基礎用語とメカニズムの定義を口頭確認し、なぜ誤答選択肢を選んでしまったかの思考プロセスを点検する。\n・類似の国家試験過去問を2〜3問追加で解かせ、知識の定着度を測る。`;
      } else {
        tutoringPlan = '全問正解または高得点のため、応用問題や他分野の複合過去問を提示して発展的理解を促す。';
      }

      return {
        submission: sub,
        wrongQuestions,
        correctQuestions,
        categorySummary,
        weakCategories,
        primaryWeakCategory,
        defaultAdvice,
        tutoringPlan
      };
    });
  }, [submissions, questions, classStats]);

  const currentAnalysis = selectedStudentIndex >= 0 ? studentAnalysisList[selectedStudentIndex] : null;

  // Print handler
  const handlePrint = () => {
    window.print();
  };

  // Copy text feedback for current student
  const handleCopyText = (analysis: typeof studentAnalysisList[0]) => {
    const sub = analysis.submission;
    const comment = customComments[sub.id] ?? (sheetMode === 'guidance' ? analysis.tutoringPlan : analysis.defaultAdvice);

    let text = sheetMode === 'guidance' 
      ? `【学生個人別 苦手分野分析＆個別指導カルテ】\n`
      : `【小テスト個別フィードバックシート】\n`;

    text += `テスト名: ${test.title}\n`;
    text += `学籍番号: ${sub.studentId || '未登録'}  氏名: ${sub.studentName} (${sub.grade ? `${sub.grade}年` : ''})\n`;
    text += `得点: ${sub.score} / ${sub.total} 問 (${sub.scorePercent}%) - ${sub.passed ? '合格' : '要復習'}\n`;
    text += `クラス平均: ${classStats.avgPercent}% (差異: ${sub.scorePercent - classStats.avgPercent >= 0 ? '+' : ''}${sub.scorePercent - classStats.avgPercent}%)\n`;
    text += `最優先補強分野: ${analysis.primaryWeakCategory ? `${analysis.primaryWeakCategory.name} (正答率${analysis.primaryWeakCategory.accuracyPercent}%)` : '特になし'}\n\n`;

    text += `■ 個人別 分野別苦手度分析:\n`;
    analysis.categorySummary.forEach(c => {
      text += `・${c.name}: ${c.correct}/${c.total}問 (${c.accuracyPercent}% / クラス平均${c.classAvg}%) [${c.priority === 'critical' ? '要重点指導' : c.priority === 'warning' ? '要復習' : '良好'}]\n`;
    });
    text += `\n`;

    if (analysis.wrongQuestions.length === 0) {
      text += `■ 間違えた問題: なし（全問正解）\n\n`;
    } else {
      text += `■ つまずき問題と解説資料: [計 ${analysis.wrongQuestions.length}問]\n\n`;
      analysis.wrongQuestions.forEach(item => {
        text += `--------------------------------------------------\n`;
        text += `【問 ${item.questionIndex}】(${item.question.id}) 分野: ${item.categoryMajor}${item.categorySub ? `（${item.categorySub}）` : ''}\n`;
        text += `問題: ${item.question.question}\n`;
        text += `学生の解答: [${item.userSelected.join(', ')}]  正解: [${item.targetAnswers.join(', ')}]\n`;
        text += `【解説】:\n${item.question.explanation}\n\n`;
      });
    }

    text += sheetMode === 'guidance' 
      ? `■ 個別指導方針・指導記録メモ:\n${comment}\n`
      : `■ 担当教員からのコメント:\n${comment}\n`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2500);
    });
  };

  if (submissions.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">提出データがありません</h3>
          <p className="text-xs text-slate-500">
            学生が小テストを解答・提出すると、自動的に解答データが集約され、個人別の苦手分野分析と指導資料を作成できます。
          </p>
          <button
            onClick={onClose}
            className="w-full py-2 bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    );
  }

  // Render individual sheet content (Feedback Mode vs Guidance Mode)
  const renderSheetContent = (analysis: typeof studentAnalysisList[0], isBatch: boolean = false) => {
    const sub = analysis.submission;
    const diff = sub.scorePercent - classStats.avgPercent;
    const isGuidance = sheetMode === 'guidance';
    const comment = customComments[sub.id] ?? (isGuidance ? analysis.tutoringPlan : analysis.defaultAdvice);

    return (
      <div 
        key={sub.id} 
        className={`bg-white text-slate-900 ${isBatch ? 'page-break-after p-6 sm:p-8 mb-8 border border-slate-200 rounded-2xl shadow-xs print:border-none print:shadow-none print:p-0 print:m-0' : 'p-6 sm:p-8 space-y-6'}`}
      >
        {/* Document Header */}
        <div className="border-b-2 border-slate-900 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-black px-2 py-0.5 rounded tracking-wider ${
                  isGuidance 
                    ? 'bg-amber-700 text-white' 
                    : 'bg-slate-900 text-white'
                }`}>
                  {isGuidance ? '教員用 個別指導・面談カルテ' : '学生配布・自習用資料'}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  作業療法士 国家試験対策指導支援システム
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 mt-1">
                {isGuidance ? '学生個人別 苦手分野分析＆個別指導カルテ' : '小テスト 個別フィードバックシート'}
              </h1>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div>実施日: {new Date(sub.submittedAt).toLocaleDateString('ja-JP')}</div>
              <div className="text-[10px] text-slate-400">テストID: {test.code || test.id}</div>
            </div>
          </div>
          <div className="text-xs font-bold text-slate-700 mt-1.5 line-clamp-1">
            演習課題: {test.title}
          </div>
        </div>

        {/* Student Profile & Score Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 print:bg-white print:border-slate-300">
          <div className="sm:col-span-2 space-y-1.5">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 font-semibold">学籍番号:</span>
              <span className="text-sm font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                {sub.studentId || '未登録'}
              </span>
              {sub.grade && (
                <span className="text-xs font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {sub.grade}年生
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2 pt-0.5">
              <span className="text-xs text-slate-500 font-semibold">氏名:</span>
              <span className="text-lg font-black text-slate-900">
                {sub.studentName}
              </span>
              <span className="text-xs text-slate-500 font-medium">さん</span>
            </div>

            {/* Comparative insight in Guidance mode */}
            {isGuidance && (
              <div className="flex items-center gap-2 pt-1 text-xs text-slate-600 flex-wrap">
                <span className="bg-white border border-slate-200 px-2 py-0.5 rounded font-medium">
                  クラス平均: <strong className="text-slate-800">{classStats.avgPercent}%</strong>
                  （{diff >= 0 ? `+${diff}%` : `${diff}%`}）
                </span>
                {analysis.primaryWeakCategory && (
                  <span className="bg-rose-50 border border-rose-200 text-rose-800 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                    最優先補強: {analysis.primaryWeakCategory.name} ({analysis.primaryWeakCategory.accuracyPercent}%)
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="text-right flex flex-col justify-center border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-4">
            <div className="text-[11px] font-bold text-slate-500">総合得点・判定</div>
            <div className="flex items-baseline justify-end gap-1.5 mt-0.5">
              <span className={`text-2xl font-black ${sub.passed ? 'text-teal-700' : 'text-rose-600'}`}>
                {sub.score}
              </span>
              <span className="text-xs font-bold text-slate-500">/ {sub.total}問</span>
              <span className={`text-sm font-bold ml-1 ${sub.passed ? 'text-teal-700' : 'text-rose-600'}`}>
                ({sub.scorePercent}%)
              </span>
            </div>
            <div className="mt-1">
              <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                sub.passed 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                  : 'bg-rose-100 text-rose-800 border border-rose-300'
              }`}>
                {sub.passed ? '✓ 合格・基準到達' : '⚠️ 要復習・要個別指導'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 1: Category Breakdown & Weakness Diagnostic */}
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-slate-200 pb-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <GraduationCap className="w-4 h-4 text-teal-600" />
              <span>
                {isGuidance ? '1. 個人別 分野・中項目別 苦手度診断カルテ' : '1. 分野別 達成状況・得意苦手分析'}
              </span>
            </div>
            {isGuidance && (
              <span className="text-[11px] text-slate-500">
                正答率の低い順（苦手分野順）に表示
              </span>
            )}
          </div>

          {isGuidance ? (
            /* Table format for teaching guidance */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200 rounded-lg">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">分野（大項目・中項目）</th>
                    <th className="py-2 px-3 text-center">出題数</th>
                    <th className="py-2 px-3 text-center">正解 / 誤答</th>
                    <th className="py-2 px-3 w-40">本人の正答率</th>
                    <th className="py-2 px-3 text-center">クラス平均</th>
                    <th className="py-2 px-3 text-center">個別指導優先度</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {analysis.categorySummary.map((c) => (
                    <tr key={c.name} className="hover:bg-slate-50">
                      <td className="py-2 px-3">
                        <div className="font-bold text-slate-900">{c.name}</div>
                        {c.subCategories.length > 0 && (
                          <div className="text-[10px] text-slate-500">{c.subCategories.join(', ')}</div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-medium text-slate-700">{c.total}問</td>
                      <td className="py-2 px-3 text-center">
                        <span className="text-emerald-700 font-bold">{c.correct}</span>
                        <span className="text-slate-400 mx-1">/</span>
                        <span className="text-rose-600 font-bold">{c.incorrect}</span>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                c.accuracyPercent >= 70 ? 'bg-emerald-500' : c.accuracyPercent >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                              }`}
                              style={{ width: `${c.accuracyPercent}%` }}
                            />
                          </div>
                          <span className={`w-9 text-right font-mono font-bold ${
                            c.accuracyPercent >= 70 ? 'text-emerald-700' : c.accuracyPercent >= 50 ? 'text-amber-700' : 'text-rose-600'
                          }`}>
                            {c.accuracyPercent}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-600">
                        {c.classAvg}%
                      </td>
                      <td className="py-2 px-3 text-center">
                        {c.priority === 'critical' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            要重点指導
                          </span>
                        ) : c.priority === 'warning' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            ▲ 要復習
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            ● 理解良好
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Cards format for student handout */
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {analysis.categorySummary.map(c => (
                <div 
                  key={c.name}
                  className={`p-2.5 rounded-lg border ${
                    c.incorrect > 0 
                      ? 'bg-rose-50/60 border-rose-200' 
                      : 'bg-emerald-50/60 border-emerald-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 truncate">
                    <span className="truncate" title={c.name}>{c.name}</span>
                    {c.incorrect > 0 ? (
                      <span className="text-[9px] font-bold text-rose-700 bg-rose-100 px-1 py-0.2 rounded shrink-0">要復習</span>
                    ) : (
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded shrink-0">正解</span>
                    )}
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="font-bold text-slate-800">{c.correct}/{c.total}問</span>
                    <span className={`font-black ${c.incorrect > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {c.accuracyPercent}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Wrong Questions with Detailed Explanations & Tutoring Notes */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <BookOpen className="w-4 h-4 text-rose-600" />
              <span>
                {isGuidance 
                  ? '2. 本人の誤答問題・つまずき要因の分析と指導用解説資料' 
                  : '2. 間違えた問題と解説（復習・自習用参考資料）'}
              </span>
            </div>
            <span className="text-[11px] font-bold text-rose-700">
              {analysis.wrongQuestions.length > 0 
                ? `間違えた問題: ${analysis.wrongQuestions.length}問` 
                : '全問正解！'}
            </span>
          </div>

          {analysis.wrongQuestions.length === 0 ? (
            <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-200 text-center space-y-2">
              <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-emerald-900">
                見事、全問正解です！
              </h4>
              <p className="text-xs text-emerald-700 max-w-md mx-auto">
                今回の小テストで間違えた問題はありません。知識が十分に定着しています。
                {isGuidance && 'より難度の高い発展的過去問の提示や周辺領域への応用指導を推奨します。'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {analysis.wrongQuestions.map((item) => {
                const q = item.question;
                return (
                  <div 
                    key={q.id} 
                    className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3 print:border-slate-300 print:shadow-none"
                  >
                    {/* Question Header */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black bg-rose-600 text-white px-2 py-0.5 rounded">
                          問 {item.questionIndex}
                        </span>
                        <span className="font-mono text-xs font-bold bg-slate-800 text-white px-1.5 py-0.5 rounded">
                          {q.id}
                        </span>
                        <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                          {item.categoryMajor}
                          {item.categorySub && ` - ${item.categorySub}`}
                        </span>
                        {item.isPickTwo && (
                          <span className="text-[11px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded border border-amber-300">
                            2つ選べ
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          本人解答: [{item.userSelected.length > 0 ? item.userSelected.join(', ') : '未選択'}]
                        </span>
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          正解: [{item.targetAnswers.join(', ')}]
                        </span>
                      </div>
                    </div>

                    {/* Question Statement */}
                    <div className="text-xs font-bold text-slate-900 bg-slate-50 p-3 rounded-lg border border-slate-200 leading-relaxed print:bg-white print:p-2">
                      {q.question}
                    </div>

                    {/* Choices breakdown */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-slate-500">選択肢と解答の差異:</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                        {q.choices.map((cText, cIdx) => {
                          const cNum = cIdx + 1;
                          const isTarget = item.targetAnswers.includes(cNum);
                          const isSelected = item.userSelected.includes(cNum);

                          let style = 'bg-slate-50 text-slate-700 border-transparent';
                          if (isTarget) {
                            style = 'bg-emerald-50 text-emerald-900 border-emerald-300 font-bold';
                          } else if (isSelected) {
                            style = 'bg-rose-50 text-rose-900 border-rose-300 font-bold';
                          }

                          return (
                            <div 
                              key={cNum} 
                              className={`p-1.5 rounded border flex items-center justify-between gap-1 ${style}`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`w-4 text-center font-bold rounded ${
                                  isTarget ? 'bg-emerald-600 text-white' : isSelected ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-700'
                                }`}>
                                  {cNum}
                                </span>
                                <span className="truncate" title={cText}>{cText}</span>
                              </div>
                              {isTarget && (
                                <span className="text-[9px] bg-emerald-600 text-white px-1 py-0.2 rounded shrink-0">正解</span>
                              )}
                              {isSelected && !isTarget && (
                                <span className="text-[9px] bg-rose-600 text-white px-1 py-0.2 rounded shrink-0">本人選択（誤答）</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Explanation / Study Material */}
                    <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 space-y-1 text-xs text-amber-950">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>解説・参考資料（正解の根拠と誤答選択肢の検討）</span>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-800 whitespace-pre-wrap pl-5 font-normal">
                        {q.explanation || '解説文は現在登録されていません。教科書または過去問解説集を参照してください。'}
                      </p>
                    </div>

                    {/* Guidance / Teaching Insight (Only in Guidance mode) */}
                    {isGuidance && (
                      <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-2.5 text-xs text-indigo-950 flex items-start gap-2">
                        <GraduationCap className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <span className="font-bold text-indigo-900">個別面談・指導の着眼点:</span>
                          <p className="text-slate-700 text-[11px] leading-relaxed">
                            選択肢[{item.userSelected.join(', ')}]を選んだ理由を本人に問いかけ、正解[{item.targetAnswers.join(', ')}]との定義上の違い・キーワードの見落としを一緒に確認してください。
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 3: Teacher's Advice & Remarks */}
        <div className="space-y-2 pt-2 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <MessageSquare className="w-4 h-4 text-indigo-600" />
              <span>
                {isGuidance ? '3. 個別指導処方箋＆面談記録メモ（教員用記録）' : '3. 担当教員からの指導コメント・アドバイス'}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 no-print">
              （※印刷前にメモを直接編集・追記できます）
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 print:bg-white print:border-slate-300">
            <textarea
              value={comment}
              onChange={(e) => setCustomComments({ ...customComments, [sub.id]: e.target.value })}
              rows={3}
              placeholder={isGuidance ? "個別指導での指導方針や次回までの宿題・課題を記録..." : "学生に向けた個別アドバイスを入力..."}
              className="w-full text-xs text-slate-800 bg-transparent border-none focus:outline-hidden focus:ring-0 resize-none leading-relaxed"
            />
          </div>

          <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1">
            <span>指導担当: 作業療法学科 教員室</span>
            <span>作業療法士国家試験 対策指導支援システム</span>
          </div>
        </div>
      </div>
    );
  };

  const isBatchMode = selectedStudentIndex === -1;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[95vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Navigation / Toolbar (Hidden when printing) */}
        <div className="no-print p-3 sm:p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-teal-400" />
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white">
                  {sheetMode === 'guidance' ? '学生個人別 苦手分析・指導カルテ' : '学生用個別フィードバックシート'}
                </h2>
                <p className="text-[11px] text-slate-400 line-clamp-1">
                  {test.title}（全{submissions.length}名提出）
                </p>
              </div>
            </div>

            {/* Mode Switcher: Guidance vs Feedback */}
            <div className="flex items-center bg-slate-800 rounded-xl p-0.5 border border-slate-700">
              <button
                type="button"
                onClick={() => setSheetMode('guidance')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  sheetMode === 'guidance'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="教員目線での個人別苦手分野分析・個別指導カルテ"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>指導カルテ（教員用）</span>
              </button>
              <button
                type="button"
                onClick={() => setSheetMode('feedback')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  sheetMode === 'feedback'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="学生本人に返却・配布するフィードバックシート"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>返却シート（学生用）</span>
              </button>
            </div>
          </div>

          {/* Student Selector controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700">
              <button
                type="button"
                onClick={() => setSelectedStudentIndex(-1)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  isBatchMode 
                    ? 'bg-teal-600 text-white shadow-xs' 
                    : 'text-slate-300 hover:text-white'
                }`}
                title="全学生のシートを一括印刷・表示"
              >
                全員分一括（印刷用）
              </button>

              <div className="h-4 w-px bg-slate-700 mx-1"></div>

              <select
                value={isBatchMode ? '' : selectedStudentIndex}
                onChange={(e) => {
                  if (e.target.value === 'all') {
                    setSelectedStudentIndex(-1);
                  } else {
                    setSelectedStudentIndex(Number(e.target.value));
                  }
                }}
                className="bg-transparent text-xs text-slate-200 font-semibold py-1 px-2 focus:outline-hidden cursor-pointer max-w-[160px] sm:max-w-[200px] truncate"
              >
                <option value="all" className="bg-slate-900 text-white">
                  全員一括表示 ({submissions.length}名)
                </option>
                {submissions.map((sub, idx) => (
                  <option key={sub.id} value={idx} className="bg-slate-900 text-white">
                    {idx + 1}. {sub.studentName} ({sub.score}点 / {sub.scorePercent}%)
                  </option>
                ))}
              </select>

              {!isBatchMode && (
                <div className="flex items-center ml-1 border-l border-slate-700 pl-1">
                  <button
                    type="button"
                    disabled={selectedStudentIndex <= 0}
                    onClick={() => setSelectedStudentIndex(prev => Math.max(0, prev - 1))}
                    className="p-1 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                    title="前の学生"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={selectedStudentIndex >= submissions.length - 1}
                    onClick={() => setSelectedStudentIndex(prev => Math.min(submissions.length - 1, prev + 1))}
                    className="p-1 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                    title="次の学生"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <button
              onClick={handlePrint}
              className={`px-3 py-1.5 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer ${
                sheetMode === 'guidance' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-teal-600 hover:bg-teal-700'
              }`}
              title="A4用紙に印刷またはPDFとして保存"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isBatchMode ? '全員分をA4印刷 / PDF' : 'A4印刷 / PDF保存'}</span>
            </button>

            {!isBatchMode && currentAnalysis && (
              <button
                onClick={() => handleCopyText(currentAnalysis)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1 transition-colors cursor-pointer"
                title="テキストをクリップボードにコピー"
              >
                {copiedToast ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedToast ? '完了' : 'コピー'}</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body / Sheet View */}
        <div className="flex-1 overflow-y-auto bg-slate-100 p-3 sm:p-6 print:p-0 print:bg-white print:overflow-visible">
          {isBatchMode ? (
            <div>
              <div className="no-print mb-4 p-3 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-900 flex items-center justify-between">
                <span className="font-semibold">
                  📄 全 {submissions.length} 名分の{sheetMode === 'guidance' ? '【個人別 苦手分析・指導カルテ】' : '【個別フィードバックシート】'}を一括表示しています。
                  上部の「全員分をA4印刷 / PDF」を押すと、学生1人あたり1ページで綺麗に印刷・PDF保存できます。
                </span>
              </div>
              {studentAnalysisList.map((analysis) => renderSheetContent(analysis, true))}
            </div>
          ) : currentAnalysis ? (
            renderSheetContent(currentAnalysis, false)
          ) : null}
        </div>
      </div>
    </div>
  );
};
