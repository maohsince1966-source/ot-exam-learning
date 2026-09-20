import React from 'react';
import { Play, Clock, BookOpen, Sparkles, CheckCircle2 } from 'lucide-react';
import { DeliveredTest, Question } from '../types';

interface ReceivedTestModalProps {
  test: DeliveredTest;
  questions: Question[];
  onStartNow: () => void;
  onSaveForLater: () => void;
}

export const ReceivedTestModal: React.FC<ReceivedTestModalProps> = ({
  test,
  questions,
  onStartNow,
  onSaveForLater
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Top Decorative Header */}
        <div className="bg-gradient-to-r from-teal-600 to-teal-800 p-6 text-white text-center space-y-2">
          <div className="w-12 h-12 bg-white/20 backdrop-blur-xs rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Sparkles className="w-6 h-6 text-teal-200" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider bg-teal-900/40 text-teal-100 px-3 py-1 rounded-full border border-teal-400/30">
            教員配信小テスト 受信
          </span>
          <h2 className="text-xl font-extrabold text-white">
            先生から小テストが届きました！
          </h2>
          <p className="text-xs text-teal-100">
            以下の小テストがあなたの学習画面に届いています
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Clock className="w-3 h-3" />
                小テスト
              </span>
              <span className="text-xs text-slate-400">
                {new Date(test.createdAt).toLocaleDateString('ja-JP')}
              </span>
            </div>

            <div>
              <h3 className="text-lg font-extrabold text-slate-900">
                {test.title}
              </h3>
              {test.category && (
                <p className="text-xs text-teal-700 font-semibold mt-0.5">
                  対象分野: {test.category}
                </p>
              )}
            </div>

            {test.instructions && (
              <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs text-slate-700">
                <span className="font-bold text-slate-900 block mb-1">💬 先生からの指示・コメント:</span>
                <p className="whitespace-pre-wrap">{test.instructions}</p>
              </div>
            )}

            <div className="flex items-center space-x-4 text-xs text-slate-600 pt-2 border-t border-slate-200">
              <div className="flex items-center gap-1.5 font-medium">
                <BookOpen className="w-4 h-4 text-slate-400" />
                <span>出題数: <strong className="text-slate-900 text-sm">{questions.length}</strong> 問</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>複数正答（2つ選べ）対応</span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <button
              onClick={onStartNow}
              className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2 text-sm"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>今すぐテストを開始する</span>
            </button>

            <button
              onClick={onSaveForLater}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-2xl transition-colors text-xs text-center"
            >
              あとで受ける（「今日のテスト」一覧に保存）
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
