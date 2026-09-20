import React from 'react';
import { GraduationCap, BookOpen, CheckCircle2 } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { StudentLocalProfile } from '../types';

interface StudentNavbarProps {
  studentProfile?: StudentLocalProfile | null;
  onOpenProfile?: () => void;
  onOpenProfileModal?: () => void;
  pendingTestsCount?: number;
}

export const StudentNavbar: React.FC<StudentNavbarProps> = ({
  studentProfile,
  onOpenProfile,
  onOpenProfileModal,
  pendingTestsCount = 0
}) => {
  const handleOpen = () => {
    if (onOpenProfile) onOpenProfile();
    else if (onOpenProfileModal) onOpenProfileModal();
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
                <span className="px-2 py-0.5 text-xs font-semibold bg-teal-50 text-teal-700 rounded-md border border-teal-200">
                  学生用ポータル
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-teal-600 text-white rounded shadow-2xs">
                  v1.0
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden md:block">過去問演習 ＆ 今日の小テスト</p>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Student ID / Grade Profile Pill */}
            {studentProfile ? (
              <button
                type="button"
                onClick={handleOpen}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium transition-colors cursor-pointer"
                title="学籍番号・学年の変更"
              >
                <span className="px-1.5 py-0.5 bg-teal-600 text-white text-[10px] font-bold rounded">
                  {studentProfile.grade}年
                </span>
                <span className="font-mono font-bold text-slate-700">
                  {studentProfile.studentId}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpen}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                学籍番号を登録
              </button>
            )}

            {/* Status indicator */}
            <div className="hidden sm:flex items-center text-xs font-medium text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              <span>学習中</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
