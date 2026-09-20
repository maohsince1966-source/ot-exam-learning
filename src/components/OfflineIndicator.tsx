import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true
  );
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 3500);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !showReconnected) {
    return null;
  }

  if (showReconnected) {
    return (
      <div 
        id="pwa-online-reconnected-banner"
        className="bg-emerald-600 text-white text-xs py-1.5 px-4 text-center font-bold flex items-center justify-center gap-2 shadow-sm animate-in fade-in duration-200"
      >
        <Wifi className="w-3.5 h-3.5" />
        <span>インターネット接続が回復しました。クラウド同期を再開します。</span>
      </div>
    );
  }

  return (
    <div 
      id="pwa-offline-banner"
      className="bg-amber-600 text-white text-xs py-1.5 px-4 text-center font-bold flex items-center justify-center gap-2 shadow-sm animate-in fade-in duration-200"
    >
      <WifiOff className="w-3.5 h-3.5" />
      <span>オフラインモードで動作中。端末内の過去問演習をご利用いただけます。</span>
    </div>
  );
};
