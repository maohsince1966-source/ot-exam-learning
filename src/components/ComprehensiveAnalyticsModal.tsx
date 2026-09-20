import React, { useState, useMemo, useEffect } from 'react';
import { DeliveredTest, Question, SubmissionRecord, StudentRosterItem } from '../types';
import { parseCategory, evaluateAnswer } from '../utils/categoryHelper';
import {
  X,
  Printer,
  FileText,
  ClipboardList,
  User,
  Users,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Target,
  BarChart3,
  Lightbulb,
  GraduationCap,
  Sparkles,
  Download,
  Copy,
  Check,
  Search,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ArrowUpDown,
  Filter,
  CheckSquare,
  Square,
  Layers,
  Award,
  BookOpen
} from 'lucide-react';

interface ComprehensiveAnalyticsModalProps {
  deliveredTests: DeliveredTest[];
  allQuestions: Question[];
  allSubmissions: SubmissionRecord[];
  rosterStudents?: StudentRosterItem[];
  initialStudentId?: string;
  onClose: () => void;
}

export interface StudentComprehensiveData {
  studentKey: string; // studentId or studentName
  studentId: string;
  studentName: string;
  grade?: number;
  totalSubmissionsCount: number;
  testsTakenCount: number;
  totalQuestionsAnswered: number;
  totalCorrectCount: number;
  totalScorePercent: number;
  testsPassedCount: number;
  passRatePercent: number;
  // Test by test score history
  testHistory: Array<{
    testId: string;
    testTitle: string;
    submittedAt: string;
    score: number;
    total: number;
    scorePercent: number;
    passed: boolean;
  }>;
  // Category aggregations across all tests
  categorySummary: Array<{
    name: string;
    subCategories: string[];
    total: number;
    correct: number;
    incorrect: number;
    accuracyPercent: number;
    classAvg: number;
    diff: number;
    priority: 'critical' | 'warning' | 'good';
  }>;
  // Primary weak category
  primaryWeak: {
    name: string;
    accuracyPercent: number;
    total: number;
    incorrect: number;
    classAvg: number;
    subCategories: string[];
  } | null;
  // Second weak category if exists
  secondaryWeak: {
    name: string;
    accuracyPercent: number;
    total: number;
    incorrect: number;
    classAvg: number;
  } | null;
  // Wrong questions across all tests
  wrongQuestions: Array<{
    testId: string;
    testTitle: string;
    question: Question;
    userSelected: number[];
    targetAnswers: number[];
    isPickTwo: boolean;
    categoryMajor: string;
    categorySub: string;
    submittedAt: string;
  }>;
  // Prescriptive coaching advice
  tutoringPlan: string;
  studentFeedbackText: string;
}

