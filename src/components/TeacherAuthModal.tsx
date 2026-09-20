import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Lock, KeyRound, AlertCircle, Eye, EyeOff, X, CheckCircle2, Settings } from 'lucide-react';

interface TeacherAuthModalProps {
  isOpen: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

export const TEACHER_PASSCODE_STORAGE_KEY = 'ot_teacher_passcode_v1';
export const DEFAULT_TEACHER_PASSCODE = 'ot2026'; // 6-digit alphanumeric default

export function getStoredTeacherPasscode(): string {
  try {
    const saved = localStorage.getItem(TEACHER_PASSCODE_STORAGE_KEY);
    if (saved && saved.trim().length === 6) {
      return saved.trim();
    }
  } catch {
    // fallback
  }
  return DEFAULT_TEACHER_PASSCODE;
}

export function saveTeacherPasscode(code: string): boolean {
  if (/^[a-zA-Z0-9]{6}$/.test(code)) {
    try {
      localStorage.setItem(TEACHER_PASSCODE_STORAGE_KEY, code);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export const TeacherAuthModal: React.FC<TeacherAuthModalProps> = ({
  isOpen,
  onSuccess,
  onClose
}) => {
  const [passcode, setPasscode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isChangingPasscode, setIsChangingPasscode] = useState(false);
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmNewPasscode, setConfirmNewPasscode] = useState('');
  const [changeSuccessMessage, setChangeSuccessMessage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPasscode('');
      setErrorMessage(null);
      setIsChangingPasscode(false);
      setNewPasscode('');
      setConfirmNewPasscode('');
      setChangeSuccessMessage(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentExpected = getStoredTeacherPasscode();

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const entered = passcode.trim();
    if (entered.toLowerCase() === currentExpected.toLowerCase()) {
      onSuccess();
    } else {
      setErrorMessage('パスコードが正しくありません。');
      setPasscode('');
      inputRef.current?.focus();
    }
  };

  const handleChangePasscode = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setChangeSuccessMessage(null);

    const enteredOld = passcode.trim();
    if (enteredOld.toLowerCase() !== currentExpected.toLowerCase()) {
      setErrorMessage('現在のパスコードが正しくありません。');
      return;
    }

    const trimmedNew = newPasscode.trim();
    if (!/^[a-zA-Z0-9]{6}$/.test(trimmedNew)) {
      setErrorMessage('新しいパスコードは半角英数字ちょうど6桁で指定してください。');
      return;
    }

    if (trimmedNew !== confirmNewPasscode.trim()) {
      setErrorMessage('新しいパスコードの確認入力が一致しません。');
      return;
    }

    const saved = saveTeacherPasscode(trimmedNew);
    if (saved) {
      setChangeSuccessMessage('パスコードを変更しました。新しいパスコードでログインしてください。');
      setIsChangingPasscode(false);
      setPasscode('');
      setNewPasscode('');
      setConfirmNewPasscode('');
    } else {
      setErrorMessage('保存に失敗しました。');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">教員モード認証</h3>
              <p className="text-xs text-slate-500">教員専用機能へのアクセスロック</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            title="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Change success alert */}
        {changeSuccessMessage && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{changeSuccessMessage}</span>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {!isChangingPasscode ? (
          /* Enter Passcode Mode */
          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                  英数字6桁のパスコード
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsChangingPasscode(true);
                    setErrorMessage(null);
                    setChangeSuccessMessage(null);
                  }}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                >
                  <Settings className="w-3 h-3" />
                  パスコードを変更
                </button>
              </div>

              <div className="relative">
                <input
                  ref={inputRef}
                  type={showPassword ? 'text' : 'password'}
                  maxLength={6}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                  placeholder="半角英数字6桁"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-center text-lg font-mono tracking-widest text-slate-900 transition-all uppercase placeholder:normal-case placeholder:tracking-normal placeholder:text-sm placeholder:font-sans"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center justify-end px-1">
                <span className="text-[11px] text-slate-400 font-mono">
                  {passcode.length} / 6
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={passcode.length !== 6}
                className="px-5 py-2 text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                認証して切替
              </button>
            </div>
          </form>
        ) : (
          /* Change Passcode Mode */
          <form onSubmit={handleChangePasscode} className="space-y-3.5">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                現在のパスコード (6桁)
              </label>
              <input
                type="password"
                maxLength={6}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="現在のコード"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl text-sm font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                新しい英数字6桁パスコード
              </label>
              <input
                type="text"
                maxLength={6}
                value={newPasscode}
                onChange={(e) => setNewPasscode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                placeholder="半角英数字6桁 (例: te2026)"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl text-sm font-mono tracking-wider"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                新しいパスコード（確認のため再入力）
              </label>
              <input
                type="password"
                maxLength={6}
                value={confirmNewPasscode}
                onChange={(e) => setConfirmNewPasscode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                placeholder="もう一度入力"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl text-sm font-mono tracking-wider"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsChangingPasscode(false);
                  setErrorMessage(null);
                }}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                戻る
              </button>
              <button
                type="submit"
                disabled={!passcode || newPasscode.length !== 6 || confirmNewPasscode.length !== 6}
                className="px-5 py-2 text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl shadow-xs transition-colors"
              >
                パスコードを更新
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
