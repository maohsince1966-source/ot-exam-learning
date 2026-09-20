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
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) {
      setIsInstalled(true);
    }

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

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
      setShowIOSModal(true);
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } catch {
      setShowIOSModal(true);
    }
  };

  if (isInstalled) {
    return (
      <div className={`hidden sm:flex items-center text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-xl ${className}`}>
        <Check className="w-3.5 h-3.5 mr-1" />
        <span>アプリ起動中</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={`flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer ${className}`}
        title="ホーム画面に追加してアプリとして使用"
      >
        <Download className="w-3.5 h-3.5" />
        <span>アプリをインストール</span>
      </button>

      {showIOSModal && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowIOSModal(false)}
        >
          <div 
            className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">ホーム画面に追加</h3>
                <p className="text-xs text-slate-500">ワンタップでアプリとして起動</p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600">
              {isIOS ? (
                <>
                  <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl">
                    <Share2 className="w-4 h-4 text-sky-600 shrink-0" />
                    <span>Safari下部の「共有」ボタンをタップ</span>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl">
                    <PlusSquare className="w-4 h-4 text-slate-700 shrink-0" />
                    <span>メニューから「ホーム画面に追加」を選択</span>
                  </div>
                </>
              ) : (
                <p className="p-3 bg-slate-50 rounded-xl leading-relaxed">
                  ブラウザのメニュー（右上「︙」）から<strong>「アプリをインストール」</strong>または<strong>「ホーム画面に追加」</strong>を選択してください。
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </>
  );
};
