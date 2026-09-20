import React, { useState } from 'react';
import { Question } from '../types';
import { exportQuestionsToWordDoc } from '../services/wordExportService';
import {
  FileDown,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Settings2,
  Image as ImageIcon,
  Check
} from 'lucide-react';

interface WordExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  defaultTitle?: string;
}

export const WordExportModal: React.FC<WordExportModalProps> = ({
  isOpen,
  onClose,
  questions,
  defaultTitle = '作業療法士 国家試験 演習問題'
}) => {
  const [docTitle, setDocTitle] = useState(defaultTitle);
  const [subtitle, setSubtitle] = useState('印刷・配布用テスト');
  const [includeStudentHeader, setIncludeStudentHeader] = useState(true);
  const [embedImages, setEmbedImages] = useState(true);
  const [answerFormat, setAnswerFormat] = useState<'separate' | 'inline' | 'none'>('separate');
  const [isLoading, setIsLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [downloadedResult, setDownloadedResult] = useState<{ fileName: string } | null>(null);

  if (!isOpen) return null;

  const imageQuestionCount = questions.filter(q => Boolean(q.imageUrl)).length;

  const handleExport = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      setProgressMsg('Word文書を準備中...');

      const result = await exportQuestionsToWordDoc(
        {
          title: docTitle.trim() || '作業療法士 国家試験 演習問題',
          subtitle: subtitle.trim(),
          questions,
          includeStudentHeader,
          answerFormat,
          embedImages
        },
        (msg) => setProgressMsg(msg)
      );

      setDownloadedResult({ fileName: result.fileName });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || 'Wordファイルの出力中にエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      id="word-export-modal"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header with Word brand styling */}
        <div className="p-5 bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/10 rounded-xl flex items-center justify-center">
              <FileDown className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-1.5">
                Word（.docx）ファイル出力
              </h3>
              <p className="text-xs text-blue-200">
                選択中の問題（全{questions.length}問{imageQuestionCount > 0 ? `・画像問題${imageQuestionCount}問を含む` : ''}）をWordファイルに整形してダウンロード
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {downloadedResult ? (
            /* Success screen */
            <div className="space-y-4 py-2 text-center">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-900">Wordファイルをダウンロードしました！</h4>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-sm mx-auto">
                  パソコンのダウンロードフォルダに <strong className="text-slate-800 font-mono text-xs">{downloadedResult.fileName}</strong> が保存されました。
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-left space-y-1 text-xs text-slate-600">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Microsoft Word・iPad・一太郎でそのまま編集・印刷可能</span>
                </div>
                <p className="text-[11px] text-slate-500 pl-5">
                  Microsoft 365の契約やログインは不要です。Word上で問題の追加・削除や書式レイアウトの調整も自由に行えます。
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  type="button"
                  onClick={handleExport}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <Download className="w-4 h-4" />
                  もう一度ダウンロード
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDownloadedResult(null);
                    onClose();
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm transition-colors"
                >
                  閉じる
                </button>
              </div>
            </div>
          ) : (
            /* Form configuration screen */
            <div className="space-y-4">
              {/* Notice banner */}
              <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3 text-xs text-blue-900 flex items-start space-x-2.5">
                <FileDown className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-blue-950">Microsoftアカウントやログインは不要です</p>
                  <p className="text-[11px] text-blue-700 leading-relaxed">
                    ボタンをクリックすると、ブラウザ上で直接Wordファイル（.docx）を生成して保存します。学校・学内PCでも制限なくご利用いただけます。
                  </p>
                </div>
              </div>

              {/* Document Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ドキュメントの表題（タイトル）
                </label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="例: 第1回 作業療法学 模擬小テスト"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Document Subtitle / Notice */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  サブタイトル・注意書き
                </label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="例: 解答時間: 30分 / 各問の選択肢から正しいものを選択してください"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Answer & Explanation Layout */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5 text-slate-500" />
                  正答・解説の出力形式
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <label
                    className={`flex items-start p-2.5 rounded-xl border cursor-pointer transition-all ${
                      answerFormat === 'separate'
                        ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-500/20'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="answerFormat"
                      value="separate"
                      checked={answerFormat === 'separate'}
                      onChange={() => setAnswerFormat('separate')}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="ml-2.5">
                      <span className="text-xs font-bold text-slate-800 block">
                        問題後に「正答一覧」、次ページから「解答・解説」を出力（推奨）
                      </span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        問題文の次ページに「正答だけの一覧表」、その次のページから「各問の正答と詳細解説」を改ページして出力します。学生への配布や答え合わせに最適です。
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start p-2.5 rounded-xl border cursor-pointer transition-all ${
                      answerFormat === 'inline'
                        ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-500/20'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="answerFormat"
                      value="inline"
                      checked={answerFormat === 'inline'}
                      onChange={() => setAnswerFormat('inline')}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="ml-2.5">
                      <span className="text-xs font-bold text-slate-800 block">
                        各問題の直下に正答・解説を併記
                      </span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        復習プリントや教員用控え、解説付き資料としてそのまま印刷・確認できます。
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start p-2.5 rounded-xl border cursor-pointer transition-all ${
                      answerFormat === 'none'
                        ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-500/20'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="answerFormat"
                      value="none"
                      checked={answerFormat === 'none'}
                      onChange={() => setAnswerFormat('none')}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="ml-2.5">
                      <span className="text-xs font-bold text-slate-800 block">
                        問題用紙のみ（正答・解説なし）
                      </span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        解答や解説を一切含めず、純粋な試験問題用紙のみを出力します。
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Options */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <label className="flex items-center space-x-2.5 cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={includeStudentHeader}
                    onChange={(e) => setIncludeStudentHeader(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <span className="text-xs text-slate-700 font-medium">
                    用紙上部に「学籍番号・学年・氏名・得点」記入欄を含める
                  </span>
                </label>

                {imageQuestionCount > 0 && (
                  <label className="flex items-center space-x-2.5 cursor-pointer py-1">
                    <input
                      type="checkbox"
                      checked={embedImages}
                      onChange={(e) => setEmbedImages(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span className="text-xs text-slate-700 font-medium flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-indigo-500" />
                      問題の図・写真（全{imageQuestionCount}問）をWord内に直接埋め込む
                    </span>
                  </label>
                )}
              </div>

              {/* Document Format Specifications (Unified format per user requirement) */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 space-y-1.5">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>適用されるWord文書スタイル（標準統一仕様）:</span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-600 pl-5">
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400">•</span>
                    <span>余白: <strong>上下 25mm / 左右 20mm</strong></span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400">•</span>
                    <span>フォント: <strong>游ゴシック</strong></span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400">•</span>
                    <span>フォントサイズ: <strong>11pt</strong></span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400">•</span>
                    <span>行間: <strong>最小値（間隔 0pt）</strong></span>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="leading-relaxed">{errorMsg}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  id="start-word-export-btn"
                  onClick={handleExport}
                  disabled={isLoading || questions.length === 0}
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white font-bold text-xs rounded-xl shadow-xs hover:shadow-sm transition-all flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{progressMsg || 'Wordファイルを生成中...'}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Wordファイルをダウンロード (.docx)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
