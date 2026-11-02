import React, { useState, useEffect } from 'react';
import { DeliveredTest, Question, SubmissionRecord } from '../types';
import { getLocalTestsBackup, saveLocalTestsBackup, syncDeliveredTestsWithServer } from '../utils/shareTest';
import {
  getLocalSubmissionsCache,
  saveLocalSubmissionsCache,
  recoverSubmissionsFromStudentHistory,
  syncSubmissionsWithServer
} from '../services/testSyncService';
import {
  RefreshCw,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  Database,
  FileJson,
  Sparkles,
  ShieldCheck,
  UserCheck
} from 'lucide-react';

interface DataRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  onRestored: () => void;
}

export const DataRecoveryModal: React.FC<DataRecoveryModalProps> = ({
  isOpen,
  onClose,
  questions,
  onRestored
}) => {
  const [activeTab, setActiveTab] = useState<'scan' | 'export' | 'import'>('scan');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    tests: DeliveredTest[];
    submissions: SubmissionRecord[];
    historyCount: number;
  } | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<{ message: string; isError?: boolean } | null>(null);
  const [importJsonText, setImportJsonText] = useState('');

  // Run scan when modal opens
  useEffect(() => {
    if (isOpen) {
      handleRunScan();
    }
  }, [isOpen]);

  const handleRunScan = () => {
    setIsScanning(true);
    setRestoreStatus(null);

    setTimeout(() => {
      try {
        const tests = getLocalTestsBackup();
        const cachedSubs = getLocalSubmissionsCache();
        const historySubs = recoverSubmissionsFromStudentHistory();

        // Merge submissions
        const subMap = new Map<string, SubmissionRecord>();
        cachedSubs.forEach(s => subMap.set(s.id, s));
        historySubs.forEach(s => subMap.set(s.id, s));

        // Reconstruct any tests referenced in submissions or quiz history
        const questionMap = new Map(questions.map(q => [q.id, q]));
        const testMap = new Map<string, DeliveredTest>();
        tests.forEach(t => testMap.set(t.id, t));

        // Check if history has any tests not in testMap
        try {
          const rawHist = localStorage.getItem('ot_exam_quiz_history_v2') || localStorage.getItem('ot_exam_quiz_history_v1');
          if (rawHist) {
            const histList = JSON.parse(rawHist);
            if (Array.isArray(histList)) {
              histList.forEach((h: any) => {
                if (h && h.testId && !testMap.has(h.testId)) {
                  const qIds = h.questionIds || [];
                  const matchedQs = qIds.map((id: string) => questionMap.get(id)).filter(Boolean) as Question[];
                  testMap.set(h.testId, {
                    id: h.testId,
                    title: h.testTitle || '復元された小テスト',
                    createdAt: h.date || new Date().toISOString(),
                    questionIds: qIds,
                    totalQuestions: qIds.length || matchedQs.length,
                    questions: matchedQs,
                    targetType: 'all'
                  });
                }
              });
            }
          }
        } catch {}

        setScanResult({
          tests: Array.from(testMap.values()),
          submissions: Array.from(subMap.values()),
          historyCount: historySubs.length
        });
      } catch (err: any) {
        setRestoreStatus({
          message: `スキャン中にエラーが発生しました: ${err?.message}`,
          isError: true
        });
      } finally {
        setIsScanning(false);
      }
    }, 300);
  };

  const handleApplyRestore = async () => {
    if (!scanResult) return;
    setIsScanning(true);
    setRestoreStatus(null);

    try {
      // 1. Sync tests with server and save local backup
      let restoredTests = scanResult.tests;
      if (restoredTests.length > 0) {
        const syncRes = await syncDeliveredTestsWithServer(restoredTests);
        restoredTests = syncRes.tests;
        saveLocalTestsBackup(restoredTests);
      }

      // 2. Sync submissions with server and save local cache
      let restoredSubs = scanResult.submissions;
      if (restoredSubs.length > 0) {
        restoredSubs = await syncSubmissionsWithServer(restoredSubs);
        saveLocalSubmissionsCache(restoredSubs);
      }

      setRestoreStatus({
        message: `復元が完了しました！（テスト: ${restoredTests.length}件、提出データ: ${restoredSubs.length}件）`,
        isError: false
      });

      onRestored();
    } catch (err: any) {
      setRestoreStatus({
        message: `復元中にエラーが発生しました: ${err?.message}`,
        isError: true
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleExportBackup = () => {
    try {
      const tests = getLocalTestsBackup();
      const submissions = getLocalSubmissionsCache();
      let roster: any[] = [];
      try {
        const rawRoster = localStorage.getItem('ot_student_roster_v2');
        if (rawRoster) roster = JSON.parse(rawRoster);
      } catch {}

      const backupData = {
        app: 'ot_exam_trainer',
        exportedAt: new Date().toISOString(),
        version: '2.0',
        tests,
        submissions,
        roster
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ot_exam_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`エクスポートに失敗しました: ${e?.message}`);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      try {
        const text = event.target?.result as string;
        setImportJsonText(text);
      } catch (err: any) {
        alert('ファイルの読み込みに失敗しました。');
      }
    };
    reader.readAsText(file);
  };

  const handleApplyImport = async () => {
    if (!importJsonText.trim()) {
      alert('バックアップのJSONテキストを入力またはファイル選択してください。');
      return;
    }

    try {
      const data = JSON.parse(importJsonText);
      const tests: DeliveredTest[] = Array.isArray(data.tests) ? data.tests : [];
      const submissions: SubmissionRecord[] = Array.isArray(data.submissions) ? data.submissions : [];

      if (tests.length === 0 && submissions.length === 0) {
        alert('有効なテストまたは提出データが見つかりませんでした。');
        return;
      }

      setIsScanning(true);

      // Save tests
      if (tests.length > 0) {
        await syncDeliveredTestsWithServer(tests);
        saveLocalTestsBackup(tests);
      }

      // Save submissions
      if (submissions.length > 0) {
        await syncSubmissionsWithServer(submissions);
        saveLocalSubmissionsCache(submissions);
      }

      setRestoreStatus({
        message: `インポートによる復元が完了しました！（テスト: ${tests.length}件、提出データ: ${submissions.length}件）`,
        isError: false
      });

      onRestored();
    } catch (err: any) {
      setRestoreStatus({
        message: `JSONの解析またはインポートに失敗しました: ${err?.message}`,
        isError: true
      });
    } finally {
      setIsScanning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">データ保護・自動復元センター</h2>
              <p className="text-xs text-indigo-200">配信テストおよび学生提出データの復元・バックアップ管理</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2 gap-2 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('scan')}
            className={`pb-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'scan'
                ? 'border-indigo-600 text-indigo-600 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>自動復元スキャン</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`pb-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'export'
                ? 'border-indigo-600 text-indigo-600 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>バックアップ保存 (JSON)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`pb-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'import'
                ? 'border-indigo-600 text-indigo-600 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>ファイルから復元</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {restoreStatus && (
            <div
              className={`p-4 rounded-2xl flex items-start gap-3 text-xs font-bold ${
                restoreStatus.isError
                  ? 'bg-rose-50 border border-rose-200 text-rose-800'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              }`}
            >
              {restoreStatus.isError ? (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">{restoreStatus.message}</div>
            </div>
          )}

          {activeTab === 'scan' && (
            <div className="space-y-4">
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-900 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">双方向自動保護（Bidirectional Rehydration）機能</p>
                  <p className="text-slate-600 leading-relaxed">
                    アプリの更新やサーバー再起動が発生しても、ブラウザの多重バックアップや受講生の解答履歴から、小テストや提出データが自動的に再同期・復元されます。
                  </p>
                </div>
              </div>

              {/* Scan summary cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <span className="text-[11px] font-bold text-slate-500">検出された配信テスト</span>
                  <div className="text-2xl font-black text-slate-900 mt-1">
                    {scanResult ? scanResult.tests.length : '...'}
                    <span className="text-xs font-bold text-slate-500 ml-1">件</span>
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <span className="text-[11px] font-bold text-slate-500">検出された学生提出データ</span>
                  <div className="text-2xl font-black text-indigo-600 mt-1">
                    {scanResult ? scanResult.submissions.length : '...'}
                    <span className="text-xs font-bold text-slate-500 ml-1">件</span>
                  </div>
                </div>
              </div>

              {/* Test list preview */}
              {scanResult && scanResult.tests.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-extrabold text-slate-700">復元可能な配信テスト一覧</h4>
                  <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                    {scanResult.tests.map(t => (
                      <div
                        key={t.id}
                        className="bg-white border border-slate-200 rounded-xl p-3 text-xs flex items-center justify-between gap-2 shadow-2xs"
                      >
                        <div>
                          <div className="font-bold text-slate-900">{t.title}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            全{t.totalQuestions || t.questions?.length || t.questionIds?.length || 0}問・
                            {t.code ? `参加コード: ${t.code}` : 'URL共有'}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md shrink-0">
                          保護済み
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleRunScan}
                  disabled={isScanning}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                  <span>再スキャン</span>
                </button>

                <button
                  type="button"
                  onClick={handleApplyRestore}
                  disabled={isScanning || !scanResult || (scanResult.tests.length === 0 && scanResult.submissions.length === 0)}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>検出された全データを即時復元して一覧に反映</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'export' && (
            <div className="space-y-4 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <h4 className="font-extrabold text-slate-900 flex items-center gap-2">
                  <FileJson className="w-4 h-4 text-indigo-600" />
                  完全バックアップファイルのエクスポート
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  現在登録されているすべての配信テスト、問題データ、学生の提出済み回答、学籍名簿を1つのJSONファイルとして保存します。
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportBackup}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>JSONバックアップファイルをダウンロード</span>
              </button>
            </div>
          )}

          {activeTab === 'import' && (
            <div className="space-y-4 text-xs">
              <div className="space-y-2">
                <label className="font-extrabold text-slate-700 block">
                  1. バックアップファイル（JSON）を選択
                </label>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportFile}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-extrabold text-slate-700 block">
                  2. またはJSONテキストを直接貼り付け
                </label>
                <textarea
                  rows={6}
                  value={importJsonText}
                  onChange={e => setImportJsonText(e.target.value)}
                  placeholder='{"tests": [...], "submissions": [...]}'
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px] focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="button"
                onClick={handleApplyImport}
                disabled={isScanning || !importJsonText.trim()}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>バックアップからテスト・提出データを復元する</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 p-4 bg-slate-50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
