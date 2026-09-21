import React, { useState, useEffect } from 'react';
import { X, Copy, Check, QrCode, Smartphone, ExternalLink, GraduationCap, ShieldCheck, Share2 } from 'lucide-react';
import { generateTestQRCodeDataUrl } from '../utils/shareTest';

interface StudentPortalGuideModalProps {
  onClose: () => void;
  latestTestCode?: string;
  latestTestTitle?: string;
}

export const StudentPortalGuideModal: React.FC<StudentPortalGuideModalProps> = ({
  onClose,
  latestTestCode,
  latestTestTitle
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(true);
  const [selectedPortalMode, setSelectedPortalMode] = useState<'render' | 'current'>('render');

  const origin = window.location.origin;
  const pathname = window.location.pathname;

  // Render standalone portal URL or current origin URL
  const renderBaseUrl = 'https://ot-exam-learning.onrender.com';
  const currentBaseUrl = `${origin}${pathname}?role=student`;

  const studentUrl = selectedPortalMode === 'render'
    ? (latestTestCode ? `${renderBaseUrl}/?code=${latestTestCode}` : renderBaseUrl)
    : (latestTestCode ? `${currentBaseUrl}&code=${latestTestCode}` : currentBaseUrl);

  useEffect(() => {
    let isMounted = true;
    setLoadingQr(true);
    (async () => {
      try {
        const qr = await generateTestQRCodeDataUrl(studentUrl);
        if (isMounted) {
          setQrDataUrl(qr);
        }
      } catch (err) {
        console.warn('Failed to generate student portal QR', err);
      } finally {
        if (isMounted) setLoadingQr(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [studentUrl]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(studentUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleCopyCode = async () => {
    if (!latestTestCode) return;
    try {
      await navigator.clipboard.writeText(latestTestCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {}
  };

  const handleCopyMessage = async () => {
    const text = [
      '【作業療法士 国家試験対策 学生用ポータル】',
      '以下のリンクまたはQRコードからアクセスして、過去問演習や小テストを受験してください。',
      '',
      `▼ 学生専用アクセスURL:\n${studentUrl}`,
      latestTestCode ? `\n▼ 本日の小テスト参加コード:\n${latestTestCode} (${latestTestTitle || '配信中テスト'})` : '',
      '',
      '※各自のスマートフォンまたはPCのブラウザで直接利用できます。'
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2500);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl space-y-5 border border-slate-200 animate-fade-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-600/20">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-black tracking-wider uppercase text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                学生配布用アクセス案内
              </span>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                学生専用ポータル URL ＆ QRコード
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Portal Host Selector */}
        <div className="bg-slate-100 p-1.5 rounded-2xl flex items-center gap-1.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setSelectedPortalMode('render')}
            className={`flex-1 py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              selectedPortalMode === 'render'
                ? 'bg-white text-teal-800 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>学生専用サイト (Render)</span>
            <span className="bg-teal-100 text-teal-800 text-[10px] px-1.5 py-0.2 rounded font-mono">推奨</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedPortalMode('current')}
            className={`flex-1 py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              selectedPortalMode === 'current'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>本アプリの学生モード</span>
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          学生は教員画面を通さず、各自のスマートフォンやPCから独立して本ポータルにアクセスできます。授業のスクリーンにQRコードを投影するか、URLを学生へ配布してください。
        </p>

        {/* QR Code Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center text-center space-y-3">
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            {loadingQr ? (
              <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-400">
                QRコード生成中...
              </div>
            ) : qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="学生用ポータルQRコード"
                className="w-48 h-48 object-contain rounded-lg"
              />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-400">
                QR生成エラー
              </div>
            )}
          </div>
          <p className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
            <QrCode className="w-3.5 h-3.5 text-teal-600" />
            学生のスマホカメラでかざすと「学生専用画面」が直接開きます
          </p>
        </div>

        {/* Latest test code info if active */}
        {latestTestCode && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider bg-indigo-100 px-1.5 py-0.5 rounded">
                現在配信中の小テスト
              </span>
              <h4 className="text-xs font-bold text-slate-800 mt-1 line-clamp-1">
                {latestTestTitle || '小テスト'}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-slate-500">参加コード:</span>
                <span className="font-mono font-black text-base text-indigo-900 tracking-wider">
                  {latestTestCode}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'コピー済' : 'コードをコピー'}</span>
            </button>
          </div>
        )}

        {/* Standalone Student URL */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700">
            学生専用ポータル URL（教員機能が非表示の独立画面）:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={studentUrl}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 select-all"
            />
            <button
              type="button"
              onClick={handleCopyUrl}
              className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
            >
              {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedUrl ? '完了' : 'URLコピー'}</span>
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <a
            href={studentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
            <span>新しいタブで学生画面を開く</span>
          </a>

          <button
            type="button"
            onClick={handleCopyMessage}
            className="px-4 py-2.5 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {copiedMsg ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copiedMsg ? '案内文をコピーしました！' : '連絡網・掲示用メッセージをコピー'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
