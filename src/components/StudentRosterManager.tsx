import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StudentRosterItem } from '../types';
import { 
  fetchStudentRoster, 
  saveStudentsToRoster, 
  deleteStudentFromRoster,
  clearAllStudentsRoster,
  loadSampleRoster,
  subscribeStudentRoster
} from '../services/studentRosterService';
import { 
  Users, 
  UserPlus, 
  Trash2, 
  Search, 
  Upload, 
  Download, 
  RefreshCw, 
  GraduationCap, 
  Check, 
  AlertCircle,
  FileText,
  X,
  Loader2,
  ShieldCheck,
  FileSpreadsheet,
  Info,
  Sparkles
} from 'lucide-react';

export interface StudentRosterManagerProps {
  onRosterUpdated?: () => void;
  onOpenStudentGuidance?: (studentId: string) => void;
}

interface ParsedStudentPreview {
  studentId: string;
  name?: string;
  notes?: string;
  grade: number;
}

/**
 * Robust parser for roster text from Excel, CSV, Google Sheets, or manual typing
 */
export function parseStudentRosterText(rawText: string, targetGrade: number): ParsedStudentPreview[] {
  if (!rawText || !rawText.trim()) return [];
  
  // Normalize full-width characters (e.g. ２４０１ -> 2401, 　 -> space)
  const normalized = rawText.normalize('NFKC');
  const lines = normalized.split(/\r?\n/);
  const result: ParsedStudentPreview[] = [];
  const seenIds = new Set<string>();

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;

    // Strip wrapping quotes if entire line was quoted in CSV
    line = line.replace(/^["']+|["']+$/g, '').trim();
    if (!line) continue;

    // Check if line is purely a table header / title row
    const lower = line.toLowerCase();
    const isPureHeader = 
      /^(学籍番号|学生番号|id|no\.?|番号)\s*([,\t\s、]\s*(氏名|学生氏名|名前|name))?$/i.test(line) ||
      (lower.includes('学籍番号') && lower.includes('氏名')) ||
      (lower.includes('student') && lower.includes('name')) ||
      /^(作業療法|学科|名簿|年度|一覧|クラス|第[1-4]学年)/.test(line);

    if (isPureHeader) {
      continue;
    }

    // Strip leading numbering or bullet markers like "1.", "1、", "(1)", "①", "No.1", "No.01", "番号1"
    // but keep actual ID if the whole line is just numbers
    let cleanedLine = line;
    const bulletMatch = cleanedLine.match(/^([#№No.no.番号]*\s*\d+[\.\、\:\)\-\/]|[\(（]\d+[\)）]|[①-⑳])\s+(.+)$/);
    if (bulletMatch && bulletMatch[2]) {
      cleanedLine = bulletMatch[2].trim();
    } else {
      // Strip leading "No." or "No " or "ID:" or "学籍番号:"
      cleanedLine = cleanedLine.replace(/^(no\.?|id|学籍番号|番号)\s*[:：\-]?\s*/i, '').trim();
    }

    if (!cleanedLine) continue;

    // Determine delimiters: Tab (Excel), Comma (CSV), Japanese comma, or Whitespace
    let tokens: string[] = [];
    if (cleanedLine.includes('\t')) {
      tokens = cleanedLine.split('\t').map(t => t.trim().replace(/^["']+|["']+$/g, '')).filter(Boolean);
    } else if (cleanedLine.includes(',') || cleanedLine.includes('、')) {
      tokens = cleanedLine.split(/[,、]/).map(t => t.trim().replace(/^["']+|["']+$/g, '')).filter(Boolean);
    } else if (/\s{2,}/.test(cleanedLine)) {
      tokens = cleanedLine.split(/\s{2,}/).map(t => t.trim().replace(/^["']+|["']+$/g, '')).filter(Boolean);
    } else if (cleanedLine.includes(' ')) {
      tokens = cleanedLine.split(' ').map(t => t.trim().replace(/^["']+|["']+$/g, '')).filter(Boolean);
    } else {
      tokens = [cleanedLine];
    }

    if (tokens.length === 0) continue;

    let studentId = '';
    let name: string | undefined = undefined;
    let notes: string | undefined = undefined;
    let grade = targetGrade;

    // Pattern 1: First column is grade indicator (e.g. "1年", "1", "1年生")
    if (/^[1-4](年|年生)?$/.test(tokens[0]) && tokens.length >= 2) {
      const gMatch = tokens[0].match(/^[1-4]/);
      if (gMatch) grade = Number(gMatch[0]);
      tokens = tokens.slice(1);
    }

    if (tokens.length === 1) {
      studentId = tokens[0].toUpperCase();
    } else if (tokens.length === 2) {
      // Check if order is (ID, Name) or (Name, ID)
      const token0HasDigits = /\d/.test(tokens[0]);
      const token1HasDigits = /\d/.test(tokens[1]);

      if (!token0HasDigits && token1HasDigits) {
        // Name is first, ID is second! (e.g. "山田太郎 2401")
        name = tokens[0];
        studentId = tokens[1].toUpperCase();
      } else {
        // Standard: ID is first, Name is second
        studentId = tokens[0].toUpperCase();
        name = tokens[1];
      }
    } else {
      // 3 or more tokens
      const token0HasDigits = /\d/.test(tokens[0]);
      const token1HasDigits = /\d/.test(tokens[1]);

      if (!token0HasDigits && token1HasDigits) {
        name = tokens[0];
        studentId = tokens[1].toUpperCase();
        notes = tokens.slice(2).join(' ');
      } else {
        studentId = tokens[0].toUpperCase();
        name = tokens[1];
        notes = tokens.slice(2).join(' ');
      }
    }

    // Clean up student ID
    studentId = studentId.replace(/["',;]/g, '').trim();

    if (!studentId || seenIds.has(studentId)) continue;
    seenIds.add(studentId);

    result.push({
      studentId,
      name: name?.trim() || undefined,
      notes: notes?.trim() || undefined,
      grade
    });
  }

  // Fallback: If parsing resulted in 0 items but rawText has non-empty lines,
  // treat every non-blank line as a student ID!
  if (result.length === 0 && rawText.trim().length > 0) {
    const rawLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const r of rawLines) {
      const clean = r.replace(/^["']+|["']+$/g, '').trim();
      if (clean && !seenIds.has(clean.toUpperCase())) {
        seenIds.add(clean.toUpperCase());
        result.push({
          studentId: clean.toUpperCase(),
          grade: targetGrade
        });
      }
    }
  }

  return result;
}

export const StudentRosterManager: React.FC<StudentRosterManagerProps> = ({ onRosterUpdated, onOpenStudentGuidance }) => {
  const [students, setStudents] = useState<StudentRosterItem[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<number>(1); // Default to 1st grade
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ isError: boolean; message: string } | null>(null);

  // Deletion modal state
  const [studentToDelete, setStudentToDelete] = useState<StudentRosterItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showClearAllModal, setShowClearAllModal] = useState(false);

  // Single student form
  const [newStudentId, setNewStudentId] = useState('');
  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [isSubmittingSingle, setIsSubmittingSingle] = useState(false);

  // Bulk import modal/box
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkGrade, setBulkGrade] = useState<number>(1);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const jsonRestoreInputRef = useRef<HTMLInputElement | null>(null);

  // Parsed students for live preview in bulk import modal
  const parsedBulkStudents = useMemo(() => {
    return parseStudentRosterText(bulkText, bulkGrade);
  }, [bulkText, bulkGrade]);

  const loadRoster = async () => {
    try {
      const list = await fetchStudentRoster();
      setStudents(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    // 1. Subscribe to real-time updates (localStorage + Firestore)
    const unsubscribe = subscribeStudentRoster((updatedList) => {
      setStudents(updatedList);
      setLoading(false);
    });

    // 2. Periodic background refresh (every 5 seconds) to catch students registering from external endpoints
    const interval = setInterval(() => {
      fetchStudentRoster().then(list => {
        if (list && list.length > 0) {
          setStudents(list);
        }
      }).catch(() => {});
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleAddSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = newStudentId.trim().toUpperCase();
    if (!cleanId) return;

    setIsSubmittingSingle(true);
    try {
      const newItem: StudentRosterItem = {
        studentId: cleanId,
        grade: selectedGrade,
        name: newName.trim() || undefined,
        notes: newNotes.trim() || undefined
      };

      const res = await saveStudentsToRoster(newItem);
      if (res.success) {
        setFeedback({ isError: false, message: `学籍番号 ${cleanId} を登録しました（保存完了）` });
        setNewStudentId('');
        setNewName('');
        setNewNotes('');
        await loadRoster();
        onRosterUpdated?.();
      } else {
        setFeedback({ isError: true, message: res.error || '登録に失敗しました' });
      }
    } catch (err: any) {
      setFeedback({ isError: true, message: err?.message || '登録中にエラーが発生しました' });
    } finally {
      setIsSubmittingSingle(false);
    }
  };

  const handleBulkImport = async () => {
    setBulkError(null);

    if (!bulkText.trim()) {
      setBulkError('学籍番号が入力されていません。1行に1件ずつ学籍番号を入力するか、Excelから貼り付けてください。');
      return;
    }

    let itemsToRegister = parsedBulkStudents;
    if (itemsToRegister.length === 0) {
      itemsToRegister = parseStudentRosterText(bulkText, bulkGrade);
    }

    // Emergency fallback: treat each non-empty row as studentId
    if (itemsToRegister.length === 0) {
      const fallbackLines = bulkText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      itemsToRegister = fallbackLines.map(line => ({
        studentId: line.replace(/^["']+|["']+$/g, '').trim().toUpperCase(),
        grade: bulkGrade
      })).filter(item => item.studentId.length > 0);
    }

    if (itemsToRegister.length === 0) {
      setBulkError('有効な学籍番号が認識できませんでした。学籍番号が含まれているか確認してください。');
      return;
    }

    setIsSubmittingBulk(true);
    try {
      const items: StudentRosterItem[] = itemsToRegister.map(p => ({
        studentId: p.studentId,
        grade: bulkGrade,
        name: p.name,
        notes: p.notes
      }));

      const res = await saveStudentsToRoster(items);
      if (res.success) {
        setFeedback({ 
          isError: false, 
          message: `【登録完了】${items.length} 名の学生を${bulkGrade}年生の名簿に一括登録しました！` 
        });
        setBulkText('');
        setBulkError(null);
        setShowBulkImport(false);
        // Ensure selectedGrade switches to bulkGrade so teacher immediately sees the new students!
        setSelectedGrade(bulkGrade);
        await loadRoster();
        onRosterUpdated?.();
      } else {
        setBulkError(res.error || '一括登録の保存に失敗しました。');
      }
    } catch (err: any) {
      setBulkError(err?.message || '登録処理中にエラーが発生しました。');
    } finally {
      setIsSubmittingBulk(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        // Strip BOM if present
        const cleanContent = content.replace(/^\uFEFF/, '');
        setBulkText(cleanContent);
        setBulkError(null);
      }
    };
    reader.onerror = () => {
      setBulkError('ファイルの読み込みに失敗しました。');
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  const handleRequestDelete = (student: StudentRosterItem) => {
    setStudentToDelete(student);
  };

  const handleExecuteDelete = async () => {
    if (!studentToDelete) return;
    setIsDeleting(true);
    try {
      const studentId = studentToDelete.studentId;
      const ok = await deleteStudentFromRoster(studentId);
      if (ok) {
        setFeedback({ isError: false, message: `学籍番号 ${studentId} を名簿から削除しました` });
        setStudentToDelete(null);
        await loadRoster();
        onRosterUpdated?.();
      } else {
        setFeedback({ isError: true, message: '名簿からの削除に失敗しました' });
      }
    } catch (err: any) {
      setFeedback({ isError: true, message: err?.message || '削除中にエラーが発生しました' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExecuteClearAll = async () => {
    setIsDeleting(true);
    try {
      await clearAllStudentsRoster();
      setFeedback({ isError: false, message: '全学年の学生名簿をクリアしました' });
      setShowClearAllModal(false);
      await loadRoster();
      onRosterUpdated?.();
    } catch (err: any) {
      setFeedback({ isError: true, message: err?.message || 'クリア中にエラーが発生しました' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLoadSample = async () => {
    setLoading(true);
    try {
      const samples = await loadSampleRoster();
      setFeedback({ isError: false, message: `体験用サンプル学生名簿（${samples.length}名）を読み込みました` });
      await loadRoster();
      onRosterUpdated?.();
    } catch {
      setFeedback({ isError: true, message: 'サンプル名簿の読み込みに失敗しました' });
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (students.length === 0) return;
    const header = '学年,学籍番号,氏名,備考,登録日\n';
    const rows = students.map(s => 
      `${s.grade},"${s.studentId}","${s.name || ''}","${s.notes || ''}","${s.registeredAt || ''}"`
    ).join('\n');

    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `作業療法学生名簿_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    if (students.length === 0) return;
    const jsonStr = JSON.stringify(students, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `作業療法学生名簿_バックアップ_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRestoreJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const raw = event.target?.result as string;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const res = await saveStudentsToRoster(parsed);
          if (res.success) {
            setFeedback({ isError: false, message: `バックアップファイルから ${parsed.length} 名の学生名簿を復元しました！` });
            await loadRoster();
            onRosterUpdated?.();
          } else {
            setFeedback({ isError: true, message: '復元に失敗しました' });
          }
        } else {
          setFeedback({ isError: true, message: '有効な名簿バックアップデータが見つかりませんでした' });
        }
      } catch {
        setFeedback({ isError: true, message: 'JSONファイルの解析に失敗しました' });
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  // Grade counts
  const gradeCounts = {
    1: students.filter(s => s.grade === 1).length,
    2: students.filter(s => s.grade === 2).length,
    3: students.filter(s => s.grade === 3).length,
    4: students.filter(s => s.grade === 4).length,
  };

  // Filtered by selected grade and search
  const filteredStudents = students.filter(s => {
    if (s.grade !== selectedGrade) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = s.studentId.toLowerCase().includes(q);
      const matchName = (s.name || '').toLowerCase().includes(q);
      return matchId || matchName;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Hidden file inputs for restore/import */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept=".csv,.txt,.tsv" 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={jsonRestoreInputRef} 
        onChange={handleRestoreJSON} 
        accept=".json" 
        className="hidden" 
      />

      {/* Top Banner / Guidance */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  学生名簿・学年別配信管理 (1〜4年生)
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-3 h-3" />
                  <span>端末＆サーバー二重永続化</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                学年ごとの学籍番号を管理し、小テスト配信時に学年指定や個人指定で対象を絞り込めます。データはお使いの端末（ブラウザ）とサーバーの両方に自動保存されます。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setBulkGrade(selectedGrade);
                setBulkError(null);
                setShowBulkImport(true);
              }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>学籍番号の一括登録</span>
            </button>
            <button
              onClick={handleExportCSV}
              disabled={students.length === 0}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center space-x-1 disabled:opacity-40"
              title="名簿をExcel/CSV形式で保存"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>CSV保存</span>
            </button>
            <button
              onClick={handleExportJSON}
              disabled={students.length === 0}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center space-x-1 disabled:opacity-40"
              title="名簿の完全バックアップ（JSON）を保存"
            >
              <Download className="w-3.5 h-3.5" />
              <span>バックアップ</span>
            </button>
            <button
              onClick={() => jsonRestoreInputRef.current?.click()}
              className="px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl transition-colors flex items-center space-x-1"
              title="バックアップファイル（.json）から復元"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span>復元</span>
            </button>
          </div>
        </div>

        {/* Page-level Feedback banner */}
        {feedback && (
          <div className={`mt-4 p-3 rounded-xl text-xs flex items-center justify-between gap-2 ${
            feedback.isError 
              ? 'bg-rose-50 text-rose-800 border border-rose-200' 
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}>
            <div className="flex items-center gap-2">
              {feedback.isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}
              <span className="font-medium">{feedback.message}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">×</button>
          </div>
        )}
      </div>

      {/* Grade Selector Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(g => (
          <button
            key={g}
            onClick={() => setSelectedGrade(g)}
            className={`p-4 rounded-2xl border text-left transition-all ${
              selectedGrade === g
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-600/20'
                : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{g}年生</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                selectedGrade === g ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {gradeCounts[g as 1|2|3|4]} 名
              </span>
            </div>
            <p className={`text-[11px] mt-1 ${selectedGrade === g ? 'text-indigo-100' : 'text-slate-400'}`}>
              {g === 4 ? '国試受験年・最終学年' : g === 3 ? '臨床実習・重要応用年' : g === 2 ? '専門基礎・臨床導入' : '基礎医学・解剖生理学'}
            </p>
          </button>
        ))}
      </div>

      {/* Main Content Area: Register new student + Table list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Add Single Student */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs lg:col-span-1 h-fit">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-1.5">
            <UserPlus className="w-4 h-4 text-indigo-600" />
            <span>{selectedGrade}年生の学生を1名追加</span>
          </h3>

          <form onSubmit={handleAddSingle} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                学籍番号 <span className="text-rose-500">*必須</span>
              </label>
              <input
                type="text"
                required
                placeholder="例: 2401 または OT2401"
                value={newStudentId}
                onChange={(e) => setNewStudentId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                学生氏名 <span className="text-slate-400 font-normal">（任意）</span>
              </label>
              <input
                type="text"
                placeholder="例: 山田 太郎"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                備考 <span className="text-slate-400 font-normal">（クラス・出欠等、任意）</span>
              </label>
              <input
                type="text"
                placeholder="例: A組 / 再試対象 / 実習班1"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingSingle || !newStudentId.trim()}
              className="w-full mt-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50"
            >
              {isSubmittingSingle ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>登録中...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{selectedGrade}年生の名簿に登録する</span>
                </>
              )}
            </button>
          </form>

          {/* Helper card */}
          <div className="mt-4 pt-4 border-t border-slate-100 text-[11px] text-slate-500 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>自動保存と保護</span>
            </div>
            <p>
              登録した名簿はお使いのブラウザに即座に保管され、サーバーにも同期されます。
            </p>
          </div>
        </div>

        {/* Right column: Student List Table */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">
                {selectedGrade}年生の登録学生一覧
              </h3>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                {filteredStudents.length} 名
              </span>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="学籍番号・氏名で検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
              <span>名簿データを読み込み中...</span>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-700">{selectedGrade}年生の登録学生はいません</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                左側のフォームから1名ずつ登録するか、右上の「学籍番号の一括登録」からExcelやCSVのリストを一括で流し込めます。
              </p>
              <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    setBulkGrade(selectedGrade);
                    setBulkError(null);
                    setShowBulkImport(true);
                  }}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{selectedGrade}年生を一括登録する</span>
                </button>
                {students.length === 0 && (
                  <button
                    onClick={handleLoadSample}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                  >
                    <span>サンプル名簿を投入</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                    <th className="py-2.5 px-3">学籍番号</th>
                    <th className="py-2.5 px-3">氏名</th>
                    <th className="py-2.5 px-3">備考</th>
                    <th className="py-2.5 px-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map(student => (
                    <tr key={student.studentId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {student.studentId}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {student.name || <span className="text-slate-400 font-normal">-</span>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                        {student.notes || <span className="text-slate-300">-</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {onOpenStudentGuidance && (
                          <button
                            type="button"
                            onClick={() => onOpenStudentGuidance(student.studentId)}
                            className="p-1.5 text-amber-600 hover:text-amber-700 rounded-lg hover:bg-amber-50 transition-colors mr-1 inline-flex items-center gap-1 text-xs font-bold"
                            title="この学生の通算全テスト総合苦手分析・指導資料を開く"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span className="hidden md:inline">総合指導資料</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRequestDelete(student)}
                          className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Bottom bar for student table */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>表示中: {filteredStudents.length}名（全学年合計: {students.length}名）</span>
                {students.length > 0 && (
                  <button
                    onClick={() => setShowClearAllModal(true)}
                    className="text-rose-600 hover:text-rose-700 font-medium text-[11px] hover:underline"
                  >
                    名簿の一括全消去
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Single Student Confirmation Modal */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative animate-in zoom-in-95 duration-150">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setStudentToDelete(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mx-auto mb-3.5 shadow-2xs">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-slate-900 text-center mb-1">
              名簿から学生を削除
            </h3>
            <p className="text-xs text-slate-500 text-center mb-4">
              以下の学生データを名簿から削除しますか？
            </p>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs mb-4 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">学籍番号:</span>
                <span className="font-mono font-bold text-slate-900">{studentToDelete.studentId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">氏名:</span>
                <span className="font-bold text-slate-800">{studentToDelete.name || '（未設定）'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">学年:</span>
                <span className="font-bold text-indigo-600">{studentToDelete.grade}年生</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 text-center mb-5">
              ※名簿から削除しても、すでに提出された過去のテスト成績記録は保持されます。
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setStudentToDelete(null)}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleExecuteDelete}
                className="py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>削除中...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>削除する</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Modal */}
      {showClearAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mx-auto mb-3.5 shadow-2xs">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center mb-1">
              学生名簿の全消去
            </h3>
            <p className="text-xs text-slate-500 text-center mb-4">
              登録されている全学年（{students.length}名）の学生名簿を完全にクリアしますか？
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowClearAllModal(false)}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleExecuteClearAll}
                className="py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>消去中...</span>
                  </>
                ) : (
                  <span>全消去する</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-600" />
                <span>学籍番号の一括登録</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowBulkImport(false);
                  setBulkError(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Excelやスプレッドシートから学籍番号（または氏名を含む列）をコピー＆ペーストするか、ファイルを読み込んでください。
            </p>

            {/* Error banner right inside modal */}
            {bulkError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 whitespace-pre-wrap">{bulkError}</div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  登録先の学年を選択
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map(g => (
                    <button
                      type="button"
                      key={g}
                      onClick={() => setBulkGrade(g)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                        bulkGrade === g
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {g}年生
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    学籍番号リスト (1行に1名)
                  </label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>CSV/テキストファイルから読込</span>
                  </button>
                </div>
                <textarea
                  rows={7}
                  placeholder={`【入力例（どの形式でも自動認識されます）】\n2401\n2402\n2403, 山田太郎\n2404　佐藤花子\n2405\t鈴木一郎\tA組`}
                  value={bulkText}
                  onChange={(e) => {
                    setBulkText(e.target.value);
                    if (bulkError) setBulkError(null);
                  }}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  ※ カンマ（,）、タブ（Excel貼付）、スペース区切りで「学籍番号 氏名 備考」を同時登録可能
                </p>
              </div>

              {/* Live Preview Box */}
              {bulkText.trim().length > 0 && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-indigo-600" />
                      <span>検出結果プレビュー</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                      parsedBulkStudents.length > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {parsedBulkStudents.length} 名検出
                    </span>
                  </div>

                  {parsedBulkStudents.length > 0 ? (
                    <div className="max-h-28 overflow-y-auto space-y-1 divide-y divide-slate-200/60 font-mono text-[11px]">
                      {parsedBulkStudents.slice(0, 5).map((p, idx) => (
                        <div key={idx} className="pt-1 flex items-center justify-between text-slate-700">
                          <span className="font-bold text-indigo-700">{p.studentId}</span>
                          <span className="text-slate-600">{p.name || '（氏名未指定）'}</span>
                          <span className="text-slate-400 text-[10px]">{bulkGrade}年生</span>
                        </div>
                      ))}
                      {parsedBulkStudents.length > 5 && (
                        <p className="text-[10px] text-slate-400 text-center pt-1 font-sans">
                          他 {parsedBulkStudents.length - 5} 名（計 {parsedBulkStudents.length} 名）
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-700">
                      学籍番号が認識されていません。半角または全角で学籍番号を入力してください。
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmittingBulk}
                  onClick={() => {
                    setShowBulkImport(false);
                    setBulkError(null);
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isSubmittingBulk}
                  onClick={handleBulkImport}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  {isSubmittingBulk ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>登録処理中...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{bulkGrade}年生に一括登録する {parsedBulkStudents.length > 0 ? `(${parsedBulkStudents.length}名)` : ''}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
