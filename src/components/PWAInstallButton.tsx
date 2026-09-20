import React, { useState, useEffect } from 'react';
import { Download, Share2, PlusSquare, Check, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  useEffect(() => {
    // Check if already installed / running in standalone mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) {
      setIsInstalled(true);
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    // Listen for beforeinstallprompt (Chrome, Android, Edge, Desktop)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setInstallSuccess(true);
      setTimeout(() => setInstallSuccess(false), 4000);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (!deferredPrompt) {
      // If deferredPrompt is not available (e.g. browser doesn't support or already prompted),
      // show helpful guide
      setShowIOSModal(true);
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setInstallSuccess(true);
        setIsInstalled(true);
        setTimeout(() => setInstallSuccess(false), 4000);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.error('PWA install prompt error:', err);
    }
  };

  // If already running standalone, display a subtle "App Mode" badge or hide
  if (isInstalled) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        id="pwa-install-header-btn"
        onClick={handleInstallClick}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all shadow-xs ${
          installSuccess
            ? 'bg-emerald-600 text-white'
            : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-sm'
        } ${className}`}
        title="アプリとして端末にインストール（オフライン対応・全画面表示）"
      >
        {installSuccess ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-100" />
            <span>インストール完了</span>
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5" />
            <span>アプリを保存</span>
          </>
        )}
      </button>

      {/* iOS or Manual Add to Home Screen Instructions Modal */}
      {showIOSModal && (
        <div 
          id="pwa-ios-instructions-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 relative space-y-4">
            <button
              type="button"
              id="pwa-close-instructions-modal-btn"
              onClick={() => setShowIOSModal(false)}
              className="absolute top-3.5 right-3.5 p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">ホーム画面に追加してアプリ化</h3>
                <p className="text-[11px] text-slate-500">
                  全画面で快適に動作し、オフラインでも学習できます
                </p>
              </div>
            </div>

            <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700">
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  ブラウザのメニューまたは下の <span className="font-bold text-slate-900 inline-flex items-center gap-0.5 px-1 bg-white border rounded"><Share2 className="w-3 h-3 text-sky-600 inline" /> 共有</span> ボタンをタップ
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  メニューから <span className="font-bold text-slate-900 inline-flex items-center gap-0.5 px-1 bg-white border rounded"><PlusSquare className="w-3 h-3 text-slate-700 inline" /> ホーム画面に追加</span> を選択
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  右上の <span className="font-bold text-teal-700">「追加」</span> をタップすると完了です！
                </div>
              </div>
            </div>

            <button
              type="button"
              id="pwa-instructions-confirm-btn"
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors text-center"
            >
              わかりました
            </button>
          </div>
        </div>
      )}
    </>
  );
};
