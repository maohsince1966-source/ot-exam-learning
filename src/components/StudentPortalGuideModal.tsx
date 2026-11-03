import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  QrCode,
  Smartphone,
  ExternalLink,
  BookOpen,
  Send,
  Share2,
  Download,
  Globe,
  Settings2
} from 'lucide-react';
import { generateTestQRCodeDataUrl, getPublicDistributionOrigin, OFFICIAL_SHARED_ORIGIN } from '../utils/shareTest';

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
  // Tabs: 'portal' (General Student Portal) or 'direct-test' (Direct to latest test)
  const [activeTab, setActiveTab] = useState<'portal' | 'direct-test'>('portal');

  // Domain selection: default to OFFICIAL_SHARED_ORIGIN (or smart resolved public origin)
  const defaultOrigin = getPublicDistributionOrigin();
  const [selectedOrigin, setSelectedOrigin] = useState<string>(defaultOrigin);
  const [showDomainSettings, setShowDomainSettings] = useState(false);
  const [customOriginInput, setCustomOriginInput] = useState('');

  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(true);

  // Normalize base URL
  const cleanOrigin = selectedOrigin.replace(/\/+$/, '');
  
  // 1. General Student Portal URL (No code query - opens complete student portal)
  const studentPortalUrl = `${cleanOrigin}/?role=student`;

  // 2. Direct Test URL (Takes student straight to the active test)
  const testDirectUrl = latestTestCode ? `${cleanOrigin}/?role=student&code=${latestTestCode}` : '';

  // Currently active target URL based on selected tab
  const currentTargetUrl = (activeTab === 'direct-test' && testDirectUrl) ? testDirectUrl : studentPortalUrl;

  // Generate QR code whenever the target URL changes
  useEffect(() => {
    let isMounted = true;
    setLoadingQr(true);
    (async () => {
      try {
        const qr = await generateTestQRCodeDataUrl(currentTargetUrl);
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
  }, [currentTargetUrl]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(currentTargetUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = currentTargetUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
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
    const textLines = [
      '【作業療法士 国家試験対策 学生用ポータル案内】',
      '以下のURLまたはQRコードからアクセスして、過去問演習や小テストを受験してください。',
      '',
      `▼ 学生専用ポータルURL（過去問4,154問演習・小テスト受講）:`,
      studentPortalUrl
    ];

    if (latestTestCode) {
      textLines.push(
        '',
        `▼ 本日配信中の小テスト直接受講リンク:`,
        testDirectUrl,
        `▼ 小テスト参加コード: ${latestTestCode} (${latestTestTitle || '配信中テスト'})`
      );
    }

    textLines.push(
      '',
      '※各自のスマートフォン（Safari/Chrome）またはPCのブラウザで直接利用できます。',
      '※教員管理機能は非表示の学生専用画面となります。'
    );

    const fullMessage = textLines.join('\n');

    try {
      await navigator.clipboard.writeText(fullMessage);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2500);
    } catch {}
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = activeTab === 'direct-test' 
      ? `OT-Test-QR-${latestTestCode || 'quiz'}.png` 
      : 'OT-Student-Portal-QR.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl space-y-4 border border-slate-200 animate-fade-in max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-600/20">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black tracking-wider uppercase text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                  学生配布用案内
                </span>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  正式配布版 (ais-pre)
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                学生用ポータル案内（URL ＆ QRコード）
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

        {/* Tab Selection: General Portal vs Specific Test */}
        <div className="flex p-1 bg-slate-100 rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('portal')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'portal'
                ? 'bg-white text-teal-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-teal-600" />
            <span>① 学生ポータル総合URL（通年・過去問演習）</span>
          </button>

          {latestTestCode && (
            <button
              type="button"
              onClick={() => setActiveTab('direct-test')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'direct-test'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>② 配信中テスト直通（{latestTestCode}）</span>
            </button>
          )}
        </div>

        {/* Description Banner based on Tab */}
        {activeTab === 'portal' ? (
          <div className="bg-teal-50/90 border border-teal-200 rounded-2xl p-3.5 text-xs text-teal-950 leading-relaxed space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-teal-900">
              <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse shrink-0" />
              <span>【推奨】学生専用ポータル（総合・日常学習）</span>
            </div>
            <p className="text-[11px] text-teal-800 leading-normal">
              過去問4,154問の演習、分野別分析、配信された小テストへの参加がすべて行える学生専用の総合ポータルです。教員管理メニュー（問題編集・暗証番号等）は完全に非表示になります。
            </p>
          </div>
        ) : (
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 text-xs text-indigo-950 leading-relaxed space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-indigo-900">
              <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
              <span>本日配信中テスト直通: {latestTestTitle || '小テスト'}</span>
            </div>
            <p className="text-[11px] text-indigo-800 leading-normal">
              このQRコードまたはリンクを開くと、他のメニューを経由せず直接この小テストの解答画面が開始されます。授業内の小テスト一斉実施に最適です。
            </p>
          </div>
        )}

        {/* QR Code Display Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center text-center space-y-3">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            {loadingQr ? (
              <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-400">
                QRコード生成中...
              </div>
            ) : qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={activeTab === 'portal' ? '学生ポータル総合QRコード' : '小テスト直通QRコード'}
                className="w-48 h-48 object-contain rounded-lg"
              />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-400">
                QR生成エラー
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <p className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
              <QrCode className="w-3.5 h-3.5 text-teal-600" />
              {activeTab === 'portal'
                ? '学生スマホでかざすと「学生ポータル」が開きます'
                : '学生スマホでかざすと直接「小テスト解答」が始まります'}
            </p>
            {qrDataUrl && (
              <button
                type="button"
                onClick={handleDownloadQr}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline flex items-center gap-1 ml-2 cursor-pointer"
                title="プロジェクター投影スライドやプリント貼り付け用に保存"
              >
                <Download className="w-3 h-3" />
                画像保存
              </button>
            )}
          </div>
        </div>

        {/* Target URL Input with 1-click Copy */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700">
              {activeTab === 'portal' ? '学生配布用ポータルURL:' : '小テスト直接アクセスURL:'}
            </label>
            <button
              type="button"
              onClick={() => setShowDomainSettings(!showDomainSettings)}
              className="text-[11px] font-medium text-slate-500 hover:text-indigo-600 flex items-center gap-1 cursor-pointer"
            >
              <Settings2 className="w-3 h-3" />
              <span>ドメイン確認・変更</span>
            </button>
          </div>

          {/* Domain Settings dropdown if toggled */}
          {showDomainSettings && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs animate-fade-in">
              <span className="font-bold text-slate-700 flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-indigo-600" />
                案内URLの配信ドメイン選択:
              </span>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="domainOrigin"
                    checked={selectedOrigin === OFFICIAL_SHARED_ORIGIN}
                    onChange={() => setSelectedOrigin(OFFICIAL_SHARED_ORIGIN)}
                    className="text-teal-600 focus:ring-teal-500"
                  />
                  <span className="font-mono text-[11px] text-slate-800">
                    {OFFICIAL_SHARED_ORIGIN} <strong className="text-emerald-700 text-[10px]">（正式配布版 ais-pre・推奨）</strong>
                  </span>
                </label>
                {window.location.origin !== OFFICIAL_SHARED_ORIGIN && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="domainOrigin"
                      checked={selectedOrigin === window.location.origin}
                      onChange={() => setSelectedOrigin(window.location.origin)}
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    <span className="font-mono text-[11px] text-slate-800">
                      {window.location.origin} <span className="text-slate-500 text-[10px]">（現在のブラウザ環境）</span>
                    </span>
                  </label>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={currentTargetUrl}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 select-all"
            />
            <button
              type="button"
              onClick={handleCopyUrl}
              className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
            >
              {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedUrl ? '完了' : 'URLコピー'}</span>
            </button>
          </div>
        </div>

        {/* Latest test code info banner if on direct-test tab */}
        {activeTab === 'direct-test' && latestTestCode && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider bg-indigo-100 px-1.5 py-0.5 rounded">
                参加コード入力でも受講可能
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-slate-500">6桁テストコード:</span>
                <span className="font-mono font-black text-base text-indigo-900 tracking-wider">
                  {latestTestCode}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'コピー済' : 'コードコピー'}</span>
            </button>
          </div>
        )}

        {/* Bottom Action Buttons */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <a
            href={currentTargetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
            <span>新しいタブで学生画面を確認</span>
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
