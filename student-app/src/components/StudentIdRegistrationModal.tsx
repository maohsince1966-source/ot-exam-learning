import React, { useState } from 'react';
import { StudentLocalProfile } from '../types';
import { saveStudentLocalProfile } from '../services/studentRosterService';
import { GraduationCap, X, Check, Info } from 'lucide-react';

interface StudentIdRegistrationModalProps {
  initialProfile?: StudentLocalProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (profile: StudentLocalProfile) => void;
  isRequired?: boolean;
}

export const StudentIdRegistrationModal: React.FC<StudentIdRegistrationModalProps> = ({
  initialProfile,
  isOpen,
  onClose,
  onSaved,
  isRequired = false
}) => {
  const [studentId, setStudentId] = useState(initialProfile?.studentId || '');
  const [grade, setGrade] = useState<number>(initialProfile?.grade || 3);
  const [name, setName] = useState(initialProfile?.name || '');
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setStudentId(initialProfile?.studentId || '');
      setGrade(initialProfile?.grade || 3);
      setName(initialProfile?.name || '');
      setError(null);
    }
  }, [isOpen, initialProfile]);

  if (!isOpen) return null;

  const handleSave = (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const cleanId = studentId.trim().toUpperCase();
    if (!cleanId) {
      setError('学籍番号を入力してください（必須）');
      return;
    }

    const profile: StudentLocalProfile = {
      studentId: cleanId,
      grade,
      name: name.trim() || undefined
    };

    saveStudentLocalProfile(profile);

    if (onSaved) {
      onSaved(profile);
    } else {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <div 
        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative"
      >
        {!isRequired && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center space-x-3 mb-4">
          <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">学籍情報の登録・変更</h2>
            <p className="text-xs text-slate-500">小テストの受験・配信受信に使用されます</p>
          </div>
        </div>

        <div className="bg-teal-50/60 border border-teal-100 rounded-xl p-3 mb-5 text-xs text-teal-900 flex items-start gap-2">
          <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
          <span>
            学年や学籍番号を端末に保存することで、教員から指定配信された小テストが「今日のテスト」に自動表示され、解答結果が正しく提出されます。
          </span>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              学籍番号 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="例: OT2401, 2401 など"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              学年 <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(g)}
                  className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                    grade === g
                      ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {g}年生
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              氏名 <span className="text-slate-400 font-normal">（任意）</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 山田 太郎"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          {error && (
            <p className="text-xs text-rose-600 font-bold bg-rose-50 p-2.5 rounded-lg border border-rose-100">
              {error}
            </p>
          )}

          <div className="pt-2 flex items-center justify-end space-x-2">
            {!isRequired && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                キャンセル
              </button>
            )}
            <button
              type="submit"
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5"
            >
              <Check className="w-4 h-4" />
              <span>端末に保存する</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
