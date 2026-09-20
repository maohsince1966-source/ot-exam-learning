# 作業療法士 国家試験対策ラーニング 【学生専用ポータル】

本ディレクトリ（`/student-app`）は、**学生専用の独立した軽量Webアプリケーション**です。  
教員用機能（問題の新規登録、問題編集・削除、小テスト作成・配信、Word/PDF帳票出力、学生名簿の管理・登録など）を**完全に削ぎ落とし**、学生が自身の演習と小テストの解答に100%集中できる安全な設計になっています。

---

## 🚀 主な機能

1. **過去問検索・自習演習**
   - 分野（大項目）・中項目（（）内指定）・実施回（第45回〜第61回等）による絞り込み
   - 「2つ選べ」問題や「図・画像あり」問題のピンポイント抽出
   - 10問〜50問・全問単位での出題数選択
   - 即時解説モード（解いた瞬間に正解・解説を確認）のON/OFF切り替え
2. **今日の小テスト（教員配信）**
   - 教員側から学年宛（1年生〜4年生）または個人宛に配信されたテストをリアルタイム受信
   - 先生から口頭や黒板で伝えられた**6桁の参加コード**（例: `K9X2P4`）による直接受験
   - 未解答や選択数不足の問題がある場合の確認アラート＆ジャンプ機能
   - 採点完了時に教員サーバーへの自動提出（リアルタイム集計連携）
3. **学習履歴・成績確認**
   - 過去に解いた演習や小テストの得点（合格基準60%到達判定）一覧
   - 「前回の結果・解説を見直す」機能（間違えた問題の復習）
4. **学生端末設定＆PWA・オフライン対応**
   - 端末への学籍番号・学年・氏名の保存（学年別テストの自動振り分け）
   - PWA（Progressive Web App）としてスマホやタブレットのホーム画面に追加可能

---

## 📂 ディレクトリ構成

```text
student-app/
├── index.html                  # 学生用HTMLエントリーポイント
├── package.json                # 学生用依存関係
├── tsconfig.json               # TypeScript設定
├── vite.config.ts              # Vite設定
├── server.ts                   # 学生専用バックエンドAPI（/api/questions, /api/tests, /api/results）
└── src/
    ├── main.tsx                # Reactマウントエントリーポイント
    ├── App.tsx                 # 学生用メインアプリケーション
    ├── types.ts                # 共有型定義
    ├── components/
    │   ├── StudentNavbar.tsx             # 学生用ヘッダー（教員切替ボタンなし）
    │   ├── StudentView.tsx               # 過去問演習・今日のテスト・履歴ダッシュボード
    │   ├── QuizRunner.tsx                # 解答画面・採点・解説・提出画面
    │   ├── StudentIdRegistrationModal.tsx# 学籍番号・学年登録モーダル
    │   ├── ReceivedTestModal.tsx         # 配信テスト受信通知ポップアップ
    │   ├── QuestionImage.tsx             # 問題図・画像表示（拡大機能付き）
    │   ├── OfflineIndicator.tsx          # オフライン接続状態表示
    │   ├── PWAInstallButton.tsx          # ホーム画面追加ボタン
    │   └── ErrorBoundary.tsx             # 安全なエラー境界
    ├── services/
    │   ├── studentRosterService.ts       # 端末プロファイル管理・学年判定
    │   └── testSyncService.ts            # テスト同期・解答送信サービス
    └── utils/
        ├── categoryHelper.ts             # 分野解析・正誤判定・「2つ選べ」判定
        └── imageHelper.ts                # 画像URL解決
```

---

## 🛠️ 起動・デプロイ方法

### 1. 単独起動（ローカル開発環境）
```bash
cd student-app
npm install
npm run dev
```
ブラウザで `http://localhost:3000` にアクセスすると学生専用画面が開きます。

### 2. 本番ビルド
```bash
cd student-app
npm run build
npm start
```

### 3. クラウドデプロイ
Vercel、Render、Cloud Run、Fly.io、AWS等に本ディレクトリ（`student-app`）をプロジェクトルートとして単独デプロイ可能です。
教員用サーバーと同じデータベース（または `/data`）を参照させることで、教員が配信したテストがリアルタイムに学生側に届きます。
