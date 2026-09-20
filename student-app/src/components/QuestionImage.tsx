import React, { useState, useEffect } from 'react';
import { 
  ImageIcon, 
  ExternalLink, 
  RotateCw, 
  Maximize2, 
  X, 
  AlertCircle,
  ShieldAlert
} from 'lucide-react';
import { getImageUrlFallbacks, isGoogleDriveUrl } from '../utils/imageHelper';

interface QuestionImageProps {
  imageUrl?: string;
  alt?: string;
  className?: string;
  containerClassName?: string;
  questionId?: string;
  maxHeightClass?: string;
}

export const QuestionImage: React.FC<QuestionImageProps> = ({
  imageUrl,
  alt = '問題図・画像',
  className = '',
  containerClassName = '',
  questionId,
  maxHeightClass = 'max-h-72'
}) => {
  const [candidates, setCandidates] = useState<string[]>([]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  useEffect(() => {
    if (!imageUrl) {
      setCandidates([]);
      setHasError(false);
      setIsLoading(false);
      return;
    }

    const list = getImageUrlFallbacks(imageUrl);
    setCandidates(list);
    setCandidateIndex(0);
    setIsLoading(true);
    setHasError(false);
  }, [imageUrl]);

  if (!imageUrl) {
    return null;
  }

  const currentSrc = candidates[candidateIndex] || imageUrl;
  const isGdrive = isGoogleDriveUrl(imageUrl);

  const handleError = () => {
    if (candidateIndex < candidates.length - 1) {
      setCandidateIndex(prev => prev + 1);
      setIsLoading(true);
    } else {
      setIsLoading(false);
      setHasError(true);
    }
  };

  const handleRetry = () => {
    setCandidateIndex(0);
    setHasError(false);
    setIsLoading(true);
  };

  const handleForceProxy = () => {
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}&t=${Date.now()}`;
    setCandidates([proxyUrl]);
    setCandidateIndex(0);
    setHasError(false);
    setIsLoading(true);
  };

  return (
    <>
      <div className={`my-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl ${containerClassName}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
            <span>問題図・画像 {questionId && <span className="font-mono text-slate-400">({questionId})</span>}</span>
          </div>

          {!hasError && !isLoading && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsZoomOpen(true)}
                className="text-[11px] font-medium text-slate-600 hover:text-indigo-600 bg-white hover:bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                title="画像を拡大表示"
              >
                <Maximize2 className="w-3 h-3" />
                <span>拡大表示</span>
              </button>

              <a
                href={imageUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-medium text-slate-600 hover:text-indigo-600 bg-white hover:bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors shadow-2xs"
                title="新しいタブで原画を開く"
              >
                <ExternalLink className="w-3 h-3" />
                <span>別タブ</span>
              </a>
            </div>
          )}
        </div>

        {isLoading && !hasError && (
          <div className="w-full h-36 bg-slate-200/70 animate-pulse rounded-xl flex items-center justify-center text-xs text-slate-500 gap-2">
            <RotateCw className="w-4 h-4 animate-spin text-indigo-600" />
            <span>画像を読み込み中...</span>
          </div>
        )}

        {!hasError && (
          <div className={`relative flex items-center justify-center ${isLoading ? 'hidden' : 'block'}`}>
            <img
              src={currentSrc}
              alt={alt}
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
              onLoad={() => setIsLoading(false)}
              onError={handleError}
              onClick={() => setIsZoomOpen(true)}
              className={`rounded-xl ${maxHeightClass} max-w-full object-contain bg-white border border-slate-200 shadow-2xs cursor-zoom-in transition-transform hover:scale-[1.01] ${className}`}
            />
          </div>
        )}

        {hasError && (
          <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-3 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-amber-900">画像を直接読み込めませんでした</p>
                <p className="text-amber-800 leading-relaxed">
                  {isGdrive ? (
                    <>
                      Googleドライブの共有設定が<strong>「制限付き」</strong>になっている可能性があります。
                    </>
                  ) : (
                    '外部サーバー側のアクセス制限やURLの有効期限が切れている可能性があります。'
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200/60">
              <a
                href={imageUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>新しいタブで画像を開く</span>
              </a>

              <button
                type="button"
                onClick={handleForceProxy}
                className="px-2.5 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-medium rounded-lg flex items-center gap-1 transition-colors"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
                <span>サーバー経由で再読み込み</span>
              </button>

              <button
                type="button"
                onClick={handleRetry}
                className="px-2.5 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-medium rounded-lg flex items-center gap-1 transition-colors"
              >
                <RotateCw className="w-3.5 h-3.5 text-amber-700" />
                <span>再試行</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {isZoomOpen && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsZoomOpen(false)}
        >
          <div 
            className="relative bg-white rounded-2xl max-w-4xl max-h-[90vh] p-4 flex flex-col items-center overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-3 mb-2 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-indigo-600" />
                <span>{questionId ? `問題図: ${questionId}` : '問題画像（拡大表示）'}</span>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>元画像を開く</span>
                </a>
                <button
                  type="button"
                  onClick={() => setIsZoomOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-auto max-h-[75vh] w-full flex items-center justify-center p-2">
              <img
                src={currentSrc}
                alt={alt}
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                className="max-w-full max-h-[72vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
