import React, { useState, useMemo, useEffect } from 'react';
import { Question, DeliveredTest, StudentRosterItem } from '../types';
import { parseSpreadsheetText, exportToCSV } from '../utils/csvParser';
import { parseCategory, isPickTwoQuestion, formatAnswerDisplay } from '../utils/categoryHelper';
import { ShareTestModal } from './ShareTestModal';
import { TestAnalyticsModal } from './TestAnalyticsModal';
import { TeacherAuthModal } from './TeacherAuthModal';
import { StudentRosterManager } from './StudentRosterManager';
import { GoogleDocsExportModal } from './GoogleDocsExportModal';
import { WordExportModal } from './WordExportModal';
import { fetchStudentRoster, subscribeStudentRoster } from '../services/studentRosterService';
import { subscribeAllSubmissions } from '../services/testSyncService';
import { 
  Send, 
  PlusCircle, 
  Database, 
  FileSpreadsheet, 
  Trash2, 
  CheckSquare, 
  Square, 
  Search, 
  CheckCircle2, 
  Download, 
  Upload, 
  RefreshCw,
  Eye,
  Sliders,
  Sparkles,
  Layers,
  RotateCcw,
  QrCode,
  Share2,
  Image as ImageIcon,
  UploadCloud,
  AlertCircle,
  HelpCircle,
  BarChart3,
  KeyRound,
  Lock,
  X,
  GraduationCap,
  Users,
  UserCheck,
  FileText,
  Printer,
  FileDown
} from 'lucide-react';
import { normalizeImageUrl, convertFileToOptimizedDataUrl, isGoogleDriveUrl } from '../utils/imageHelper';
import { QuestionImage } from './QuestionImage';

interface TeacherViewProps {
  questions: Question[];
  deliveredTests: DeliveredTest[];
  onAddQuestion: (q: Question) => void;
  onImportQuestions: (qs: Question[], replace: boolean) => void;
  onDeliverTest: (test: DeliveredTest) => void;
  onDeleteDeliveredTest: (testId: string) => void;
  onClearAllQuestions: () => void;
  onSyncQuestionsToCloud?: () => Promise<{ success: boolean; count: number }>;
  onSwitchToStudentMode: () => void;
}

