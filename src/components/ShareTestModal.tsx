import React, { useState, useEffect } from 'react';
import {
  X,
  QrCode,
  Copy,
  Check,
  Download,
  Maximize2,
  Minimize2,
  Share2,
  MessageSquare,
  Sparkles,
  RefreshCw,
  Hash
} from 'lucide-react';
import { DeliveredTest, Question } from '../types';
import {
  saveTestToServer,
  generateTestQRCodeDataUrl,
  buildShareMessageTemplate,
  buildFallbackShareUrl
} from '../utils/shareTest';

interface ShareTestModalProps {
  test: DeliveredTest;
  questions: Question[];
  onClose: () => void;
}

export const ShareTestModal: React.FC<ShareTestModalProps> = ({
  test,
  questions,
  onClose
}) => {
  const [shareUrl, setShareUrl] = useState<string>('');
  const [testCode, setTestCode] = useState<string>(test.code || '');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [isProjectorMode, setIsProjectorMode] = useState(false);
  const [loadingQr, setLoadingQr] = useState(true);
  const [qrError, setQrError] = useState<string | null>(null);

  const initShareData = async () => {
    setLoadingQr(true);
    setQrError(null);

    try {
      // 1. Save to server to obtain short code and concise URL
      const serverResult = await saveTestToServer(test, questions);
      let targetUrl = serverResult.shareUrl;
      let generatedCode = serverResult.code;

      if (generatedCode) {
        setTestCode(generatedCode);
      } else if (test.code) {
        setTestCode(test.code);
      }

      setShareUrl(targetUrl);

      // 2. Generate QR code using the short URL
      try {
        const qr = await generateTestQRCodeDataUrl(targetUrl);
        setQrDataUrl(qr);
      } catch (qrErr: any) {
        console.warn('First QR attempt failed, trying fallback URL...', qrErr);
        // Fallback to origin with code query
        const shortOriginUrl = `${window.location.origin}/?code=${generatedCode || test.id}`;
        setShareUrl(shortOriginUrl);
        const qrFallback = await generateTestQRCodeDataUrl(shortOriginUrl);
        setQrDataUrl(qrFallback);
      }
    } catch (err: any) {
      console.error('Share generation error', err);
      // Fallback
      const fallback = buildFallbackShareUrl(test, questions);
      setShareUrl(fallback);
      try {
        const qr = await generateTestQRCodeDataUrl(fallback);
        setQrDataUrl(qr);
      } catch (e: any) {
        setQrError('問題データ量が多いためQRコードが簡略表示されています。上記のURLリンクをご利用ください。');
      }
    } finally {
      setLoadingQr(false);
    }
  };

  useEffect(() => {
    initShareData();
  }, [test, questions]);

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      const input = document.createElement('textarea');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleCopyCode = async () => {
    if (!testCode) return;
    try {
      await navigator.clipboard.writeText(testCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const handleCopyMessage = async () => {
    if (!shareUrl) return;
    const msg = buildShareMessageTemplate(test, shareUrl, testCode);
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    } catch {
      const input = document.createElement('textarea');
      input.value = msg;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    }
  };

  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `小テスト_${test.title.replace(/\s+/g, '_')}_QR.png`;
    a.click();
  };

  // If in Projector Mode (Full screen high-contrast presentation)
  if (isProjectorMode) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col items-center justify-between p-6 sm:p-10 overflow-y-auto">
        {/* Top bar in projector mode */}
        <div className="w-full max-w-4xl flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              プロジェクター・黒板投影モード
            </span>
            <span className="text-slate-300 text-sm hidden sm:inline">
              スマホのカメラでQRコードを読み取るか、テストコードを入力してください
            </span>
          </div>
          <button
            onClick={() => setIsProjectorMode(false)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <Minimize2 className="w-4 h-4" />
            <span>通常画面に戻る</span>
          </button>
        </div>

        {/* Center content */}
        <div className="my-auto flex flex-col items-center text-center max-w-3xl py-6 space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
              {test.title}
            </h1>
            <div className="flex items-center justify-center gap-3 text-slate-300 text-sm sm:text-base font-medium">
              <span className="bg-indigo-900/80 border border-indigo-500/50 text-indigo-200 px-3 py-0.5 rounded-full">
                出題数: {test.totalQuestions} 問
              </span>
              {test.category && (
                <span className="bg-slate-800 text-slate-300 px-3 py-0.5 rounded-full">
                  分野: {test.category}
                </span>
              )}
            </div>
          </div>

          {test.instructions && (
            <div className="bg-slate-900/90 border border-slate-800 text-slate-200 p-4 rounded-xl text-sm sm:text-base max-w-lg">
              💬 {test.instructions}
            </div>
          )}

          {/* Large QR code box */}
          <div className="p-4 bg-white rounded-3xl shadow-2xl inline-block border-4 border-indigo-500">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR Code"
                className="w-64 h-64 sm:w-80 sm:h-80 object-contain rounded-xl"
              />
            ) : (
              <div className="w-64 h-64 sm:w-80 sm:h-80 flex flex-col items-center justify-center text-slate-500 text-sm space-y-2">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
                <span>QRコード読み込み中...</span>
              </div>
            )}
          </div>

          {/* Test Code Box for manual entry */}
          {testCode && (
            <div className="bg-slate-900 border-2 border-indigo-400/60 rounded-2xl px-6 py-3 flex items-center space-x-4 shadow-lg">
              <span className="text-xs text-indigo-300 uppercase tracking-wider font-bold">小テスト参加コード</span>
              <span className="text-2xl sm:text-3xl font-mono font-black text-amber-300 tracking-widest">{testCode}</span>
            </div>
          )}

          <p className="text-slate-300 text-sm sm:text-base font-medium">
            📱 スマートフォンの標準カメラをかざすと、ログイン不要でそのまま受験できます
          </p>
        </div>

        {/* Footer */}
        <div className="w-full max-w-4xl text-center text-slate-500 text-xs">
          作業療法士 国家試験 演習小テストプラットフォーム
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-700 to-indigo-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Share2 className="w-5 h-5 text-indigo-200" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                学生配信用リンク・QRコード
              </h3>
              <p className="text-xs text-indigo-200">
                学生がこのQRやリンクを開くだけで、ログイン不要で小テストが開始できます
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-indigo-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Test Summary Card */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                配信テスト
              </span>
              <h4 className="text-base font-bold text-slate-900">{test.title}</h4>
              <div className="flex items-center space-x-3 text-xs text-slate-500">
                <span>出題数: <strong className="text-slate-800">{test.totalQuestions} 問</strong></span>
                {test.category && <span>分野: <strong>{test.category}</strong></span>}
              </div>
              {test.instructions && (
                <p className="text-xs text-slate-600 mt-1">
                  💬 {test.instructions}
                </p>
              )}
            </div>

            <button
              onClick={() => setIsProjectorMode(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-1.5 shrink-0 cursor-pointer"
              title="講義室のプロジェクターやモニターに大きく映します"
            >
              <Maximize2 className="w-4 h-4" />
              <span>プロジェクター投影</span>
            </button>
          </div>

          {/* Test Code Bar */}
          {testCode && (
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Hash className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-indigo-900">参加コード:</span>
                <span className="font-mono text-base font-black text-indigo-700 tracking-wider bg-white px-2.5 py-0.5 rounded-lg border border-indigo-200">
                  {testCode}
                </span>
              </div>
              <button
                onClick={handleCopyCode}
                className="px-2.5 py-1 text-[11px] bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                {copiedCode ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCode ? 'コピー済' : 'コードをコピー'}</span>
              </button>
            </div>
          )}

          {/* Dual Column: QR Code & Link Controls */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-center">
            {/* Left: QR Code display (2 cols) */}
            <div className="md:col-span-2 flex flex-col items-center text-center space-y-3">
              <div className="p-3 bg-white border-2 border-slate-200 rounded-2xl shadow-xs inline-block">
                {loadingQr ? (
                  <div className="w-44 h-44 flex flex-col items-center justify-center text-slate-400 text-xs space-y-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                    <span>QRコード生成中...</span>
                  </div>
                ) : qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="テストQRコード"
                    className="w-44 h-44 object-contain rounded-lg"
                  />
                ) : (
                  <div className="w-44 h-44 p-3 flex flex-col items-center justify-center text-slate-500 text-xs space-y-2 text-center">
                    <QrCode className="w-8 h-8 text-slate-300" />
                    <p className="text-[11px] text-slate-500 leading-tight">
                      {qrError || 'URLリンクをご利用ください'}
                    </p>
                    <button
                      onClick={initShareData}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] rounded"
                    >
                      再試行
                    </button>
                  </div>
                )}
              </div>

              {qrDataUrl && (
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    onClick={handleDownloadQR}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
                    title="QRコードを画像ファイルとして保存"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-600" />
                    <span>QR画像を保存</span>
                  </button>
                </div>
              )}
            </div>

            {/* Right: URL & Share Buttons (3 cols) */}
            <div className="md:col-span-3 space-y-4">
              {/* Option 1: Copy Link */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>① 受験用ダイレクトURL</span>
                  {copiedLink && (
                    <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 animate-pulse">
                      <Check className="w-3.5 h-3.5" /> コピー完了！
                    </span>
                  )}
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 select-all"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1 shrink-0 cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'コピー済' : 'リンクをコピー'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  LINEグループやGoogle Classroom、Teams、メールにこのURLを貼り付けて送信してください。
                </p>
              </div>

              {/* Option 2: Pre-formatted Notice Text for Classroom/LINE */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>② 連絡文面テンプレート (Classroom・LINE連絡用)</span>
                  {copiedText && (
                    <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 animate-pulse">
                      <Check className="w-3.5 h-3.5" /> 文面をコピー完了！
                    </span>
                  )}
                </label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 font-sans space-y-1">
                  <p className="font-semibold text-slate-800">
                    【作業療法士 国家試験 小テストのお知らせ】
                  </p>
                  <p>テスト名: {test.title} ({test.totalQuestions}問)</p>
                  {testCode && <p>テストコード: <strong className="font-mono text-indigo-700">{testCode}</strong></p>}
                  <p className="text-indigo-600 underline truncate">{shareUrl}</p>
                </div>
                <button
                  onClick={handleCopyMessage}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <MessageSquare className="w-3.5 h-3.5" />}
                  <span>{copiedText ? '文面をコピーしました！' : 'この案内文をすべてコピー'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Student Flow explanation */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-900 space-y-1.5">
            <p className="font-bold flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              学生側の動作について
            </p>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-emerald-800 pl-1">
              <li>学生はスマホやPCでリンクをタップ（またはQRを読み取り）するだけで、即座にこの小テストを受験できます。</li>
              <li>学生側の端末に過去問データが登録されていなくても、この小テストの問題と解説が自動で読み込まれます。</li>
              <li>カメラでQRが読みにくい場合でも、学生画面に「小テスト参加コード」を入力するだけで受験できます。</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
