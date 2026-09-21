import React, { useState } from 'react';
import { GraduationCap, BookOpen, ShieldCheck, Sparkles, CheckCircle2, Lock, RefreshCw } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface NavbarProps {
  mode: 'student' | 'teacher';
  onToggleMode: (mode: 'student' | 'teacher') => void;
  pendingTestsCount: number;
  onRefreshTests?: () => Promise<void>;
  isStudentStandalone?: boolean;
  onOpenStudentPortalGuide?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  mode,
  onToggleMode,
  pendingTestsCount,
  onRefreshTests,
  isStudentStandalone = false,
  onOpenStudentPortalGuide
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshClick = async () => {
    if (!onRefreshTests || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefreshTests();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-sm ring-2 ring-teal-100">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-slate-900 tracking-tight">OT国家試験対策</span>
                <span className="hidden sm:inline-block px-2 py-0.5 text-xs font-semibold bg-teal-50 text-teal-700 rounded-md border border-teal-200">
                  作業療法士
                </span>
                {isStudentStandalone ? (
                  <span className="px-2 py-0.5 text-[10px] font-black bg-emerald-600 text-white rounded-md shadow-2xs">
                    学生ポータル
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-teal-600 text-white rounded shadow-2xs">
                    v1.0 正式版
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 hidden md:block">
                {isStudentStandalone ? '各自のスマートフォン・PCで受講する学生専用画面' : '過去問演習 ＆ 教員配信小テスト'}
              </p>
            </div>
          </div>

          {/* Right Action Controls: Refresh, PWA Install, Guide & Mode Switcher */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Global Manual Refresh Button (especially visible for students) */}
            {onRefreshTests && (
              <button
                type="button"
                onClick={handleRefreshClick}
                disabled={isRefreshing}
                className="px-2.5 py-1.5 bg-slate-50 hover:bg-teal-50 text-slate-700 hover:text-teal-800 border border-slate-200 hover:border-teal-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="最新の配信小テスト・過去問データを再確認・受信"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-teal-600 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isRefreshing ? '受信中...' : '最新に更新 / 再確認'}</span>
                <span className="sm:hidden">{isRefreshing ? '更新中' : '更新'}</span>
              </button>
            )}

            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Teacher guide button if in teacher mode or requested */}
            {mode === 'teacher' && onOpenStudentPortalGuide && (
              <button
                type="button"
                onClick={onOpenStudentPortalGuide}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="学生に案内するURLやQRコードを表示"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">学生用案内 (QR・URL)</span>
                <span className="sm:hidden">学生案内</span>
              </button>
            )}

            {/* If Standalone Student Mode, hide prominent teacher toggle */}
            {isStudentStandalone ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-flex items-center text-xs font-bold text-teal-800 bg-teal-50 px-3 py-1.5 rounded-xl border border-teal-200">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-teal-600" />
                  学生専用ポータル
                </span>
                <button
                  type="button"
                  onClick={() => onToggleMode('teacher')}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors text-xs"
                  title="教員管理（PIN暗証番号保護）"
                >
                  <Lock className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200" id="mode-switcher">
                <button
                  id="student-mode-btn"
                  onClick={() => onToggleMode('student')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    mode === 'student'
                      ? 'bg-white text-teal-700 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>学生モード</span>
                  {pendingTestsCount > 0 && (
                    <span className="bg-amber-500 text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full animate-pulse shadow-2xs">
                      {pendingTestsCount}
                    </span>
                  )}
                </button>

                <button
                  id="teacher-mode-btn"
                  onClick={() => onToggleMode('teacher')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    mode === 'teacher'
                      ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode === 'teacher' ? (
                    <ShieldCheck className="w-4 h-4 text-white" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>教員モード</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
