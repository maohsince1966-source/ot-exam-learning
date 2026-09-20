import React, { useState } from 'react';
import { Question } from '../types';
import { exportQuestionsToGoogleDoc } from '../services/googleDocsService';
import { 
  FileText, 
  Printer, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  X, 
  Settings2,
  Image as ImageIcon
} from 'lucide-react';

interface GoogleDocsExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  defaultTitle?: string;
}

export const GoogleDocsExportModal: React.FC<GoogleDocsExportModalProps> = ({
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
  const [createdDoc, setCreatedDoc] = useState<{ docId: string; docUrl: string } | null>(null);

  if (!isOpen) return null;

  const imageQuestionCount = questions.filter(q => Boolean(q.imageUrl)).length;

  const handleExport = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      setProgressMsg('準備中...');

      const result = await exportQuestionsToGoogleDoc(
        {
          title: docTitle.trim() || '作業療法士 国家試験 演習問題',
          subtitle: subtitle.trim(),
          questions,
          includeAnswersAndExplanations: answerFormat !== 'none',
          separateAnswerKeyAtEnd: answerFormat === 'separate',
          includeStudentHeader,
          embedImages
        },
        (msg) => setProgressMsg(msg)
      );

      setCreatedDoc(result);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || 'Googleドキュメントの出力中にエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Printer className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-1.5">
                Googleドキュメントへ印刷用出力
              </h3>
              <p className="text-xs text-blue-100">
                選択中の問題（全{questions.length}問{imageQuestionCount > 0 ? `・画像問題${imageQuestionCount}問を含む` : ''}）を用紙印刷向けに整形して出力します
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
          {createdDoc ? (
            /* Success screen */
            <div className="space-y-4 py-2 text-center">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-900">Googleドキュメントを作成しました！</h4>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-sm mx-auto">
                  Google Drive内に問題集が生成されました。図・写真も問題文内に直接埋め込まれており、そのままA4印刷や共有が可能です。
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href={createdDoc.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Googleドキュメントを開く
                  <ExternalLink className="w-3.5 h-3.5 ml-0.5" />
                </a>
                <button
                  onClick={() => {
                    setCreatedDoc(null);
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
              {/* Document Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ドキュメントの表題（タイトル）
                </label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="例: 第1回 身体障害作業療法学 模擬小テスト"
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
                  placeholder="例: 制限時間30分 / 教室配布・確認用プリント"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Printing Options */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Settings2 className="w-4 h-4 text-blue-600" />
                  印刷・レイアウト設定
                </span>

                {/* Student header checkbox */}
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeStudentHeader}
                    onChange={(e) => setIncludeStudentHeader(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-slate-700 font-medium">
                    用紙の先頭に「学籍番号・学年・氏名・得点記入欄」を含める
                  </span>
                </label>

                {/* Image embedding option */}
                {imageQuestionCount > 0 && (
                  <label className="flex items-center space-x-2.5 cursor-pointer bg-blue-50/60 p-2 rounded-lg border border-blue-100">
                    <input
                      type="checkbox"
                      checked={embedImages}
                      onChange={(e) => setEmbedImages(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <span className="text-blue-900 font-bold flex items-center gap-1">
                        <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                        画像問題の図・写真をドキュメント内に直接埋め込む ({imageQuestionCount}問)
                      </span>
                      <span className="text-[11px] text-blue-700 block mt-0.5">
                        A4用紙サイズに合わせて自動リサイズし、問題文の直下に配置します
                      </span>
                    </div>
                  </label>
                )}

                {/* Answer format radio options */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200">
                  <span className="block font-semibold text-slate-700 mb-1">
                    正答・解説の出力方法:
                  </span>

                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="answerFormat"
                      value="separate"
                      checked={answerFormat === 'separate'}
                      onChange={() => setAnswerFormat('separate')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-slate-700">
                      <strong>巻末にまとめて出力（推奨）</strong> - 問題用紙と解答・解説ページを分けて印刷したい場合
                    </span>
                  </label>

                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="answerFormat"
                      value="inline"
                      checked={answerFormat === 'inline'}
                      onChange={() => setAnswerFormat('inline')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-slate-700">
                      <strong>各問題の直下に出力</strong> - 自習用プリントや教員用模範解答
                    </span>
                  </label>

                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="answerFormat"
                      value="none"
                      checked={answerFormat === 'none'}
                      onChange={() => setAnswerFormat('none')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-slate-700">
                      <strong>正答・解説を出力しない</strong> - 純粋なテスト問題用紙のみ
                    </span>
                  </label>
                </div>
              </div>

              {/* Error message */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-2 text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">{errorMsg}</p>
                    <p className="mt-0.5 text-[11px] text-rose-600">
                      ※Googleログインポップアップがブロックされている場合は、ブラウザのアドレスバーでポップアップを許可してください。
                    </p>
                  </div>
                </div>
              )}

              {/* Export Action Button */}
              <div className="pt-2 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors"
                >
                  キャンセル
                </button>

                <button
                  type="button"
                  onClick={handleExport}
                  disabled={isLoading || questions.length === 0}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{progressMsg || '出力中...'}</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      <span>Googleドキュメントを作成 ({questions.length}問)</span>
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