export const ComprehensiveAnalyticsModal: React.FC<ComprehensiveAnalyticsModalProps> = ({
  deliveredTests,
  allQuestions,
  allSubmissions,
  rosterStudents = [],
  initialStudentId,
  onClose
}) => {
  // Main view tabs: 'individual' (学生個人別 通算カルテ) or 'class' (全体弱点集計) or 'print' (A4印刷モード)
  const [activeTab, setActiveTab] = useState<'individual' | 'class' | 'print'>('individual');
  
  // Print sheet sub-mode: 'guidance' (教員用指導カルテ) or 'feedback' (学生返却用シート)
  const [printMode, setPrintMode] = useState<'guidance' | 'feedback'>('guidance');

  // Filter by grade
  const [gradeFilter, setGradeFilter] = useState<number | 'all'>('all');

  // Filter which tests to include (by default, all delivered tests that have submissions or exist)
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>(() => deliveredTests.map(t => t.id));

  // Selected student for individual view
  const [selectedStudentKey, setSelectedStudentKey] = useState<string>('');

  // Search filter for students
  const [studentSearch, setStudentSearch] = useState('');

  // Sort settings for student list
  const [sortField, setSortField] = useState<'name' | 'score' | 'submissions' | 'passRate'>('score');
  const [sortAsc, setSortAsc] = useState(false);

  // Editable teacher notes for individual students (persisted in state/localStorage)
  const [teacherNotes, setTeacherNotes] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('comprehensive_teacher_notes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Toast for copy action
  const [copiedToast, setCopiedToast] = useState(false);

  // Save notes to localStorage
  const handleNoteChange = (studentKey: string, text: string) => {
    setTeacherNotes(prev => {
      const updated = { ...prev, [studentKey]: text };
      try {
        localStorage.setItem('comprehensive_teacher_notes', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save teacher notes to localStorage', e);
      }
      return updated;
    });
  };

  // Build a comprehensive question lookup map
  const questionMap = useMemo(() => {
    const map = new Map<string, Question>();
    allQuestions.forEach(q => map.set(q.id, q));
    deliveredTests.forEach(t => {
      if (t.questions && Array.isArray(t.questions)) {
        t.questions.forEach(q => {
          if (!map.has(q.id)) map.set(q.id, q);
        });
      }
    });
    return map;
  }, [allQuestions, deliveredTests]);

  // Filter submissions by selected tests and valid data
  const filteredSubmissions = useMemo(() => {
    return allSubmissions.filter(sub => {
      if (selectedTestIds.length > 0 && !selectedTestIds.includes(sub.testId)) {
        return false;
      }
      return true;
    });
  }, [allSubmissions, selectedTestIds]);

  // Compute Class-Wide Cross-Test Category Averages
  const classCrossTestStats = useMemo(() => {
    if (filteredSubmissions.length === 0) {
      return {
        avgPercent: 0,
        totalAnswers: 0,
        totalCorrect: 0,
        categoryStats: new Map<string, { total: number; correct: number; incorrect: number; accuracyPercent: number }>()
      };
    }

    const catTotals = new Map<string, { total: number; correct: number; incorrect: number }>();
    let totalScorePercentSum = 0;
    let totalAnswers = 0;
    let totalCorrect = 0;

    filteredSubmissions.forEach(sub => {
      totalScorePercentSum += sub.scorePercent;
      const t = deliveredTests.find(dt => dt.id === sub.testId);
      const testQs = (t?.questions && t.questions.length > 0)
        ? t.questions
        : (t?.questionIds || []).map(id => questionMap.get(id)).filter((q): q is Question => q !== undefined);

      testQs.forEach(q => {
        const p = parseCategory(q.category);
        const catKey = p.major || '一般';
        if (!catTotals.has(catKey)) {
          catTotals.set(catKey, { total: 0, correct: 0, incorrect: 0 });
        }
        const stat = catTotals.get(catKey)!;
        stat.total += 1;
        totalAnswers += 1;

        const evalRes = evaluateAnswer(sub.userAnswers?.[q.id] || [], q.answer, q.question);
        if (evalRes.isCorrect) {
          stat.correct += 1;
          totalCorrect += 1;
        } else {
          stat.incorrect += 1;
        }
      });
    });

    const categoryStats = new Map<string, { total: number; correct: number; incorrect: number; accuracyPercent: number }>();
    catTotals.forEach((val, key) => {
      const accuracyPercent = val.total > 0 ? Math.round((val.correct / val.total) * 100) : 0;
      categoryStats.set(key, { ...val, accuracyPercent });
    });

    const avgPercent = filteredSubmissions.length > 0
      ? Math.round(totalScorePercentSum / filteredSubmissions.length)
      : 0;

    return {
      avgPercent,
      totalAnswers,
      totalCorrect,
      categoryStats
    };
  }, [filteredSubmissions, deliveredTests, questionMap]);

  // Aggregate Data by Student (group submissions per student)
  const studentComprehensiveList = useMemo<StudentComprehensiveData[]>(() => {
    if (filteredSubmissions.length === 0) return [];

    // Map: studentKey -> list of submissions
    const studentSubMap = new Map<string, SubmissionRecord[]>();

    filteredSubmissions.forEach(sub => {
      // Priority for studentKey: studentId if available, else normalized studentName
      const key = (sub.studentId && sub.studentId.trim()) 
        ? sub.studentId.trim() 
        : (sub.studentName || '未登録').trim();

      if (!studentSubMap.has(key)) {
        studentSubMap.set(key, []);
      }
      studentSubMap.get(key)!.push(sub);
    });

    // Roster lookup for supplementary grade and verified name
    const rosterMap = new Map<string, StudentRosterItem>();
    rosterStudents.forEach(r => {
      rosterMap.set(r.studentId.trim(), r);
    });

    const results: StudentComprehensiveData[] = [];

    studentSubMap.forEach((subs, key) => {
      // Sort submissions by date ascending
      subs.sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

      // If a student took the same test multiple times, keep the latest submission per testId for cumulative scoring
      const testMap = new Map<string, SubmissionRecord>();
      subs.forEach(s => {
        testMap.set(s.testId, s);
      });
      const uniqueTestSubmissions = Array.from(testMap.values());

      // Student info
      const latestSub = subs[subs.length - 1];
      const rosterInfo = latestSub.studentId ? rosterMap.get(latestSub.studentId.trim()) : undefined;
      const studentId = latestSub.studentId || rosterInfo?.studentId || '';
      const studentName = rosterInfo?.name || latestSub.studentName || '受講生';
      const grade = rosterInfo?.grade || latestSub.grade;

      // Filter by grade if set
      if (gradeFilter !== 'all' && grade !== gradeFilter) {
        return;
      }

      // Aggregate cumulative answers and questions
      let totalQuestionsAnswered = 0;
      let totalCorrectCount = 0;
      let testsPassedCount = 0;

      const wrongQuestions: StudentComprehensiveData['wrongQuestions'] = [];
      const categoryMap = new Map<string, { total: number; correct: number; incorrect: number; subCategories: Set<string> }>();

      const testHistory = uniqueTestSubmissions.map(sub => {
        if (sub.passed) testsPassedCount += 1;
        totalQuestionsAnswered += sub.total;
        totalCorrectCount += sub.score;

        const t = deliveredTests.find(dt => dt.id === sub.testId);
        const testQs = (t?.questions && t.questions.length > 0)
          ? t.questions
          : (t?.questionIds || []).map(id => questionMap.get(id)).filter((q): q is Question => q !== undefined);

        testQs.forEach(q => {
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
              testId: sub.testId,
              testTitle: sub.testTitle || t?.title || '小テスト',
              question: q,
              userSelected: evalRes.userSelected,
              targetAnswers: evalRes.targetAnswers,
              isPickTwo: evalRes.isPickTwo,
              categoryMajor: p.major,
              categorySub: p.sub,
              submittedAt: sub.submittedAt
            });
          }
        });

        return {
          testId: sub.testId,
          testTitle: sub.testTitle || t?.title || '小テスト',
          submittedAt: sub.submittedAt,
          score: sub.score,
          total: sub.total,
          scorePercent: sub.scorePercent,
          passed: sub.passed
        };
      });

      const totalScorePercent = totalQuestionsAnswered > 0
        ? Math.round((totalCorrectCount / totalQuestionsAnswered) * 100)
        : 0;

      const passRatePercent = uniqueTestSubmissions.length > 0
        ? Math.round((testsPassedCount / uniqueTestSubmissions.length) * 100)
        : 0;

      // Category summary sorted by lowest accuracy first (weakest first)
      const categorySummary = Array.from(categoryMap.entries()).map(([name, stat]) => {
        const accuracyPercent = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
        const classAvg = classCrossTestStats.categoryStats.get(name)?.accuracyPercent ?? accuracyPercent;
        const diff = accuracyPercent - classAvg;

        let priority: 'critical' | 'warning' | 'good' = 'good';
        if (accuracyPercent < 50 || stat.incorrect >= 3) {
          priority = 'critical';
        } else if (accuracyPercent < 75 && stat.incorrect >= 1) {
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
      }).sort((a, b) => {
        // Sort primarily by accuracy ascending, secondarily by incorrect count descending
        if (a.accuracyPercent !== b.accuracyPercent) {
          return a.accuracyPercent - b.accuracyPercent;
        }
        return b.incorrect - a.incorrect;
      });

      // Filter weak categories
      const weakList = categorySummary.filter(c => c.incorrect > 0);
      const primaryWeak = weakList.length > 0 ? {
        name: weakList[0].name,
        accuracyPercent: weakList[0].accuracyPercent,
        total: weakList[0].total,
        incorrect: weakList[0].incorrect,
        classAvg: weakList[0].classAvg,
        subCategories: weakList[0].subCategories
      } : null;

      const secondaryWeak = weakList.length > 1 ? {
        name: weakList[1].name,
        accuracyPercent: weakList[1].accuracyPercent,
        total: weakList[1].total,
        incorrect: weakList[1].incorrect,
        classAvg: weakList[1].classAvg
      } : null;

      // Automated comprehensive tutoring advice
      let tutoringPlan = '';
      if (primaryWeak) {
        const subCatNotice = primaryWeak.subCategories.length > 0
          ? `（特に「${primaryWeak.subCategories.slice(0, 3).join('・')}」）`
          : '';
        tutoringPlan = `【全試験を通じた通算最優先弱点分野: ${primaryWeak.name}】${subCatNotice}\n` +
          `・通算正答率は ${primaryWeak.accuracyPercent}%（通算${primaryWeak.incorrect}問失点 / クラス平均比 ${primaryWeak.accuracyPercent - primaryWeak.classAvg >= 0 ? '+' : ''}${primaryWeak.accuracyPercent - primaryWeak.classAvg}%）。\n` +
          `・複数の小テストを横断してこの分野で失点が頻発しているため、単発のケアレスミスではなく基礎概念・知識の構造的理解不足が強く疑われます。\n` +
          `・次回面談時に、該当分野の定義・病態生理・評価介入の基準を口頭試問し、まとめノートを作成させて定着を促してください。`;
      } else {
        tutoringPlan = `全試験を通じて顕著な弱点分野は見られず、高い正答水準（通算${totalScorePercent}%）を安定して維持しています。\n国家試験本番に向け、複合問題や高難度・応用過去問の演習へと進めてください。`;
      }

      // Student feedback text
      let studentFeedbackText = '';
      if (totalScorePercent >= 80) {
        studentFeedbackText = `これまで実施した全${uniqueTestSubmissions.length}回の小テストにおいて、通算正答率${totalScorePercent}%と極めて優秀な学習成果を維持できています。\n`;
        if (primaryWeak && primaryWeak.incorrect > 0) {
          studentFeedbackText += `ただし、全試験を通算すると【${primaryWeak.name}】分野で${primaryWeak.incorrect}問の失点があります。この部分の解説を再確認し、完全制覇を目指しましょう！`;
        } else {
          studentFeedbackText += `この調子で過去問の類題演習や実戦問題にも積極的にチャレンジしていきましょう！`;
        }
      } else if (totalScorePercent >= 60) {
        studentFeedbackText = `これまでの全${uniqueTestSubmissions.length}回の小テストで通算正答率${totalScorePercent}%を記録し、合格基準（60%）を達成しています。\n`;
        if (primaryWeak) {
          studentFeedbackText += `蓄積データから分析すると、特に【${primaryWeak.name}】分野（正答率${primaryWeak.accuracyPercent}%）の失点が多くなっています。弱点分野を優先的に復習することで、さらなるスコアアップが見込めます。`;
        }
      } else {
        studentFeedbackText = `これまでの全${uniqueTestSubmissions.length}回の小テスト通算正答率は${totalScorePercent}%となっています。\n`;
        if (primaryWeak) {
          studentFeedbackText += `特に【${primaryWeak.name}】分野（失点${primaryWeak.incorrect}問）でつまずきが集中しています。まずはこの弱点分野の基礎用語と過去問解説を繰り返し復習しましょう。`;
        }
      }

      results.push({
        studentKey: key,
        studentId,
        studentName,
        grade,
        totalSubmissionsCount: subs.length,
        testsTakenCount: uniqueTestSubmissions.length,
        totalQuestionsAnswered,
        totalCorrectCount,
        totalScorePercent,
        testsPassedCount,
        passRatePercent,
        testHistory,
        categorySummary,
        primaryWeak,
        secondaryWeak,
        wrongQuestions,
        tutoringPlan,
        studentFeedbackText
      });
    });

    return results;
  }, [filteredSubmissions, deliveredTests, questionMap, classCrossTestStats, gradeFilter, rosterStudents]);

  // Set default selected student
  useEffect(() => {
    if (studentComprehensiveList.length > 0) {
      if (initialStudentId) {
        const found = studentComprehensiveList.find(s => s.studentId === initialStudentId || s.studentKey === initialStudentId);
        if (found) {
          setSelectedStudentKey(found.studentKey);
          return;
        }
      }
      if (!selectedStudentKey || !studentComprehensiveList.some(s => s.studentKey === selectedStudentKey)) {
        setSelectedStudentKey(studentComprehensiveList[0].studentKey);
      }
    }
  }, [studentComprehensiveList, initialStudentId]);

  // Active student object
  const activeStudent = useMemo(() => {
    return studentComprehensiveList.find(s => s.studentKey === selectedStudentKey) || studentComprehensiveList[0] || null;
  }, [studentComprehensiveList, selectedStudentKey]);

  // Filtered and sorted student list for table and picker
  const displayedStudents = useMemo(() => {
    return studentComprehensiveList
      .filter(s => {
        if (!studentSearch.trim()) return true;
        const q = studentSearch.toLowerCase();
        return s.studentName.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortField === 'score') {
          diff = a.totalScorePercent - b.totalScorePercent;
        } else if (sortField === 'submissions') {
          diff = a.testsTakenCount - b.testsTakenCount;
        } else if (sortField === 'passRate') {
          diff = a.passRatePercent - b.passRatePercent;
        } else {
          diff = a.studentName.localeCompare(b.studentName, 'ja');
        }
        return sortAsc ? diff : -diff;
      });
  }, [studentComprehensiveList, studentSearch, sortField, sortAsc]);

  // Class-wide ranking of weakest categories across all tests
  const classWeakestCategories = useMemo(() => {
    const list = Array.from(classCrossTestStats.categoryStats.entries()).map(([name, stat]) => {
      return {
        name,
        total: stat.total,
        correct: stat.correct,
        incorrect: stat.incorrect,
        accuracyPercent: stat.accuracyPercent
      };
    });
    // Sort by accuracy ascending, then by incorrect descending
    return list.sort((a, b) => {
      if (a.accuracyPercent !== b.accuracyPercent) {
        return a.accuracyPercent - b.accuracyPercent;
      }
      return b.incorrect - a.incorrect;
    });
  }, [classCrossTestStats]);

  // Class-wide most missed questions across all tests
  const classMostMissedQuestions = useMemo(() => {
    const qStatMap = new Map<string, {
      question: Question;
      totalAnswers: number;
      correctCount: number;
      incorrectCount: number;
      testTitles: Set<string>;
    }>();

    filteredSubmissions.forEach(sub => {
      const t = deliveredTests.find(dt => dt.id === sub.testId);
      const testQs = (t?.questions && t.questions.length > 0)
        ? t.questions
        : (t?.questionIds || []).map(id => questionMap.get(id)).filter((q): q is Question => q !== undefined);

      testQs.forEach(q => {
        if (!qStatMap.has(q.id)) {
          qStatMap.set(q.id, {
            question: q,
            totalAnswers: 0,
            correctCount: 0,
            incorrectCount: 0,
            testTitles: new Set()
          });
        }
        const item = qStatMap.get(q.id)!;
        item.totalAnswers += 1;
        if (sub.testTitle) item.testTitles.add(sub.testTitle);

        const evalRes = evaluateAnswer(sub.userAnswers?.[q.id] || [], q.answer, q.question);
        if (evalRes.isCorrect) {
          item.correctCount += 1;
        } else {
          item.incorrectCount += 1;
        }
      });
    });

    return Array.from(qStatMap.values())
      .filter(item => item.totalAnswers >= 1)
      .map(item => ({
        ...item,
        accuracyPercent: Math.round((item.correctCount / item.totalAnswers) * 100)
      }))
      .sort((a, b) => {
        if (a.accuracyPercent !== b.accuracyPercent) {
          return a.accuracyPercent - b.accuracyPercent;
        }
        return b.incorrectCount - a.incorrectCount;
      })
      .slice(0, 15);
  }, [filteredSubmissions, deliveredTests, questionMap]);

  // Export Comprehensive CSV
  const handleExportComprehensiveCSV = () => {
    if (studentComprehensiveList.length === 0) return;
    const headers = [
      '学籍番号',
      '学生氏名',
      '学年',
      '受験テスト数',
      '合格テスト数',
      '合格率',
      '累計解答問題数',
      '累計正解数',
      '通算正答率',
      '通算最優先弱点分野',
      '弱点分野正答率',
      '弱点分野失点数',
      '第二弱点分野',
      '教員面談メモ'
    ];

    const dataRows = studentComprehensiveList.map(s => [
      s.studentId,
      s.studentName,
      s.grade ? `${s.grade}年生` : '',
      String(s.testsTakenCount),
      String(s.testsPassedCount),
      `${s.passRatePercent}%`,
      String(s.totalQuestionsAnswered),
      String(s.totalCorrectCount),
      `${s.totalScorePercent}%`,
      s.primaryWeak?.name || 'なし',
      s.primaryWeak ? `${s.primaryWeak.accuracyPercent}%` : '',
      String(s.primaryWeak ? s.primaryWeak.incorrect : 0),
      s.secondaryWeak?.name || '',
      teacherNotes[s.studentKey] || ''
    ]);

    const allLines = [headers, ...dataRows];
    const csvContent = allLines
      .map(row =>
        row
          .map(val => `"${String(val).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\r\n');

    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvContent], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `全小テスト総合弱点分析_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copy guidance text to clipboard
  const handleCopyGuidanceText = () => {
    if (!activeStudent) return;
    const text = `【${activeStudent.studentName}様（学籍番号: ${activeStudent.studentId || '未登録'}） 全小テスト総合指導カルテ】\n` +
      `■ 通算成績サマリー\n` +
      `・受験回数: ${activeStudent.testsTakenCount}回中 ${activeStudent.testsPassedCount}回合格 (合格率: ${activeStudent.passRatePercent}%)\n` +
      `・通算正答率: ${activeStudent.totalScorePercent}% (${activeStudent.totalCorrectCount}/${activeStudent.totalQuestionsAnswered}問 正解) [クラス平均比: ${activeStudent.totalScorePercent - classCrossTestStats.avgPercent >= 0 ? '+' : ''}${(activeStudent.totalScorePercent - classCrossTestStats.avgPercent).toFixed(1)}%]\n\n` +
      `■ 通算弱点分析\n` +
      (activeStudent.primaryWeak ? `・最優先補強分野: ${activeStudent.primaryWeak.name} (正答率: ${activeStudent.primaryWeak.accuracyPercent}%, 失点: ${activeStudent.primaryWeak.incorrect}問)\n` : '・顕著な弱点分野なし\n') +
      (activeStudent.secondaryWeak ? `・第二弱点分野: ${activeStudent.secondaryWeak.name} (正答率: ${activeStudent.secondaryWeak.accuracyPercent}%, 失点: ${activeStudent.secondaryWeak.incorrect}問)\n` : '') +
      `\n■ 指導方針・アドバイス\n` +
      activeStudent.tutoringPlan +
      `\n\n■ 面談メモ・特記事項\n` +
      (teacherNotes[activeStudent.studentKey] || '（記録なし）');

    navigator.clipboard.writeText(text);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2000);
  };

  // Print execution
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto">
      {/* Modal Container */}
      <div className="bg-slate-50 rounded-3xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden print:max-h-none print:h-auto print:border-none print:shadow-none print:rounded-none print:bg-white">
        
        {/* Header (Hidden when printing) */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-br from-amber-500 to-amber-700 rounded-2xl text-white shadow-md">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 uppercase tracking-wide">
                  全試験横断 総合分析
                </span>
                <span className="text-xs text-slate-400">
                  全 {deliveredTests.length} 回の小テスト対象
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-white mt-0.5">
                全テスト総合 苦手分野特定＆指導資料作成
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleExportComprehensiveCSV}
              disabled={studentComprehensiveList.length === 0}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors border border-slate-700 disabled:opacity-50"
              title="全学生の通算成績・弱点分野データをCSV形式でダウンロード"
            >
              <Download className="w-3.5 h-3.5" />
              <span>全試験総合 CSV</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('print');
              }}
              disabled={studentComprehensiveList.length === 0}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
              title="A4指導カルテ・フィードバックシートを印刷 / PDF保存"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>指導カルテ A4印刷</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-Header Tabs & Quick Filters (Hidden when printing) */}
        <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 print:hidden">
          {/* Main Navigation Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('individual')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'individual'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>👤 学生個人別 通算弱点カルテ</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'individual' ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {studentComprehensiveList.length}名
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('class')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'class'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>👥 クラス全体 通算弱点分析</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('print')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'print'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>🖨️ A4印刷・PDF出力プレビュー</span>
            </button>
          </div>

          {/* Grade & Test Scope Filters */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {/* Grade Filter */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <span className="text-slate-500 font-medium px-1 flex items-center gap-1 text-[11px]">
                <GraduationCap className="w-3.5 h-3.5" />
                学年:
              </span>
              <button
                type="button"
                onClick={() => setGradeFilter('all')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  gradeFilter === 'all' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                全学年
              </button>
              {[1, 2, 3, 4].map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGradeFilter(g)}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    gradeFilter === g ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  {g}年
                </button>
              ))}
            </div>

            {/* Test count badge */}
            <div className="text-[11px] text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
              対象テスト: <strong className="text-slate-800">{selectedTestIds.length} / {deliveredTests.length}</strong> 件
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 print:p-0 print:overflow-visible">
          
          {/* NO DATA STATE */}
          {filteredSubmissions.length === 0 ? (
            <div className="py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200 p-8 space-y-3">
              <Layers className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-800">まだ小テストの提出データがありません</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                配信中の小テストを学生が受験して提出すると、ここに複数回の全小テスト結果を総合した「通算弱点分野分析」と「指導資料」が自動生成されます。
              </p>
            </div>
          ) : (
            <>
              {/* TAB 1: INDIVIDUAL STUDENT COMPREHENSIVE VIEW */}
              {activeTab === 'individual' && activeStudent && (
                <div className="space-y-6">
                  {/* Student Selector Bar */}
                  <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
                      <span className="text-xs font-bold text-amber-900 shrink-0 flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-amber-700" />
                        対象学生:
                      </span>
                      <select
                        value={selectedStudentKey}
                        onChange={(e) => setSelectedStudentKey(e.target.value)}
                        className="px-3 py-1.5 bg-white border border-amber-300 rounded-xl text-xs sm:text-sm font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500 min-w-64"
                      >
                        {studentComprehensiveList.map((s, i) => (
                          <option key={s.studentKey} value={s.studentKey}>
                            {i + 1}. {s.studentName} {s.studentId ? `(${s.studentId})` : ''} - 通算正答率: {s.totalScorePercent}% ({s.testsTakenCount}回受験)
                          </option>
                        ))}
                      </select>

                      {/* Prev / Next buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const curIdx = studentComprehensiveList.findIndex(s => s.studentKey === selectedStudentKey);
                            if (curIdx > 0) {
                              setSelectedStudentKey(studentComprehensiveList[curIdx - 1].studentKey);
                            }
                          }}
                          disabled={studentComprehensiveList.findIndex(s => s.studentKey === selectedStudentKey) <= 0}
                          className="p-1.5 bg-white rounded-lg border border-amber-200 hover:bg-amber-100 disabled:opacity-40 transition-colors"
                          title="前の学生"
                        >
                          <ChevronLeft className="w-4 h-4 text-slate-700" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const curIdx = studentComprehensiveList.findIndex(s => s.studentKey === selectedStudentKey);
                            if (curIdx >= 0 && curIdx < studentComprehensiveList.length - 1) {
                              setSelectedStudentKey(studentComprehensiveList[curIdx + 1].studentKey);
                            }
                          }}
                          disabled={studentComprehensiveList.findIndex(s => s.studentKey === selectedStudentKey) >= studentComprehensiveList.length - 1}
                          className="p-1.5 bg-white rounded-lg border border-amber-200 hover:bg-amber-100 disabled:opacity-40 transition-colors"
                          title="次の学生"
                        >
                          <ChevronRight className="w-4 h-4 text-slate-700" />
                        </button>
                      </div>
                    </div>

                    {/* Action Buttons for this Student */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap w-full md:w-auto justify-end">
                      <button
                        type="button"
                        onClick={handleCopyGuidanceText}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs"
                        title="この学生の通算指導カルテテキストをクリップボードにコピー"
                      >
                        {copiedToast ? (
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
                          setPrintMode('guidance');
                          setActiveTab('print');
                        }}
                        className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs"
                        title="この学生の全試験総合指導カルテをA4印刷"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>指導カルテ A4印刷</span>
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-4">
                    {/* Overall Score */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
                        <span>全試験 通算正答率</span>
                        <Award className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className={`text-2xl sm:text-3xl font-black ${
                          activeStudent.totalScorePercent >= 80
                            ? 'text-emerald-600'
                            : activeStudent.totalScorePercent >= 60
                              ? 'text-teal-600'
                              : 'text-rose-600'
                        }`}>
                          {activeStudent.totalScorePercent}%
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                          ({activeStudent.totalCorrectCount} / {activeStudent.totalQuestionsAnswered}問 正解)
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        受験回数: <strong className="text-slate-800">{activeStudent.testsTakenCount} 回</strong>
                        （合格 {activeStudent.testsPassedCount}回 / 合格率 {activeStudent.passRatePercent}%）
                      </div>
                    </div>

                    {/* Class Average Comparison */}
                    <div className="bg-white border border-indigo-200 rounded-2xl p-4 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-bold text-indigo-700 mb-1">
                        <span>クラス通算平均との比較</span>
                        <TrendingUp className="w-4 h-4 text-indigo-500" />
                      </div>
                      {(() => {
                        const diff = activeStudent.totalScorePercent - classCrossTestStats.avgPercent;
                        return (
                          <div>
                            <div className="flex items-baseline gap-1.5 mt-1">
                              <span className={`text-2xl sm:text-3xl font-black ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {diff >= 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`}
                              </span>
                              <span className="text-xs text-slate-500 font-medium">
                                (平均比)
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 mt-1">
                              クラス通算平均: <strong className="text-slate-800">{classCrossTestStats.avgPercent}%</strong>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Primary Weak Category (The Core Request!) */}
                    <div className="bg-white border border-rose-200 rounded-2xl p-4 shadow-2xs col-span-1 md:col-span-2">
                      <div className="flex items-center justify-between text-xs font-bold text-rose-700 mb-1">
                        <span className="flex items-center gap-1">
                          <Target className="w-4 h-4 text-rose-500" />
                          全試験を通じた最優先補強分野（特定された弱点）
                        </span>
                        {activeStudent.primaryWeak && (
                          <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full">
                            要重点指導
                          </span>
                        )}
                      </div>
                      {activeStudent.primaryWeak ? (
                        <div className="mt-1">
                          <div className="text-lg sm:text-xl font-black text-rose-700 truncate" title={activeStudent.primaryWeak.name}>
                            {activeStudent.primaryWeak.name}
                          </div>
                          <div className="flex items-baseline gap-3 mt-1 flex-wrap">
                            <div>
                              <span className="text-xs text-slate-500 mr-1">本人正答率:</span>
                              <span className="text-xl font-black text-rose-700">
                                {activeStudent.primaryWeak.accuracyPercent}%
                              </span>
                              <span className="text-xs text-rose-600 font-bold ml-1">
                                ({activeStudent.primaryWeak.incorrect}問 失点 / 全{activeStudent.primaryWeak.total}問中)
                              </span>
                            </div>
                            <div className="text-xs text-slate-500">
                              クラス平均: <strong className="text-slate-700">{activeStudent.primaryWeak.classAvg}%</strong>
                            </div>
                          </div>
                          {activeStudent.primaryWeak.subCategories.length > 0 && (
                            <div className="text-[11px] text-slate-600 mt-1 truncate">
                              含まれる中項目: <span className="font-semibold text-slate-800">{activeStudent.primaryWeak.subCategories.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="py-2">
                          <div className="text-sm font-bold text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4" />
                            顕著な弱点分野はありません
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            すべての出題分野で高い正答率を安定して獲得しています。
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Score History Across Tests (Trend Line / Cards) */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-indigo-600" />
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                          テスト別 得点推移履歴 ({activeStudent.testHistory.length}回)
                        </h4>
                      </div>
                      <span className="text-xs text-slate-500">
                        実施順のスコア変遷
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-1">
                      {activeStudent.testHistory.map((item, idx) => (
                        <div
                          key={item.testId}
                          className="p-2.5 rounded-xl border bg-slate-50 border-slate-200 flex flex-col justify-between space-y-1 hover:bg-slate-100/80 transition-colors"
                        >
                          <div className="text-[10px] text-slate-400 font-mono truncate" title={item.testTitle}>
                            第{idx + 1}回: {item.testTitle}
                          </div>
                          <div className="flex items-baseline justify-between">
                            <span className={`text-lg font-black ${
                              item.scorePercent >= 80 
                                ? 'text-emerald-600' 
                                : item.scorePercent >= 60 
                                  ? 'text-teal-600' 
                                  : 'text-rose-600'
                            }`}>
                              {item.scorePercent}%
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {item.score}/{item.total}問
                            </span>
                          </div>
                          <div>
                            {item.passed ? (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.2 rounded">合格</span>
                            ) : (
                              <span className="text-[10px] font-bold text-rose-700 bg-rose-100/70 px-1.5 py-0.2 rounded">不合格</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Comprehensive Category Breakdown Table */}
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                    <div className="p-3.5 sm:p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-amber-600" />
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                          全試験横断 分野別 苦手度診断表（各大項目・中項目）
                        </h4>
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        全{activeStudent.categorySummary.length}分野の通算解答結果
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs font-semibold">
                          <tr>
                            <th className="py-2.5 px-3 sm:px-4">分野名（大項目）</th>
                            <th className="py-2.5 px-3 sm:px-4">関連する中項目</th>
                            <th className="py-2.5 px-3 sm:px-4 text-center">通算出題数</th>
                            <th className="py-2.5 px-3 sm:px-4 text-center">正解 / 誤答</th>
                            <th className="py-2.5 px-3 sm:px-4">通算正答率</th>
                            <th className="py-2.5 px-3 sm:px-4 text-center">クラス平均</th>
                            <th className="py-2.5 px-3 sm:px-4 text-center">指導優先度</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {activeStudent.categorySummary.map((cat) => (
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
                                  <div className="w-20 sm:w-24 bg-slate-100 rounded-full h-2 overflow-hidden">
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
                                    要重点補強
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

                  {/* All Missed Questions Across Tests */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-amber-600" />
                        <h4 className="text-sm sm:text-base font-bold text-slate-900">
                          全試験を通じてつまずいた問題と解説資料 ({activeStudent.wrongQuestions.length}問)
                        </h4>
                      </div>
                      <span className="text-xs text-slate-500">
                        どの小テストで失点したかと指導用解説
                      </span>
                    </div>

                    {activeStudent.wrongQuestions.length === 0 ? (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
                        <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                        <p className="text-sm font-bold text-emerald-900">
                          全試験を通じて誤答がありません！素晴らしい成果です
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {activeStudent.wrongQuestions.map((item, qIdx) => (
                          <div
                            key={`${item.testId}_${item.question.id}_${qIdx}`}
                            className="bg-white border border-rose-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3"
                          >
                            {/* Question Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-0.5 rounded-lg border border-indigo-200">
                                  {item.testTitle}
                                </span>
                                <span className="text-xs font-mono text-slate-600 font-bold">
                                  問: {item.question.id}
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
                              </div>

                              <div className="text-xs text-rose-600 font-bold flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>誤答</span>
                              </div>
                            </div>

                            {/* Question Text */}
                            <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-medium">
                              {item.question.question}
                            </p>

                            {/* Choices Comparison */}
                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1 text-xs">
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
                                        本人の誤答
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

                            {/* Explanation Box */}
                            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 space-y-1 text-xs text-amber-950">
                              <div className="flex items-center gap-1 font-bold text-amber-900">
                                <Lightbulb className="w-4 h-4 text-amber-600" />
                                <span>指導用解説</span>
                              </div>
                              <p className="text-xs leading-relaxed text-slate-800 whitespace-pre-wrap pl-5 font-normal">
                                {item.question.explanation || '解説文は現在登録されていません。'}
                              </p>
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
                          全試験総合 指導処方箋＆面談記録メモ
                        </h4>
                      </div>
                      <span className="text-xs text-slate-500">
                        指導カルテ（A4印刷）に連動反映
                      </span>
                    </div>

                    {/* Auto-generated Advice */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-xs text-slate-700">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                        <span>全試験総合の診断方針提案:</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed text-slate-800">
                        {activeStudent.tutoringPlan}
                      </p>
                    </div>

                    {/* Teacher Editable Notes */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-700">
                        教員自由記述・面談記録（特記事項・個別宿題）:
                      </label>
                      <textarea
                        rows={3}
                        value={teacherNotes[activeStudent.studentKey] || ''}
                        onChange={(e) => handleNoteChange(activeStudent.studentKey, e.target.value)}
                        placeholder="例: 全テスト総合で身体障害分野の失点が目立つ。面談にて解剖学のノート持参を指示。次回までに〇〇の重要用語を再チェックさせる。"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all resize-y"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: CLASS-WIDE COMPREHENSIVE VIEW */}
              {activeTab === 'class' && (
                <div className="space-y-6">
                  {/* Highlights Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    {/* Overall Class Average */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
                      <div className="text-xs font-bold text-slate-500 mb-1">クラス通算平均正答率</div>
                      <div className="text-3xl font-black text-slate-900">
                        {classCrossTestStats.avgPercent}%
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        延べ提出数: <strong className="text-slate-700">{filteredSubmissions.length} 件</strong> / 実受講生: <strong className="text-slate-700">{studentComprehensiveList.length} 名</strong>
                      </div>
                    </div>

                    {/* Class Worst Category */}
                    <div className="bg-white border border-rose-200 rounded-2xl p-4 shadow-2xs sm:col-span-2">
                      <div className="text-xs font-bold text-rose-700 mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4 text-rose-500" />
                        <span>クラス全体で最もつまずいている通算弱点分野（ワースト1位）</span>
                      </div>
                      {classWeakestCategories.length > 0 ? (
                        <div className="flex items-baseline justify-between mt-1 flex-wrap gap-2">
                          <div>
                            <div className="text-xl font-black text-rose-700">
                              {classWeakestCategories[0].name}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              通算出題 {classWeakestCategories[0].total} 回中、
                              <strong className="text-rose-600 font-bold">{classWeakestCategories[0].incorrect} 回失点</strong>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-2xl font-black text-rose-700 font-mono">
                              {classWeakestCategories[0].accuracyPercent}%
                            </span>
                            <span className="text-xs text-slate-500 block">クラス正答率</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">データなし</div>
                      )}
                    </div>
                  </div>

                  {/* Class Weak Categories Ranking */}
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                    <div className="p-3.5 sm:p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-rose-600" />
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                          クラス全体の通算弱点分野ランキング（全小テスト合算）
                        </h4>
                      </div>
                      <span className="text-xs text-slate-500">
                        正答率が低い順（講義・補習の重点分野）
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs font-semibold">
                          <tr>
                            <th className="py-2.5 px-3 sm:px-4 text-center w-14">順位</th>
                            <th className="py-2.5 px-3 sm:px-4">分野名（大項目）</th>
                            <th className="py-2.5 px-3 sm:px-4 text-center">総解答数</th>
                            <th className="py-2.5 px-3 sm:px-4 text-center">正解 / 誤答</th>
                            <th className="py-2.5 px-3 sm:px-4">クラス正答率</th>
                            <th className="py-2.5 px-3 sm:px-4 text-center">補強優先度</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {classWeakestCategories.map((cat, idx) => (
                            <tr key={cat.name} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-2.5 px-3 sm:px-4 text-center font-bold">
                                {idx < 3 ? (
                                  <span className="w-6 h-6 rounded-full bg-rose-100 text-rose-800 flex items-center justify-center mx-auto text-xs font-black">
                                    {idx + 1}
                                  </span>
                                ) : (
                                  <span className="text-slate-500">{idx + 1}</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 sm:px-4 font-bold text-slate-900">
                                {cat.name}
                              </td>
                              <td className="py-2.5 px-3 sm:px-4 text-center text-slate-700">
                                {cat.total}
                              </td>
                              <td className="py-2.5 px-3 sm:px-4 text-center text-xs">
                                <span className="text-emerald-700 font-bold">{cat.correct}正</span>
                                <span className="text-slate-300 mx-1">/</span>
                                <span className="text-rose-600 font-bold">{cat.incorrect}誤</span>
                              </td>
                              <td className="py-2.5 px-3 sm:px-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden">
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
                              <td className="py-2.5 px-3 sm:px-4 text-center">
                                {cat.accuracyPercent < 50 ? (
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                    最優先補習
                                  </span>
                                ) : cat.accuracyPercent < 75 ? (
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                    要再確認
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
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

                  {/* Student Leaderboard / Comprehensive Roster Table */}
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs space-y-3 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-indigo-600" />
                        <h4 className="text-sm font-bold text-slate-900">
                          全受講生 通算成績・弱点特定一覧 ({displayedStudents.length}名)
                        </h4>
                      </div>

                      {/* Search & Sort Controls */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                          <input
                            type="text"
                            placeholder="氏名・学籍番号で検索"
                            value={studentSearch}
                            onChange={(e) => setStudentSearch(e.target.value)}
                            className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 w-48"
                          />
                        </div>

                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              if (sortField === 'score') setSortAsc(!sortAsc);
                              else { setSortField('score'); setSortAsc(false); }
                            }}
                            className={`px-2 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${
                              sortField === 'score' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                            }`}
                          >
                            <span>正答率</span>
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (sortField === 'submissions') setSortAsc(!sortAsc);
                              else { setSortField('submissions'); setSortAsc(false); }
                            }}
                            className={`px-2 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${
                              sortField === 'submissions' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                            }`}
                          >
                            <span>受験数</span>
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold">
                          <tr>
                            <th className="py-2.5 px-3">学生氏名 / 学籍番号</th>
                            <th className="py-2.5 px-3 text-center">学年</th>
                            <th className="py-2.5 px-3 text-center">受験回数</th>
                            <th className="py-2.5 px-3 text-center">合格率</th>
                            <th className="py-2.5 px-3">通算正答率</th>
                            <th className="py-2.5 px-3">特定された最優先弱点分野</th>
                            <th className="py-2.5 px-3 text-right">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {displayedStudents.map((s) => (
                            <tr key={s.studentKey} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-900">{s.studentName}</div>
                                {s.studentId && (
                                  <div className="text-xs text-slate-400 font-mono">{s.studentId}</div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center text-xs text-slate-600">
                                {s.grade ? `${s.grade}年` : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                                {s.testsTakenCount}回
                              </td>
                              <td className="py-2.5 px-3 text-center text-xs">
                                <span className={`font-bold ${s.passRatePercent >= 70 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                  {s.passRatePercent}%
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2">
                                  <span className={`font-mono font-black text-sm ${
                                    s.totalScorePercent >= 80 
                                      ? 'text-emerald-600' 
                                      : s.totalScorePercent >= 60 
                                        ? 'text-teal-600' 
                                        : 'text-rose-600'
                                  }`}>
                                    {s.totalScorePercent}%
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    ({s.totalCorrectCount}/{s.totalQuestionsAnswered})
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                {s.primaryWeak ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200 truncate max-w-xs" title={s.primaryWeak.name}>
                                    <Target className="w-3 h-3 text-rose-500 shrink-0" />
                                    <span className="truncate">{s.primaryWeak.name}</span>
                                    <span className="text-[10px] text-rose-500 font-mono">({s.primaryWeak.accuracyPercent}%)</span>
                                  </span>
                                ) : (
                                  <span className="text-xs text-emerald-700 font-medium">弱点なし</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedStudentKey(s.studentKey);
                                    setActiveTab('individual');
                                  }}
                                  className="px-2.5 py-1 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg transition-colors inline-flex items-center gap-1"
                                >
                                  <ClipboardList className="w-3.5 h-3.5" />
                                  <span>個別カルテ</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: A4 PRINT & PDF OUTPUT PREVIEW */}
              {activeTab === 'print' && (
                <div className="space-y-6">
                  {/* Print Top Bar (Hidden on actual print) */}
                  <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs print:hidden">
                    <div>
                      <div className="flex items-center gap-2">
                        <Printer className="w-5 h-5 text-indigo-700" />
                        <h3 className="text-sm font-bold text-indigo-950">
                          全小テスト総合 A4印刷・PDF出力プレビュー
                        </h3>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        これまでの全試験（全{selectedTestIds.length}回）の結果を合算した個別カルテを用紙（A4サイズ）に最適化して出力します。
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {/* Mode Toggle */}
                      <div className="flex items-center bg-white p-1 rounded-xl border border-indigo-200 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setPrintMode('guidance')}
                          className={`px-3 py-1 rounded-lg transition-all ${
                            printMode === 'guidance'
                              ? 'bg-indigo-600 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          教員用 指導カルテ
                        </button>
                        <button
                          type="button"
                          onClick={() => setPrintMode('feedback')}
                          className={`px-3 py-1 rounded-lg transition-all ${
                            printMode === 'feedback'
                              ? 'bg-teal-600 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          学生返却用 シート
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handlePrint}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <Printer className="w-4 h-4" />
                        <span>今すぐ印刷 / PDF保存</span>
                      </button>
                    </div>
                  </div>

                  {/* Print Document Sheets (A4 Layout) */}
                  <div className="space-y-8 print:space-y-0">
                    {(activeStudent ? [activeStudent] : studentComprehensiveList).map((s) => (
                      <div
                        key={s.studentKey}
                        className="bg-white rounded-2xl border border-slate-300 p-8 shadow-sm print:border-none print:shadow-none print:p-0 print:m-0 print:w-full space-y-6 print:space-y-4"
                        style={{ pageBreakAfter: 'always' }}
                      >
                        {/* Print Header */}
                        <div className="border-b-2 border-slate-900 pb-3 flex items-start justify-between">
                          <div>
                            <div className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
                              作業療法士 国家試験対策演習 【全試験総合版】
                            </div>
                            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                              {printMode === 'guidance' 
                                ? '全小テスト総合 苦手分野分析・個別指導カルテ' 
                                : '全小テスト総合 成績＆弱点分野フィードバックシート'}
                            </h1>
                            <div className="text-xs text-slate-600 mt-1">
                              対象小テスト: 配信全{s.testsTakenCount}回分横断集計 / 作成日: {new Date().toLocaleDateString('ja-JP')}
                            </div>
                          </div>

                          {/* Student Info Box */}
                          <div className="text-right border border-slate-300 bg-slate-50 rounded-xl p-3 min-w-48">
                            <div className="text-[10px] text-slate-500 font-bold">受講生氏名</div>
                            <div className="text-base font-black text-slate-900 mt-0.5">
                              {s.studentName} 殿
                            </div>
                            {s.studentId && (
                              <div className="text-xs text-slate-600 font-mono mt-0.5">
                                学籍番号: {s.studentId} {s.grade ? `(${s.grade}年)` : ''}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Summary Score Bar */}
                        <div className="grid grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                          <div>
                            <span className="text-slate-500 font-bold block">通算正答率</span>
                            <span className="text-2xl font-black text-slate-900 font-mono">{s.totalScorePercent}%</span>
                            <span className="text-[10px] text-slate-500 block">({s.totalCorrectCount}/{s.totalQuestionsAnswered}問 正解)</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-bold block">受験テスト数</span>
                            <span className="text-2xl font-black text-indigo-700 font-mono">{s.testsTakenCount} 回</span>
                            <span className="text-[10px] text-slate-500 block">合格 {s.testsPassedCount}回 ({s.passRatePercent}%)</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-bold block">クラス通算平均比</span>
                            <span className={`text-2xl font-black font-mono ${s.totalScorePercent >= classCrossTestStats.avgPercent ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {s.totalScorePercent >= classCrossTestStats.avgPercent ? `+${(s.totalScorePercent - classCrossTestStats.avgPercent).toFixed(1)}%` : `${(s.totalScorePercent - classCrossTestStats.avgPercent).toFixed(1)}%`}
                            </span>
                            <span className="text-[10px] text-slate-500 block">クラス平均: {classCrossTestStats.avgPercent}%</span>
                          </div>
                          <div>
                            <span className="text-rose-700 font-bold block">特定された通算最優先弱点</span>
                            <span className="text-base font-black text-rose-800 truncate block mt-1" title={s.primaryWeak?.name}>
                              {s.primaryWeak?.name || '弱点なし'}
                            </span>
                            {s.primaryWeak && (
                              <span className="text-[10px] text-rose-600 block">正答率: {s.primaryWeak.accuracyPercent}% ({s.primaryWeak.incorrect}問失点)</span>
                            )}
                          </div>
                        </div>

                        {/* Category Breakdown for Print */}
                        <div className="space-y-2">
                          <h3 className="text-xs font-bold text-slate-900 border-l-4 border-slate-900 pl-2">
                            全試験横断 分野別正答状況＆弱点度診断
                          </h3>
                          <table className="w-full text-xs text-left border border-slate-200 rounded-lg overflow-hidden">
                            <thead className="bg-slate-100 text-slate-700 font-bold">
                              <tr>
                                <th className="p-2 border-r">分野名（大項目）</th>
                                <th className="p-2 border-r text-center">出題数</th>
                                <th className="p-2 border-r text-center">正解 / 誤答</th>
                                <th className="p-2 border-r">本人正答率</th>
                                <th className="p-2 border-r text-center">クラス平均</th>
                                <th className="p-2 text-center">診断優先度</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {s.categorySummary.map((cat) => (
                                <tr key={cat.name} className="border-b border-slate-100">
                                  <td className="p-2 font-bold text-slate-900 border-r">{cat.name}</td>
                                  <td className="p-2 text-center border-r font-mono">{cat.total}問</td>
                                  <td className="p-2 text-center border-r font-mono">
                                    <span className="text-emerald-700 font-bold">{cat.correct}</span> / <span className="text-rose-700 font-bold">{cat.incorrect}</span>
                                  </td>
                                  <td className="p-2 border-r font-mono font-bold">{cat.accuracyPercent}%</td>
                                  <td className="p-2 text-center border-r font-mono text-slate-600">{cat.classAvg}%</td>
                                  <td className="p-2 text-center">
                                    {cat.priority === 'critical' ? (
                                      <span className="font-bold text-rose-700">【要重点補強】</span>
                                    ) : cat.priority === 'warning' ? (
                                      <span className="font-bold text-amber-700">要復習</span>
                                    ) : (
                                      <span className="text-emerald-700 font-medium">良好</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Guidance Prescription / Student Feedback */}
                        <div className="space-y-2 border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                          <h3 className="text-xs font-bold text-slate-900 border-l-4 border-slate-900 pl-2">
                            {printMode === 'guidance' ? '総合個別指導処方箋（全試験の傾向分析に基づく指導方針）' : '学習アドバイス・今後の対策'}
                          </h3>
                          <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                            {printMode === 'guidance' ? s.tutoringPlan : s.studentFeedbackText}
                          </p>
                        </div>

                        {/* Teacher Notes / Interview Memo */}
                        <div className="space-y-2 border border-slate-200 rounded-xl p-4">
                          <h3 className="text-xs font-bold text-slate-900 border-l-4 border-slate-900 pl-2">
                            教員面談記録・特記事項（個別宿題・次回までの課題）
                          </h3>
                          <div className="text-xs text-slate-800 min-h-16 whitespace-pre-wrap">
                            {teacherNotes[s.studentKey] || '（特記事項なし）'}
                          </div>
                        </div>

                        {/* Print Footer */}
                        <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between">
                          <span>作業療法士 国家試験対策 オンライン演習システム</span>
                          <span>担当教員 認印: __________________</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer info (Hidden when printing) */}
        <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0 print:hidden">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            全小テストの結果を自動合算し、継続的な学習履歴から真の苦手分野を特定しています。
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