export const TeacherView: React.FC<TeacherViewProps> = ({
  questions,
  deliveredTests,
  onAddQuestion,
  onImportQuestions,
  onDeliverTest,
  onDeleteDeliveredTest,
  onClearAllQuestions,
  onSyncQuestionsToCloud,
  onSwitchToStudentMode
}) => {
  const [activeTab, setActiveTab] = useState<'create-deliver' | 'manage-tests' | 'spreadsheet-sync' | 'student-roster'>('create-deliver');

  // Delivery form state
  const [testTitle, setTestTitle] = useState('作業療法士 国家試験対策 今日の小テスト');
  const [testInstructions, setTestInstructions] = useState('講義の重要ポイント復習です。制限時間内に全問解答してください。');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [deliverySuccessMessage, setDeliverySuccessMessage] = useState<string | null>(null);
  const [deliveryErrorMessage, setDeliveryErrorMessage] = useState<string | null>(null);
  const [sharingTest, setSharingTest] = useState<{ test: DeliveredTest; questions: Question[] } | null>(null);
  const [analyticsTest, setAnalyticsTest] = useState<{ test: DeliveredTest; questions: Question[] } | null>(null);
  const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({});
  const [showPasscodeSettingsModal, setShowPasscodeSettingsModal] = useState(false);
  const [googleDocsExportData, setGoogleDocsExportData] = useState<{ title: string; questions: Question[] } | null>(null);
  const [wordExportData, setWordExportData] = useState<{ title: string; questions: Question[] } | null>(null);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [cloudSyncFeedback, setCloudSyncFeedback] = useState<{ isError: boolean; message: string } | null>(null);

  // Delivery targeting state (Who can take this test)
  const [targetType, setTargetType] = useState<'all' | 'grade' | 'individual'>('all');
  const [targetGrades, setTargetGrades] = useState<number[]>([3]); // Default 3年生
  const [targetStudentIds, setTargetStudentIds] = useState<string[]>([]);
  const [rosterStudents, setRosterStudents] = useState<StudentRosterItem[]>([]);
  const [deliveredTestsGradeFilter, setDeliveredTestsGradeFilter] = useState<number | 'all'>('all');

  // Real-time subscription to student roster for targeting picker and count badge
  useEffect(() => {
    const unsubscribe = subscribeStudentRoster((list) => {
      setRosterStudents(list);
    });
    return () => unsubscribe();
  }, []);

  const handleManualCloudSync = async () => {
    if (!onSyncQuestionsToCloud) return;
    setIsSyncingCloud(true);
    setCloudSyncFeedback(null);
    try {
      const res = await onSyncQuestionsToCloud();
      if (res.success) {
        setCloudSyncFeedback({
          isError: false,
          message: `☁️ 全 ${res.count} 問の過去問データをサーバー＆クラウドへ同期完了しました！\n他の端末や異なるアカウント、学生モードでも即座に問題が登録された状態で開きます。`
        });
      } else {
        setCloudSyncFeedback({
          isError: true,
          message: 'クラウド同期に失敗しました。ネットワーク接続を確認してください。'
        });
      }
    } catch (err: any) {
      setCloudSyncFeedback({
        isError: true,
        message: `同期エラー: ${err.message || '不明なエラー'}`
      });
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Real-time subscribe to student submissions across all tests to show count badges
  useEffect(() => {
    const unsubscribe = subscribeAllSubmissions((subs) => {
      const counts: Record<string, number> = {};
      subs.forEach(s => {
        counts[s.testId] = (counts[s.testId] || 0) + 1;
      });
      setSubmissionCounts(counts);
    });
    return () => unsubscribe();
  }, []);

  // Quick lookup map for questions
  const questionMap = useMemo(() => new Map(questions.map(q => [q.id, q])), [questions]);

  // Filters - exactly matching StudentView specifications
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedMajorCategory, setSelectedMajorCategory] = useState<string>('all');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [filterPickTwoOnly, setFilterPickTwoOnly] = useState<boolean>(false);
  const [filterHasImageOnly, setFilterHasImageOnly] = useState<boolean>(false);
  const [previewImageQuestion, setPreviewImageQuestion] = useState<Question | null>(null);
  const [showImageGuide, setShowImageGuide] = useState<boolean>(false);
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);

  // New question form state
  const [showNewQuestionModal, setShowNewQuestionModal] = useState(false);
  const [newId, setNewId] = useState(`61-AM-${String(questions.length + 1).padStart(3, '0')}`);
  const [newYear, setNewYear] = useState('2026');
  const [newMajorCategory, setNewMajorCategory] = useState('身体障害作業療法学');
  const [newSubCategory, setNewSubCategory] = useState('');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newChoices, setNewChoices] = useState<[string, string, string, string, string]>([
    '選択肢1',
    '選択肢2',
    '選択肢3',
    '選択肢4',
    '選択肢5'
  ]);
  const [newSelectedAnswers, setNewSelectedAnswers] = useState<number[]>([1]);
  const [newExplanation, setNewExplanation] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');

  // Spreadsheet paste / import state
  const [pastedSpreadsheetData, setPastedSpreadsheetData] = useState('');
  const [importReplaceMode, setImportReplaceMode] = useState(false);
  const [importStatus, setImportStatus] = useState<{ message: string; isError?: boolean } | null>(null);
  const [publicSheetUrl, setPublicSheetUrl] = useState('');
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);

  // Extract unique major categories (same as StudentView)
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

  // Filtered questions based on the exact same logic as StudentView
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

      if (!searchFilter.trim()) return true;

      const kw = searchFilter.toLowerCase();
      return (
        q.id.toLowerCase().includes(kw) ||
        q.question.toLowerCase().includes(kw) ||
        q.explanation.toLowerCase().includes(kw) ||
        (q.category && q.category.toLowerCase().includes(kw)) ||
        (sub && sub.toLowerCase().includes(kw)) ||
        q.choices.some(c => c.toLowerCase().includes(kw))
      );
    });
  }, [questions, selectedMajorCategory, selectedSubCategory, selectedYear, searchFilter, filterPickTwoOnly, filterHasImageOnly]);

  // Reset filter handler
  const handleResetFilters = () => {
    setSelectedMajorCategory('all');
    setSelectedSubCategory('all');
    setSelectedYear('all');
    setSearchFilter('');
    setFilterPickTwoOnly(false);
    setFilterHasImageOnly(false);
  };

  // Toggle selection for a single question
  const handleToggleSelectQuestion = (id: string) => {
    setSelectedQuestionIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Random select 10, 20, 30, 40, 50 questions, or ALL (-1) matching current filter
  const handleQuickSelectCount = (count: number) => {
    const pool = [...filteredQuestions];
    if (pool.length === 0) {
      alert('現在フィルターされている問題がありません。検索条件を変更してください。');
      return;
    }

    if (count === -1) {
      // Select all matching
      setSelectedQuestionIds(pool.map(q => q.id));
      return;
    }

    // Shuffle and pick desired count
    pool.sort(() => Math.random() - 0.5);
    const chosen = pool.slice(0, count).map(q => q.id);
    setSelectedQuestionIds(chosen);
  };

  // Select/Unselect all visible in current filter
  const handleSelectAllVisible = () => {
    const visibleIds = filteredQuestions.map(q => q.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedQuestionIds.includes(id));
    if (allSelected) {
      setSelectedQuestionIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedQuestionIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  // Deliver test handler
  const handleDeliver = (e: React.FormEvent) => {
    e.preventDefault();
    setDeliveryErrorMessage(null);

    if (selectedQuestionIds.length === 0) {
      setDeliveryErrorMessage('小テストに含める問題を最低1問以上（推奨: 10〜50問）選択してください。');
      return;
    }

    if (targetType === 'grade' && targetGrades.length === 0) {
      setDeliveryErrorMessage('配信対象の学年を少なくとも1つ選択してください。');
      return;
    }
    if (targetType === 'individual' && targetStudentIds.length === 0) {
      setDeliveryErrorMessage('配信対象の学生（学籍番号）を少なくとも1名選択してください。');
      return;
    }

    const categoryTitle = selectedMajorCategory === 'all' 
      ? undefined 
      : `${selectedMajorCategory}${selectedSubCategory !== 'all' ? `（${selectedSubCategory}）` : ''}`;

    const testQuestions = selectedQuestionIds
      .map(id => questionMap.get(id))
      .filter((q): q is Question => q !== undefined);

    const newTest: DeliveredTest = {
      id: 'test-' + Date.now(),
      title: testTitle.trim() || '今日の小テスト',
      category: categoryTitle,
      createdAt: new Date().toISOString(),
      questionIds: selectedQuestionIds,
      totalQuestions: selectedQuestionIds.length,
      instructions: testInstructions.trim(),
      questions: testQuestions,
      targetType,
      targetGrades: targetType === 'grade' ? targetGrades : undefined,
      targetStudentIds: targetType === 'individual' ? targetStudentIds : undefined
    };

    onDeliverTest(newTest);
    // Automatically open share modal with URL & QR code for the newly delivered test
    setSharingTest({ test: newTest, questions: testQuestions });

    const targetDesc = targetType === 'grade' 
      ? `【${targetGrades.map(g => `${g}年`).join('・')}対象】` 
      : targetType === 'individual' 
      ? `【指定学生 ${targetStudentIds.length}名対象】` 
      : '【全学年対象】';

    setDeliverySuccessMessage(`${targetDesc} 小テスト「${newTest.title}」(${newTest.totalQuestions}問) を配信しました！学生用の受講URLとQRコードを発行しました。`);
    
    // Auto clear notification after 10s
    setTimeout(() => {
      setDeliverySuccessMessage(null);
    }, 10000);
  };

  // Toggle answer in new question modal
  const handleToggleAnswerChoice = (choiceNum: number) => {
    setNewSelectedAnswers(prev => {
      if (prev.includes(choiceNum)) {
        if (prev.length === 1) return prev; // At least one answer
        return prev.filter(c => c !== choiceNum);
      } else {
        return [...prev, choiceNum].sort();
      }
    });
  };

  // Add new single question
  const handleSaveNewQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim()) {
      alert('問題文を入力してください。');
      return;
    }
    if (newSelectedAnswers.length === 0) {
      alert('正答を少なくとも1つ選択してください。');
      return;
    }

    const fullCat = newSubCategory.trim() 
      ? `${newMajorCategory.trim()}（${newSubCategory.trim()}）`
      : newMajorCategory.trim();

    const createdQ: Question = {
      id: newId.trim() || `61-AM-${String(questions.length + 1).padStart(3, '0')}`,
      year: newYear.trim() || '2026',
      category: fullCat,
      majorCategory: newMajorCategory.trim(),
      subCategory: newSubCategory.trim() || undefined,
      question: newQuestionText.trim(),
      choices: [
        newChoices[0].trim() || '選択肢1',
        newChoices[1].trim() || '選択肢2',
        newChoices[2].trim() || '選択肢3',
        newChoices[3].trim() || '選択肢4',
        newChoices[4].trim() || '選択肢5'
      ],
      answer: newSelectedAnswers.length === 1 ? newSelectedAnswers[0] : newSelectedAnswers,
      explanation: newExplanation.trim(),
      imageUrl: newImageUrl.trim()
    };

    onAddQuestion(createdQ);
    // Auto-select for delivery
    setSelectedQuestionIds(prev => [...prev, createdQ.id]);
    setShowNewQuestionModal(false);

    // Reset fields for next
    setNewId(`61-AM-${String(questions.length + 2).padStart(3, '0')}`);
    setNewQuestionText('');
    setNewExplanation('');
    setNewImageUrl('');
    setNewSubCategory('');
    setNewSelectedAnswers([1]);
    alert(`問題「${createdQ.id}」をデータベースに追加し、小テストの配信リストに選択しました。`);
  };

  // Import pasted text
  const handleImportSpreadsheet = () => {
    if (!pastedSpreadsheetData.trim()) {
      setImportStatus({ message: 'スプレッドシートのデータを貼り付けてください。', isError: true });
      return;
    }

    const { questions: parsed, errors } = parseSpreadsheetText(pastedSpreadsheetData);
    if (parsed.length === 0) {
      setImportStatus({
        message: `インポートできませんでした。\n${errors.join('\n')}`,
        isError: true
      });
      return;
    }

    onImportQuestions(parsed, importReplaceMode);
    setImportStatus({
      message: `成功！ ${parsed.length} 件の問題をスプレッドシートから読み込みました。${errors.length > 0 ? ` (警告: ${errors.length}件)` : ''}`,
      isError: false
    });
    setPastedSpreadsheetData('');
  };

  // Upload CSV file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const { questions: parsed, errors } = parseSpreadsheetText(text);
      if (parsed.length === 0) {
        setImportStatus({
          message: `CSVファイルの読み込みに失敗しました: ${errors.join(', ')}`,
          isError: true
        });
        return;
      }
      onImportQuestions(parsed, importReplaceMode);
      setImportStatus({
        message: `CSVから ${parsed.length} 件の問題を正常に取り込みました！`,
        isError: false
      });
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Fetch Public Google Sheet CSV URL
  const handleFetchUrl = async () => {
    if (!publicSheetUrl.trim()) return;
    setIsLoadingUrl(true);
    setImportStatus(null);
    try {
      let url = publicSheetUrl.trim();
      if (url.includes('docs.google.com/spreadsheets/d/')) {
        if (!url.includes('export?format=csv') && !url.includes('pub?output=csv')) {
          url = url.replace(/\/edit.*$/, '/export?format=csv');
        }
      }

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: スプレッドシートを取得できませんでした。公開設定を確認してください。`);
      }
      const text = await res.text();
      const { questions: parsed, errors } = parseSpreadsheetText(text);
      if (parsed.length === 0) {
        setImportStatus({
          message: `データが見つかりませんでした: ${errors.join(', ')}`,
          isError: true
        });
      } else {
        onImportQuestions(parsed, importReplaceMode);
        setImportStatus({
          message: `Googleスプレッドシートから ${parsed.length} 件の問題を取得・反映しました！`,
          isError: false
        });
      }
    } catch (err: any) {
      setImportStatus({
        message: `取得エラー: ${err.message || 'CORS等の理由で直接取得できない場合は、シートの内容をコピーして下の枠に貼り付けてください。'}`,
        isError: true
      });
    } finally {
      setIsLoadingUrl(false);
    }
  };

  // Export current DB to CSV
  const handleExportCSV = () => {
    const csvStr = exportToCSV(questions);
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OT_NationalExam_Questions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Standard major categories preset
  const presetMajorCategories = [
    '解剖学',
    '運動学',
    '生理学',
    '身体障害作業療法学',
    '精神障害作業療法学',
    '発達障害作業療法学',
    '老年期障害作業療法学',
    '高次脳機能障害学',
    '作業療法概論',
    '評価学',
    '精神医学',
    '臨床心理学'
  ];

  // Count buttons configuration: 10, 20, 30, 40, 50, all (-1)
  const countOptions = [10, 20, 30, 40, 50, -1];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Teacher Mode Header */}
      <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 rounded-2xl p-6 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-indigo-200 text-xs font-semibold tracking-wide uppercase flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5" />
            教員専用管理ポータル
          </span>
          <h1 className="text-xl sm:text-2xl font-bold mt-1">小テスト作問・配信 ＆ 問題DB管理</h1>
          <p className="text-xs sm:text-sm text-indigo-100 mt-1 max-w-xl">
            分野（大項目・中項目）や「2つ選べ」で問題を柔軟に絞り込み、10〜50問・全問をワンクリックで選択して学生へ「今日のテスト」を配信できます。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowPasscodeSettingsModal(true)}
            className="px-3.5 py-2.5 bg-indigo-800/80 hover:bg-indigo-800 text-indigo-100 hover:text-white border border-indigo-500/40 rounded-xl text-xs font-semibold transition-colors flex items-center shadow-xs"
            title="教員モード切替時の6桁パスコードの確認・変更"
          >
            <KeyRound className="w-4 h-4 mr-1.5 text-indigo-300" />
            暗証番号設定
          </button>
          <button
            onClick={onSwitchToStudentMode}
            className="px-4 py-2.5 bg-white text-indigo-900 rounded-xl text-xs sm:text-sm font-bold shadow-sm hover:bg-indigo-50 transition-colors flex items-center"
          >
            <Eye className="w-4 h-4 mr-1.5 text-indigo-700" />
            学生画面へ戻る
          </button>
        </div>
      </div>

      {/* Delivery Toast Notifications */}
      {deliveryErrorMessage && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center space-x-2 text-rose-900 text-sm font-semibold">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{deliveryErrorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setDeliveryErrorMessage(null)}
            className="p-1 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {deliverySuccessMessage && (
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center space-x-2 text-emerald-900 text-sm font-semibold">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{deliverySuccessMessage}</span>
          </div>
          <button
            onClick={onSwitchToStudentMode}
            className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors shrink-0 ml-3"
          >
            学生モードで解答する →
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 space-x-2 sm:space-x-4">
        <button
          onClick={() => setActiveTab('create-deliver')}
          className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'create-deliver'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Send className="w-4 h-4" />
          <span>小テスト作問・配信</span>
          {selectedQuestionIds.length > 0 && (
            <span className="bg-indigo-100 text-indigo-800 text-[11px] font-bold px-1.5 py-0.5 rounded-full">
              選択中 {selectedQuestionIds.length}問
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('manage-tests')}
          className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'manage-tests'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>配信済みテスト一覧</span>
          <span className="bg-slate-100 text-slate-600 text-[11px] font-bold px-1.5 py-0.5 rounded-full">
            {deliveredTests.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('spreadsheet-sync')}
          className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'spreadsheet-sync'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Googleスプレッドシート連携・DB管理</span>
        </button>

        <button
          onClick={() => setActiveTab('student-roster')}
          className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'student-roster'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span>学生名簿・学年管理</span>
          <span className="bg-indigo-100 text-indigo-800 text-[11px] font-bold px-1.5 py-0.5 rounded-full">
            {rosterStudents.length}名
          </span>
        </button>
      </div>

      {/* TAB 1: 作問・配信 */}
      {activeTab === 'create-deliver' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Delivery Parameters & Submit (1 col) */}
          <div className="lg:col-span-1 space-y-5">
            <form onSubmit={handleDeliver} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <h2 className="text-sm font-bold text-slate-900 flex items-center">
                <Send className="w-4 h-4 text-indigo-600 mr-1.5" />
                小テスト配信の設定
              </h2>

              {/* Test Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  テストタイトル <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                  placeholder="例: 第1回 身体障害作業療法学 重点確認テスト"
                  required
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Teacher instructions */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  学生へのメッセージ・連絡事項
                </label>
                <textarea
                  rows={2}
                  value={testInstructions}
                  onChange={(e) => setTestInstructions(e.target.value)}
                  placeholder="学生の画面に表示されるコメントです"
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Delivery Targeting Section (Grade / Individual) */}
              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-indigo-600" />
                    <span>配信対象の設定</span>
                  </label>
                  <button 
                    type="button"
                    onClick={() => setActiveTab('student-roster')}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold"
                  >
                    名簿管理を開く →
                  </button>
                </div>

                {/* Target Type Selector */}
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl text-[11px] font-bold text-center">
                  <button
                    type="button"
                    onClick={() => setTargetType('all')}
                    className={`py-1.5 rounded-lg transition-all ${
                      targetType === 'all'
                        ? 'bg-white text-indigo-700 shadow-2xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    全員 (全学年)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetType('grade')}
                    className={`py-1.5 rounded-lg transition-all ${
                      targetType === 'grade'
                        ? 'bg-white text-indigo-700 shadow-2xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    学年を指定
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetType('individual')}
                    className={`py-1.5 rounded-lg transition-all ${
                      targetType === 'individual'
                        ? 'bg-white text-indigo-700 shadow-2xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    個別学生を指定
                  </button>
                </div>

                {/* Target Type: Grade selection */}
                {targetType === 'grade' && (
                  <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl space-y-2 animate-fade-in">
                    <span className="text-[11px] font-bold text-indigo-900 block">対象学年（複数選択可）:</span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[1, 2, 3, 4].map(g => {
                        const isChecked = targetGrades.includes(g);
                        const count = rosterStudents.filter(s => s.grade === g).length;
                        return (
                          <button
                            type="button"
                            key={g}
                            onClick={() => {
                              setTargetGrades(prev => 
                                prev.includes(g) 
                                  ? (prev.length === 1 ? prev : prev.filter(x => x !== g))
                                  : [...prev, g].sort()
                              );
                            }}
                            className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all flex flex-col items-center justify-center ${
                              isChecked
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <span>{g}年生</span>
                            <span className={`text-[10px] ${isChecked ? 'text-indigo-100' : 'text-slate-400'}`}>
                              ({count}名)
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Target Type: Individual student selection */}
                {targetType === 'individual' && (
                  <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl space-y-2 animate-fade-in">
                    <div className="flex items-center justify-between text-[11px] font-bold text-indigo-900">
                      <span>対象学生（学籍番号）:</span>
                      <span className="bg-white px-2 py-0.5 rounded border border-indigo-200 text-indigo-700">
                        {targetStudentIds.length}名 選択中
                      </span>
                    </div>

                    {rosterStudents.length === 0 ? (
                      <div className="text-[11px] text-slate-500 bg-white p-2.5 rounded-lg border border-slate-200">
                        名簿に学生が登録されていません。「学生名簿・学年管理」タブで学籍番号を登録してください。
                      </div>
                    ) : (
                      <div className="max-h-40 overflow-y-auto space-y-1 bg-white p-2 rounded-lg border border-slate-200 text-xs divide-y divide-slate-100">
                        {rosterStudents.map(student => {
                          const isChecked = targetStudentIds.includes(student.studentId);
                          return (
                            <label
                              key={student.studentId}
                              className="flex items-center space-x-2 py-1.5 px-1 hover:bg-slate-50 rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setTargetStudentIds(prev => 
                                    isChecked ? prev.filter(id => id !== student.studentId) : [...prev, student.studentId]
                                  );
                                }}
                                className="rounded text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="font-mono font-bold text-slate-900">{student.studentId}</span>
                              <span className="text-slate-500 text-[11px]">({student.grade}年 {student.name || ''})</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Question count status indicator */}
              <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-indigo-900">配信問題数:</span>
                  <span className="font-mono text-base font-extrabold text-indigo-700">
                    {selectedQuestionIds.length} 問
                  </span>
                </div>
                <div className="text-[11px] text-indigo-800">
                  {selectedQuestionIds.length % 10 === 0 && selectedQuestionIds.length > 0 ? (
                    <span className="text-emerald-700 font-semibold flex items-center">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      10問単位の推奨フォーマットです（{selectedQuestionIds.length}問）
                    </span>
                  ) : (
                    <span className="text-slate-500">
                      ※下のボタンから「10〜50問」「全問」をワンクリック選択できます。
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Select Buttons: 10, 20, 30, 40, 50, all (-1) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    問題数ランダム選択（10〜50問・全問）
                  </label>
                  <span className="text-[11px] text-slate-400">
                    対象: {filteredQuestions.length}問
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {countOptions.map(cnt => {
                    const label = cnt === -1 ? '全問' : `${cnt}問`;
                    const isFullMatch = cnt === -1 
                      ? (selectedQuestionIds.length === filteredQuestions.length && filteredQuestions.length > 0)
                      : (selectedQuestionIds.length === cnt);

                    return (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => handleQuickSelectCount(cnt)}
                        className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                          isFullMatch
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-indigo-50/70 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  ※右側で絞り込んだ問題プールから自動選択します。
                </p>
              </div>

              {/* Deliver Submit Button */}
              <button
                type="submit"
                id="deliver-test-btn"
                disabled={selectedQuestionIds.length === 0}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-2"
              >
                <Send className="w-4 h-4" />
                <span>小テストを配信する ({selectedQuestionIds.length}問)</span>
              </button>

              {/* Print / Export to Google Docs button */}
              <button
                type="button"
                id="export-gdocs-btn"
                disabled={selectedQuestionIds.length === 0}
                onClick={() => {
                  const selectedQs = selectedQuestionIds
                    .map(id => questionMap.get(id))
                    .filter((q): q is Question => q !== undefined);
                  setGoogleDocsExportData({
                    title: testTitle.trim() || '作業療法士 国家試験 演習小テスト',
                    questions: selectedQs
                  });
                }}
                className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed text-blue-700 font-bold border border-blue-200 rounded-xl text-xs transition-colors flex items-center justify-center space-x-1.5 shadow-2xs"
                title="選択中の問題をGoogleドキュメントへ出力（印刷・配布用プリント作成）"
              >
                <Printer className="w-4 h-4 text-blue-600" />
                <span>Googleドキュメントへ印刷出力 ({selectedQuestionIds.length}問)</span>
              </button>

              {/* Export to Word (.docx) button */}
              <button
                type="button"
                id="export-word-btn"
                disabled={selectedQuestionIds.length === 0}
                onClick={() => {
                  const selectedQs = selectedQuestionIds
                    .map(id => questionMap.get(id))
                    .filter((q): q is Question => q !== undefined);
                  setWordExportData({
                    title: testTitle.trim() || '作業療法士 国家試験 演習小テスト',
                    questions: selectedQs
                  });
                }}
                className="w-full py-2.5 bg-gradient-to-r from-blue-900 to-indigo-900 hover:from-blue-950 hover:to-indigo-950 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center space-x-1.5 shadow-xs"
                title="選択中の問題をWordファイル（.docx）へ出力して直接ダウンロード（Microsoftアカウント不要）"
              >
                <FileDown className="w-4 h-4 text-blue-200" />
                <span>Word（.docx）ファイル出力 ({selectedQuestionIds.length}問)</span>
              </button>

              {/* Action to create new single question */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewQuestionModal(true)}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors flex items-center justify-center space-x-1.5"
                >
                  <PlusCircle className="w-4 h-4 text-indigo-600" />
                  <span>オリジナルの新問題を作問する</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Question Picker Table / List (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Filter and selection actions header */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-800">過去問から問題を選択</span>
                  <span className="text-xs text-slate-500">
                    （全 {questions.length} 問中 <strong className="text-indigo-600">{filteredQuestions.length}</strong> 問表示 / 選択中 <strong className="text-emerald-600">{selectedQuestionIds.length}</strong> 問）
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  {selectedQuestionIds.length > 0 && (
                    <>
                      <button
                        type="button"
                        id="quick-export-word-btn"
                        onClick={() => {
                          const selectedQs = selectedQuestionIds
                            .map(id => questionMap.get(id))
                            .filter((q): q is Question => q !== undefined);
                          setWordExportData({
                            title: testTitle.trim() || '作業療法士 国家試験 選択問題集',
                            questions: selectedQs
                          });
                        }}
                        className="text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 rounded-lg px-2.5 py-1 transition-colors flex items-center gap-1 shadow-2xs"
                        title="選択中の問題をWord（.docx）ファイルへ出力"
                      >
                        <FileDown className="w-3.5 h-3.5 text-blue-200" />
                        <span>Word出力 (.docx)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const selectedQs = selectedQuestionIds
                            .map(id => questionMap.get(id))
                            .filter((q): q is Question => q !== undefined);
                          setGoogleDocsExportData({
                            title: testTitle.trim() || '作業療法士 国家試験 選択問題集',
                            questions: selectedQs
                          });
                        }}
                        className="text-xs font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-2.5 py-1 transition-colors flex items-center gap-1 shadow-2xs"
                        title="選択中の問題をGoogleドキュメントへ印刷出力"
                      >
                        <Printer className="w-3.5 h-3.5 text-blue-600" />
                        <span>印刷用Doc出力 ({selectedQuestionIds.length})</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleSelectAllVisible}
                    className="text-xs font-medium text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-50 transition-colors"
                  >
                    表示中の全問を選択/解除
                  </button>
                  {selectedQuestionIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedQuestionIds([])}
                      className="text-xs font-medium text-rose-600 hover:text-rose-800 underline"
                    >
                      全選択解除
                    </button>
                  )}
                </div>
              </div>

              {/* Exact Filters matching StudentView */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {/* Keyword search */}
                <div className="relative">
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="キーワード絞り込み..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>

                {/* Major Category */}
                <select
                  value={selectedMajorCategory}
                  onChange={(e) => {
                    setSelectedMajorCategory(e.target.value);
                    setSelectedSubCategory('all');
                  }}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                >
                  <option value="all">すべての分野（大項目）</option>
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

                {/* Sub Category */}
                <select
                  value={selectedSubCategory}
                  onChange={(e) => setSelectedSubCategory(e.target.value)}
                  disabled={availableSubCategories.length === 0}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium disabled:opacity-50"
                >
                  <option value="all">すべての中項目</option>
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

                {/* Year */}
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="all">すべての年度</option>
                  {years.map(y => (
                    <option key={y} value={y}>
                      第{y}回
                    </option>
                  ))}
                </select>
              </div>

              {/* Bottom bar of filter: "Pick 2" & "Image" checkbox & reset */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
                <div className="flex items-center gap-4">
                  <label className="flex items-center space-x-1.5 cursor-pointer text-slate-700">
                    <input
                      type="checkbox"
                      checked={filterPickTwoOnly}
                      onChange={(e) => setFilterPickTwoOnly(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                    />
                    <span className="flex items-center gap-1 font-semibold">
                      <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.2 rounded">
                        2つ選べ
                      </span>
                      「2つ選べ」
                    </span>
                  </label>

                  <label className="flex items-center space-x-1.5 cursor-pointer text-slate-700">
                    <input
                      type="checkbox"
                      checked={filterHasImageOnly}
                      onChange={(e) => setFilterHasImageOnly(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                    />
                    <span className="flex items-center gap-1 font-semibold">
                      <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5">
                        <ImageIcon className="w-2.5 h-2.5" />
                        画像
                      </span>
                      「図・画像あり」
                    </span>
                  </label>
                </div>

                {(selectedMajorCategory !== 'all' || selectedSubCategory !== 'all' || selectedYear !== 'all' || searchFilter || filterPickTwoOnly || filterHasImageOnly) && (
                  <button
                    onClick={handleResetFilters}
                    className="text-slate-500 hover:text-indigo-600 flex items-center gap-1 font-medium"
                  >
                    <RotateCcw className="w-3 h-3" />
                    検索条件をリセット
                  </button>
                )}
              </div>
            </div>

            {/* List of questions to choose from */}
            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
              {filteredQuestions.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 space-y-2">
                  <p className="font-semibold text-sm">該当する問題が見つかりません</p>
                  <p className="text-xs">フィルター条件を変更してください。</p>
                  <button
                    onClick={handleResetFilters}
                    className="text-xs text-indigo-600 font-semibold underline mt-1"
                  >
                    フィルターをリセット
                  </button>
                </div>
              ) : (
                filteredQuestions.map(q => {
                  const isSelected = selectedQuestionIds.includes(q.id);
                  const p = parseCategory(q.category);
                  const major = q.majorCategory || p.major;
                  const sub = q.subCategory || p.sub;
                  const isPick2 = isPickTwoQuestion(q.question, q.answer);
                  const answerDisplay = formatAnswerDisplay(q.answer, q.question);

                  return (
                    <div
                      key={q.id}
                      onClick={() => handleToggleSelectQuestion(q.id)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start space-x-3 ${
                        isSelected
                          ? 'bg-indigo-50/60 border-indigo-400 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="mt-0.5 text-indigo-600 shrink-0">
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 fill-indigo-600 text-white" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-300" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center flex-wrap gap-1.5">
                          <span className="font-mono text-xs font-bold bg-slate-900 text-white px-2 py-0.5 rounded">
                            {q.id}
                          </span>
                          <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded">
                            {major}
                          </span>
                          {sub && (
                            <span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                              {sub}
                            </span>
                          )}
                          {isPick2 && (
                            <span className="text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded">
                              2つ選べ
                            </span>
                          )}
                          {q.imageUrl && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewImageQuestion(q);
                              }}
                              className="text-[10px] font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
                              title="問題図・画像をプレビュー"
                            >
                              <ImageIcon className="w-3 h-3 text-indigo-600" />
                              図・画像あり
                            </button>
                          )}
                          <span className="text-xs text-slate-500">
                            第{q.year}回 国試
                          </span>
                          <span className="text-[11px] text-emerald-700 font-semibold ml-auto">
                            正答: {answerDisplay}
                          </span>
                        </div>

                        <p className="text-xs sm:text-sm font-medium text-slate-800 line-clamp-2 leading-relaxed">
                          {q.question}
                        </p>

                        <div className="text-[11px] text-slate-500 truncate">
                          1: {q.choices[0]} / 2: {q.choices[1]} / 3: {q.choices[2]} / 4: {q.choices[3]} / 5: {q.choices[4]}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: 配信済みテスト一覧 */}
      {activeTab === 'manage-tests' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">配信中の小テスト</h2>
              <p className="text-xs text-slate-500">現在学生モードの「今日のテスト」に配信されているテスト一覧です。学年ごとに絞り込みが可能です。</p>
            </div>

            {/* Grade Filter Pill Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold shrink-0">
              <span className="text-[11px] text-slate-500 px-2 flex items-center gap-1">
                <GraduationCap className="w-3.5 h-3.5" />
                絞り込み:
              </span>
              <button
                type="button"
                onClick={() => setDeliveredTestsGradeFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  deliveredTestsGradeFilter === 'all'
                    ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                すべて
              </button>
              {[1, 2, 3, 4].map(grade => (
                <button
                  type="button"
                  key={grade}
                  onClick={() => setDeliveredTestsGradeFilter(grade)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    deliveredTestsGradeFilter === grade
                      ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {grade}年生
                </button>
              ))}
            </div>
          </div>

          {deliveredTests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 space-y-2">
              <Database className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="font-bold text-sm text-slate-700">配信されたテストはありません</p>
              <p className="text-xs">「小テスト作問・配信」タブからテストを作成して配信してください。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {deliveredTests
                .filter(test => {
                  if (deliveredTestsGradeFilter === 'all') return true;
                  if (!test.targetType || test.targetType === 'all') return true;
                  if (test.targetType === 'grade' && test.targetGrades) {
                    return test.targetGrades.includes(deliveredTestsGradeFilter);
                  }
                  return false;
                })
                .map(test => (
                <div
                  key={test.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        小テスト
                      </span>

                      {/* Delivery target badge */}
                      {test.targetType === 'grade' && test.targetGrades && (
                        <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1">
                          <GraduationCap className="w-3.5 h-3.5 text-amber-700" />
                          {test.targetGrades.map(g => `${g}年生`).join('・')} 対象
                        </span>
                      )}
                      {test.targetType === 'individual' && test.targetStudentIds && (
                        <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-300 flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-teal-700" />
                          個別指定 ({test.targetStudentIds.length}名)
                        </span>
                      )}
                      {(!test.targetType || test.targetType === 'all') && (
                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          全学年 対象
                        </span>
                      )}

                      <span className="text-xs text-slate-400">
                        配信日時: {new Date(test.createdAt).toLocaleString('ja-JP')}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">{test.title}</h3>
                    
                    {test.instructions && (
                      <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 inline-block">
                        💬 {test.instructions}
                      </p>
                    )}

                    <div className="text-xs text-slate-500 flex items-center space-x-3">
                      <span>問題数: <strong className="text-slate-800">{test.questionIds.length} 問</strong></span>
                      {test.category && <span>分野: <strong>{test.category}</strong></span>}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        const qs = (test.questions && test.questions.length > 0)
                          ? test.questions
                          : test.questionIds
                              .map(id => questionMap.get(id))
                              .filter((q): q is Question => q !== undefined);
                        setAnalyticsTest({ test, questions: qs });
                      }}
                      className="px-3 py-1.5 text-xs text-teal-800 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg font-bold transition-colors flex items-center shadow-2xs"
                      title="学生の提出状況・リアルタイム成績一覧と設問別正答率を表示"
                    >
                      <BarChart3 className="w-3.5 h-3.5 mr-1 text-teal-600" />
                      提出状況・成績分析
                      {submissionCounts[test.id] !== undefined && (
                        <span className={`ml-1.5 px-1.5 py-0.2 text-[10px] rounded-full font-extrabold ${
                          submissionCounts[test.id] > 0
                            ? 'bg-teal-200 text-teal-900'
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          {submissionCounts[test.id]}名
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        const qs = (test.questions && test.questions.length > 0)
                          ? test.questions
                          : test.questionIds
                              .map(id => questionMap.get(id))
                              .filter((q): q is Question => q !== undefined);
                        setSharingTest({ test, questions: qs });
                      }}
                      className="px-3 py-1.5 text-xs text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg font-bold transition-colors flex items-center shadow-2xs"
                      title="学生配信用URLとQRコードを表示"
                    >
                      <QrCode className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                      共有URL・QRコード
                    </button>

                    <button
                      onClick={() => {
                        const qs = (test.questions && test.questions.length > 0)
                          ? test.questions
                          : test.questionIds
                              .map(id => questionMap.get(id))
                              .filter((q): q is Question => q !== undefined);
                        setWordExportData({
                          title: test.title,
                          questions: qs
                        });
                      }}
                      className="px-3 py-1.5 text-xs text-white bg-blue-900 hover:bg-blue-950 rounded-lg font-bold transition-colors flex items-center shadow-2xs"
                      title="この小テストをWordファイル（.docx）へ出力してダウンロード"
                    >
                      <FileDown className="w-3.5 h-3.5 mr-1 text-blue-200" />
                      Word出力 (.docx)
                    </button>

                    <button
                      onClick={() => {
                        const qs = (test.questions && test.questions.length > 0)
                          ? test.questions
                          : test.questionIds
                              .map(id => questionMap.get(id))
                              .filter((q): q is Question => q !== undefined);
                        setGoogleDocsExportData({
                          title: test.title,
                          questions: qs
                        });
                      }}
                      className="px-3 py-1.5 text-xs text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg font-bold transition-colors flex items-center shadow-2xs"
                      title="この小テストをGoogleドキュメントへ出力して用紙印刷"
                    >
                      <Printer className="w-3.5 h-3.5 mr-1 text-blue-600" />
                      印刷・Doc出力
                    </button>

                    <button
                      onClick={() => onDeleteDeliveredTest(test.id)}
                      className="px-3 py-1.5 text-xs text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg font-medium transition-colors flex items-center"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      配信停止・削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Googleスプレッドシート連携・DB管理 */}
      {activeTab === 'spreadsheet-sync' && (
        <div className="space-y-6">
          {/* Format Specification Banner */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Googleスプレッドシートの列構成仕様（A列〜L列）</h2>
                <p className="text-xs text-slate-600 mt-1">
                  category列は「大項目（中項目）」と記述することで、大項目と中項目に自動分類されます。また「2つ選べ」の問題は、answer列に「1, 3」のように指定可能です。
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2 border-r">A列</th>
                    <th className="p-2 border-r">B列</th>
                    <th className="p-2 border-r">C列</th>
                    <th className="p-2 border-r">D列</th>
                    <th className="p-2 border-r">E列〜I列</th>
                    <th className="p-2 border-r">J列</th>
                    <th className="p-2 border-r">K列</th>
                    <th className="p-2">L列</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-white">
                    <td className="p-2 font-mono font-semibold text-slate-900 border-r">id (例: 61-AM-001)</td>
                    <td className="p-2 border-r">year (例: 2026)</td>
                    <td className="p-2 border-r font-bold text-indigo-700">category (例: 身体障害作業療法学（脳卒中）)</td>
                    <td className="p-2 border-r">question (問題文 ※「2つ選べ」対応)</td>
                    <td className="p-2 border-r">choice1 〜 choice5 (選択肢)</td>
                    <td className="p-2 font-bold text-indigo-700 border-r">answer / anser (例: 1, 1,2, 1,2,3)</td>
                    <td className="p-2 border-r">explanation (解説文)</td>
                    <td className="p-2 text-slate-500">image url (画像URL/空欄可)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Explanation of flexible scoring rules */}
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 space-y-1.5 text-xs">
              <span className="font-bold text-indigo-900 block flex items-center gap-1">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                J列（answer / anser）の記述形式と国家試験の採点ルール対応
              </span>
              <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1 leading-relaxed">
                <li>
                  <strong className="text-indigo-950">通常の5択問題（1つ選択）:</strong> J列に <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-bold">1</code> のように1つの番号を指定します。
                </li>
                <li>
                  <strong className="text-indigo-950">1つ選ぶ問題で複数正答（2つ存在）:</strong> J列に <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-bold">1,2</code> のようにカンマ区切りで入力すると、<strong>2つのうちどちらか一方を選択していれば正解</strong>として採点されます。
                </li>
                <li>
                  <strong className="text-indigo-950">「2つ選べ」問題:</strong> 問題文に「2つ選べ」と記載し、J列に <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-bold">1,2</code> と指定します。学生は2つ選択して完全一致で正解となります。
                </li>
                <li>
                  <strong className="text-indigo-950">「2つ選べ」問題で解答が3つ（例: 1,2,3）:</strong> J列に <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-bold">1,2,3</code> と入力すると、<strong>3つのうちいずれか2つが合っていれば正解</strong>として自動判定されます。
                </li>
              </ul>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center shadow-xs"
              >
                <Download className="w-4 h-4 mr-1.5" />
                現在登録中の全問題をCSV出力 (テンプレートとして活用可)
              </button>

              {onSyncQuestionsToCloud && (
                <button
                  onClick={handleManualCloudSync}
                  disabled={isSyncingCloud || questions.length === 0}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors flex items-center shadow-xs"
                  title="登録中の過去問データをクラウドとサーバーへ即時同期し、全学生端末に反映させます"
                >
                  <RefreshCw className={`w-4 h-4 mr-1.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
                  {isSyncingCloud ? 'クラウド同期中...' : `クラウド・全端末へ同期 (${questions.length}問)`}
                </button>
              )}

              {questions.length > 0 && (
                <button
                  onClick={onClearAllQuestions}
                  className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition-colors flex items-center"
                  title="現在登録されている全問題をデータベースから消去します"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5 text-rose-600" />
                  登録中の全問題を全て消去する
                </button>
              )}
            </div>
          </div>

          {/* Cloud Sync Feedback */}
          {cloudSyncFeedback && (
            <div className={`p-4 rounded-xl border flex items-start space-x-3 text-xs ${
              cloudSyncFeedback.isError
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-indigo-50 border-indigo-200 text-indigo-900'
            }`}>
              <div className="font-medium whitespace-pre-wrap flex-1">{cloudSyncFeedback.message}</div>
              <button onClick={() => setCloudSyncFeedback(null)} className="font-bold underline text-[11px]">閉じる</button>
            </div>
          )}

          {/* Import Status Alert */}
          {importStatus && (
            <div className={`p-4 rounded-xl border flex items-start space-x-3 text-xs ${
              importStatus.isError 
                ? 'bg-rose-50 border-rose-200 text-rose-800' 
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}>
              <div className="font-medium whitespace-pre-wrap flex-1">{importStatus.message}</div>
              <button onClick={() => setImportStatus(null)} className="font-bold underline text-[11px]">閉じる</button>
            </div>
          )}

          {/* Import Options Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Direct Paste */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900 flex items-center">
                  <Upload className="w-4 h-4 mr-1.5 text-indigo-600" />
                  スプレッドシートのセルをコピー＆ペースト
                </h3>
                <p className="text-xs text-slate-500">
                  GoogleスプレッドシートのA列からL列のセル範囲を範囲選択してコピー（Ctrl+C / ⌘+C）し、そのまま下の枠に貼り付けてください。
                </p>
                <textarea
                  rows={6}
                  value={pastedSpreadsheetData}
                  onChange={(e) => setPastedSpreadsheetData(e.target.value)}
                  placeholder="スプレッドシートからコピーしたタブ区切りまたはカンマ区切りテキストをここにペースト..."
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="space-y-3 pt-2">
                <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importReplaceMode}
                    onChange={(e) => setImportReplaceMode(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>既存の全問題を破棄して入れ替える（オフの場合は既存に追加）</span>
                </label>

                <button
                  type="button"
                  onClick={handleImportSpreadsheet}
                  disabled={!pastedSpreadsheetData.trim()}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors shadow-xs"
                >
                  貼り付けたデータを取り込む
                </button>
              </div>
            </div>

            {/* CSV File Upload & Web Link */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
              {/* CSV Upload */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900 flex items-center">
                  <FileSpreadsheet className="w-4 h-4 mr-1.5 text-indigo-600" />
                  CSVファイルを直接アップロード
                </h3>
                <p className="text-xs text-slate-500">
                  エクスポートしたCSVファイルまたは保存したCSVファイルを選択してください。
                </p>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileUpload}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </div>

              {/* Public Sheet Link Fetch */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Googleスプレッドシート公開リンク（CSV形式）から取得
                </h3>
                <p className="text-xs text-slate-500">
                  スプレッドシートの「ファイル」→「共有」→「ウェブに公開」でCSV形式として公開したURLを入力します。
                </p>
                <div className="flex space-x-2">
                  <input
                    type="url"
                    value={publicSheetUrl}
                    onChange={(e) => setPublicSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/.../export?format=csv"
                    className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleFetchUrl}
                    disabled={isLoadingUrl || !publicSheetUrl.trim()}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors shrink-0"
                  >
                    {isLoadingUrl ? '取得中...' : '取得'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Troubleshooting & Guide for Images */}
          <div className="bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/50 rounded-2xl border border-indigo-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-indigo-950 flex items-center">
                <ImageIcon className="w-4 h-4 mr-2 text-indigo-600" />
                問題図・画像を確実に表示させるための設定と回避策ガイド
              </h3>
              <span className="text-[11px] font-semibold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                重要: 画像リンクのトラブル防止
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Method 1: Google Drive */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-900 flex items-center text-xs">
                  <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] mr-1.5 shrink-0">1</span>
                  Googleドライブの画像を載せる場合
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Googleドライブの画像をスプレッドシートやアプリに貼る場合、共有設定が<strong>「制限付き」</strong>になっていると生徒側の端末で読み込めません。
                </p>
                <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-[11px] text-amber-900 space-y-1">
                  <div className="font-semibold">【必須の手順】</div>
                  <div>① ドライブの画像を右クリック →「共有」</div>
                  <div>② 一般的なアクセスを<strong>「リンクを知っている全員」</strong>に変更</div>
                  <div>③ 役割を<strong>「閲覧者」</strong>に設定</div>
                </div>
                <p className="text-[11px] text-slate-500">
                  ※URLは <code>https://drive.google.com/file/d/xxx/view</code> のままで構いません。本アプリが直接表示形式に自動補正します。
                </p>
              </div>

              {/* Method 2: Direct Upload */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-900 flex items-center text-xs">
                  <span className="w-5 h-5 bg-emerald-600 text-white rounded-full flex items-center justify-center text-[10px] mr-1.5 shrink-0">2</span>
                  最も確実: 直接アップロード
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  外部のクラウド設定やURL切れを心配したくない場合は、アプリの<strong>「問題の新規作成」</strong>から直接端末の画像ファイルを指定できます。
                </p>
                <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg text-[11px] text-emerald-900 space-y-1">
                  <div className="font-semibold">【メリット】</div>
                  <div>✓ Googleドライブの公開設定が不要</div>
                  <div>✓ 軽量化されて直接保存されるため100%表示</div>
                  <div>✓ スマホ・タブレット・PCどこからでも即時表示</div>
                </div>
              </div>

              {/* Method 3: Fallback features */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-900 flex items-center text-xs">
                  <span className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] mr-1.5 shrink-0">3</span>
                  生徒画面での自動回避・救済機能
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  万一画像の読み込みがブロックされた場合でも、学生がテストを中断せずに済むよう以下の機能が自動作動します:
                </p>
                <div className="space-y-1.5 text-[11px] text-slate-700">
                  <div className="flex items-start gap-1">
                    <span className="text-blue-600 font-bold">●</span>
                    <span><strong>別タブで開く:</strong> ワンタップでブラウザの別タブで画像が開き、Googleにログイン済みの生徒なら閲覧可能</span>
                  </div>
                  <div className="flex items-start gap-1">
                    <span className="text-blue-600 font-bold">●</span>
                    <span><strong>サーバー経由で再読み込み:</strong> CORSや直リンク防止を回避してサーバー側から画像を取得</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: 学生名簿・学年管理 */}
      {activeTab === 'student-roster' && (
        <StudentRosterManager 
          onRosterUpdated={() => {
            fetchStudentRoster().then(list => setRosterStudents(list)).catch(() => {});
          }} 
        />
      )}

      {/* MODAL: 新規問題 作問ダイアログ */}
      {showNewQuestionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center">
                <PlusCircle className="w-5 h-5 text-indigo-600 mr-2" />
                国家試験 過去問・予想問題の新規作成
              </h3>
              <button
                type="button"
                onClick={() => setShowNewQuestionModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewQuestion} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    問題ID (id) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newId}
                    onChange={(e) => setNewId(e.target.value)}
                    placeholder="例: 61-AM-031"
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    実施年・回 (例: 2026 / 61)
                  </label>
                  <input
                    type="text"
                    value={newYear}
                    onChange={(e) => setNewYear(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Major & Sub category input */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    分野（大項目）
                  </label>
                  <select
                    value={newMajorCategory}
                    onChange={(e) => setNewMajorCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {presetMajorCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    中項目（（）内に入る項目: 任意）
                  </label>
                  <input
                    type="text"
                    value={newSubCategory}
                    onChange={(e) => setNewSubCategory(e.target.value)}
                    placeholder="例: 脳血管障害、歩行分析、失行症など"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  問題文 (question) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  placeholder="問題文を入力してください。※複数正答の場合は「2つ選べ」等を含めてください。"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm"
                />
              </div>

              {/* 5 choices with checkboxes for answers */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-semibold text-slate-700">
                    選択肢 1〜5 および 正答の指定（複数選択で「2つ選べ」に対応）
                  </label>
                  <span className="text-[11px] text-indigo-700 font-bold">
                    正答指定中: {newSelectedAnswers.join(', ')} 番
                  </span>
                </div>

                {newChoices.map((c, i) => {
                  const choiceNum = i + 1;
                  const isCorrect = newSelectedAnswers.includes(choiceNum);

                  return (
                    <div 
                      key={i} 
                      className={`flex items-center space-x-2 p-1.5 rounded-lg border transition-colors ${
                        isCorrect ? 'bg-indigo-50/70 border-indigo-300' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleAnswerChoice(choiceNum)}
                        className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center transition-colors shrink-0 ${
                          isCorrect ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-300 text-slate-600'
                        }`}
                        title="クリックして正答に指定"
                      >
                        {choiceNum}
                      </button>

                      <input
                        type="text"
                        value={c}
                        onChange={(e) => {
                          const updated = [...newChoices] as [string, string, string, string, string];
                          updated[i] = e.target.value;
                          setNewChoices(updated);
                        }}
                        placeholder={`選択肢 ${choiceNum}`}
                        required
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />

                      <button
                        type="button"
                        onClick={() => handleToggleAnswerChoice(choiceNum)}
                        className={`px-2 py-1 text-[11px] font-bold rounded ${
                          isCorrect ? 'text-indigo-700 bg-indigo-100' : 'text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        {isCorrect ? '正答 ✓' : '正答に指定'}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Image Input with Direct Upload & Live Preview */}
              <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between">
                  <label className="block font-semibold text-slate-700">
                    問題図・画像 (image url: 任意)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowImageGuide(!showImageGuide)}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    画像表示のコツ・注意点
                  </button>
                </div>

                {/* Guide collapsible inside modal */}
                {showImageGuide && (
                  <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg text-[11px] text-slate-700 space-y-1.5">
                    <p className="font-bold text-indigo-900">💡 画像を確実に表示させる方法:</p>
                    <p>● <strong>直接アップロード（推奨）:</strong> 下の「端末内の画像ファイルを選択」をクリックすれば、外部設定不要で全端末で100%確実に表示されます。</p>
                    <p>● <strong>GoogleドライブのURLを使う場合:</strong> Googleドライブ側の共有設定を「リンクを知っている全員（閲覧者）」に必ず変更してください（「制限付き」のままだと表示されません）。</p>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newImageUrl}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewImageUrl(val ? normalizeImageUrl(val) : '');
                      }}
                      placeholder="画像URL (Googleドライブ、Dropboxなど) または下から直接選択"
                      className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                    />
                    {newImageUrl && (
                      <button
                        type="button"
                        onClick={() => setNewImageUrl('')}
                        className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-rose-600 border border-slate-200 bg-white rounded-lg flex items-center gap-1"
                        title="画像を解除"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>解除</span>
                      </button>
                    )}
                  </div>

                  {/* Direct upload button */}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                      isUploadingImage 
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-white hover:bg-indigo-50 text-indigo-700 border-indigo-200 hover:border-indigo-300'
                    }`}>
                      <UploadCloud className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{isUploadingImage ? '画像を最適化中...' : '端末内の画像ファイルを選択 (PNG/JPG/WebP)'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        disabled={isUploadingImage}
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            setIsUploadingImage(true);
                            const dataUrl = await convertFileToOptimizedDataUrl(file);
                            setNewImageUrl(dataUrl);
                          } catch (err: any) {
                            alert(err?.message || '画像の読み込みに失敗しました');
                          } finally {
                            setIsUploadingImage(false);
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                    <span className="text-[11px] text-slate-500">
                      ※端末から直接選ぶと設定不要で確実に表示されます
                    </span>
                  </div>

                  {/* Google Drive hint badge */}
                  {newImageUrl && isGoogleDriveUrl(newImageUrl) && (
                    <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                      <span>GoogleドライブのURLを直接表示リンクに自動変換しました（Google側で「リンクを知っている全員」に設定されている必要があります）。</span>
                    </p>
                  )}

                  {/* Live preview */}
                  {newImageUrl && (
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-[11px] font-bold text-slate-600 mb-1 block">プレビュー表示:</span>
                      <div className="max-w-md">
                        <QuestionImage
                          imageUrl={newImageUrl}
                          alt="新規問題画像プレビュー"
                          maxHeightClass="max-h-52"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  解説文 (explanation)
                </label>
                <textarea
                  rows={3}
                  value={newExplanation}
                  onChange={(e) => setNewExplanation(e.target.value)}
                  placeholder="正答の理由や各選択肢のポイントなどの解説"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNewQuestionModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-semibold rounded-lg"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs text-xs transition-colors"
                >
                  データベースに追加して選択
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Test Modal (URL & QR Code) */}
      {sharingTest && (
        <ShareTestModal
          test={sharingTest.test}
          questions={sharingTest.questions}
          onClose={() => setSharingTest(null)}
        />
      )}

      {/* Question Image Preview Modal */}
      {previewImageQuestion && previewImageQuestion.imageUrl && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold bg-slate-900 text-white px-2 py-0.5 rounded">
                  {previewImageQuestion.id}
                </span>
                <h4 className="text-sm font-bold text-slate-900">問題図・画像プレビュー</h4>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImageQuestion(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-700 font-medium line-clamp-2">
              {previewImageQuestion.question}
            </p>

            <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center">
              <QuestionImage
                imageUrl={previewImageQuestion.imageUrl}
                alt={`問題 ${previewImageQuestion.id} 画像`}
                questionId={previewImageQuestion.id}
                maxHeightClass="max-h-96"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <span className="text-[11px] text-slate-500 truncate max-w-md">
                URL: {previewImageQuestion.imageUrl}
              </span>
              <button
                type="button"
                onClick={() => setPreviewImageQuestion(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Analytics Modal (Submissions & Item Analysis) */}
      {analyticsTest && (
        <TestAnalyticsModal
          test={analyticsTest.test}
          questions={analyticsTest.questions}
          onClose={() => setAnalyticsTest(null)}
        />
      )}

      {/* Passcode Settings Modal */}
      <TeacherAuthModal
        isOpen={showPasscodeSettingsModal}
        onSuccess={() => setShowPasscodeSettingsModal(false)}
        onClose={() => setShowPasscodeSettingsModal(false)}
      />

      {/* Google Docs Export Modal */}
      {googleDocsExportData && (
        <GoogleDocsExportModal
          isOpen={Boolean(googleDocsExportData)}
          onClose={() => setGoogleDocsExportData(null)}
          questions={googleDocsExportData.questions}
          defaultTitle={googleDocsExportData.title}
        />
      )}

      {/* Word (.docx) Export Modal */}
      {wordExportData && (
        <WordExportModal
          isOpen={Boolean(wordExportData)}
          onClose={() => setWordExportData(null)}
          questions={wordExportData.questions}
          defaultTitle={wordExportData.title}
        />
      )}
    </div>
  );
};
