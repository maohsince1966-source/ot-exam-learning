import React, { useState } from 'react';
import { StudentLocalProfile } from '../types';
import { 
  saveStudentLocalProfile, 
  saveStudentsToRoster, 
  deleteStudentFromRoster, 
  getStudentProfile 
} from '../services/studentRosterService';
import { GraduationCap, X, Check, Info, Loader2 } from 'lucide-react';

interface StudentIdRegistrationModalProps {
  initialProfile?: StudentLocalProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (profile: StudentLocalProfile) => void;
  onSave?: (profile: StudentLocalProfile) => void;
  isRequired?: boolean; // If true, cannot close without registering
}

export const StudentIdRegistrationModal: React.FC<StudentIdRegistrationModalProps> = ({
  initialProfile,
  isOpen,
  onClose,
  onSaved,
  onSave,
  isRequired = false
}) => {
  const currentSaved = getStudentProfile();
  const baseProfile = initialProfile || currentSaved;
  const [studentId, setStudentId] = useState(baseProfile?.studentId || '');
  const [grade, setGrade] = useState<number>(baseProfile?.grade || 1);
  const [name, setName] = useState(baseProfile?.name || '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state when initialProfile changes or modal opens
  React.useEffect(() => {
    if (isOpen) {
      const p = initialProfile || getStudentProfile();
      setStudentId(p?.studentId || '');
      setGrade(p?.grade || 1);
      setName(p?.name || '');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, initialProfile]);

  if (!isOpen) return null;

  const handleSave = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const cleanId = String(studentId || '').normalize('NFKC').trim().toUpperCase();
    if (!cleanId) {
      setError('学籍番号を入力してください（必須）');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const profile: StudentLocalProfile = {
      studentId: cleanId,
      grade,
      name: name.trim() || undefined
    };

    try {
      // 1. If student ID changed from a previous ID on this device, delete the old ID from the roster
      const oldId = (initialProfile?.studentId || getStudentProfile()?.studentId || '').trim().toUpperCase();
      if (oldId && oldId !== cleanId) {
        deleteStudentFromRoster(oldId).catch(err => {
          console.warn('Failed to delete old student roster entry:', err);
        });
      }

      // 2. Immediately persist to localStorage for instant student mode usage
      saveStudentLocalProfile(profile);

      // Dispatch window event for instant same-page reactivity
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('student_profile_updated', { detail: profile }));
        window.dispatchEvent(new CustomEvent('student_roster_updated'));
      }

      // 3. Synchronize to teacher roster (Server API + Cloud Firestore)
      await saveStudentsToRoster({
        studentId: cleanId,
        grade,
        name: name.trim() || undefined,
        notes: '学生端末より自己登録',
        registeredAt: new Date().toISOString()
      }).catch(err => {
        console.warn('Roster sync notice:', err);
      });

      // 4. Notify parent callback immediately
      const callback = onSaved || onSave;
      if (typeof callback === 'function') {
        callback(profile);
      } else {
        onClose();
      }
    } catch (err: any) {
      console.error('Failed during student ID save:', err);
      setError('学籍番号の保存に失敗しました。もう一度お試しください。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      id="student-id-registration-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div 
        id="student-id-registration-dialog"
        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative animate-in zoom-in-95 duration-150"
      >
        {!isRequired && (
          <button
            type="button"
            id="close-registration-modal-btn"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 shadow-2xs">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">学籍番号と学年の設定</h2>
            <p className="text-xs text-slate-500">
              学年ごとの小テストを自動受信・受験するための設定です
            </p>
          </div>
        </div>

        <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 mb-5 text-xs text-amber-900 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            登録した学籍番号は<strong>この端末（ブラウザ）に自動保存</strong>され、クラウド同期により次回以降のテスト受験時に自動適用されます。
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Grade selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              学年を選択 <span className="text-rose-500">*必須</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map(g => (
                <button
                  type="button"
                  key={g}
                  id={`grade-select-btn-${g}`}
                  onClick={() => setGrade(g)}
                  className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all text-center flex flex-col items-center justify-center gap-0.5 ${
                    grade === g
                      ? 'bg-teal-600 text-white border-teal-600 shadow-sm ring-2 ring-teal-600/20'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <span className="text-sm font-black">{g}年</span>
                  <span className="text-[10px] font-normal opacity-80">{g === 4 ? '国試年' : '生'}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Student ID (Required) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              学籍番号 <span className="text-rose-500">*必須</span>
            </label>
            <input
              type="text"
              id="student-id-input"
              required
              autoFocus
              placeholder="例: 000001, OT2401..."
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
                if (error) setError(null);
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white uppercase transition-all"
            />
          </div>

          {/* Student Name (Optional) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              氏名 <span className="text-slate-400 font-normal">(任意)</span>
            </label>
            <input
              type="text"
              id="student-name-input"
              placeholder="例: 山田 太郎"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all"
            />
          </div>

          {error && (
            <p className="text-xs text-rose-600 font-bold bg-rose-50 p-2.5 rounded-lg border border-rose-200">
              {error}
            </p>
          )}

          <div className="pt-2">
            <button
              type="submit"
              id="save-student-profile-btn"
              disabled={isSubmitting}
              className="w-full py-3 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-75 text-white font-bold text-sm rounded-xl shadow-sm transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>保存中...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>端末に設定を保存する</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
