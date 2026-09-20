import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  declare props: Props;
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCache = () => {
    try {
      localStorage.removeItem('ot_exam_questions_db_v1');
      localStorage.removeItem('ot_exam_questions_db_v2');
      localStorage.removeItem('ot_exam_delivered_tests_v1');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-xl border border-slate-200 text-center space-y-4">
            <div className="w-12 h-12 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center mx-auto text-rose-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">表示中に問題が発生しました</h2>
              <p className="text-xs text-slate-500 mt-1">
                画面の読み込み中に予期せぬエラーが発生しました。
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                画面を再読み込みする
              </button>
              <button
                type="button"
                onClick={this.handleResetCache}
                className="w-full py-2 px-4 bg-slate-50 hover:bg-slate-100 text-slate-600 font-medium text-xs rounded-xl transition-colors"
              >
                一時データをリセットして再起動
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
