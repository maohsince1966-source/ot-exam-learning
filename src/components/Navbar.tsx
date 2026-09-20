import React from 'react';
import { GraduationCap, BookOpen, ShieldCheck, Sparkles, CheckCircle2, Lock } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface NavbarProps {
  mode: 'student' | 'teacher';
  onToggleMode: (mode: 'student' | 'teacher') => void;
  pendingTestsCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({ mode, onToggleMode, pendingTestsCount }) => {
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
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-teal-600 text-white rounded shadow-2xs">
                  v1.0 正式版
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden md:block">過去問演習 ＆ 教員配信小テスト</p>
            </div>
          </div>

          {/* Right Action Controls: PWA Install & Mode Switcher */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* PWA Install Button */}
            <PWAInstallButton />

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
                {pendingTestsCount > 0 && mode === 'teacher' && (
                  <span className="ml-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
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

            {/* Mode badge for clear orientation */}
            <div className="hidden lg:flex items-center">
              {mode === 'student' ? (
                <div className="flex items-center text-xs font-medium text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  問題解答中
                </div>
              ) : (
                <div className="flex items-center text-xs font-medium text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                  作問・小テスト配信中
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
