# LINE送信 & Notion保存機能セットアップガイド

このドキュメントでは、歯科医院日計表アプリにLINE送信とNotion保存機能を追加するための設定方法を説明します。

## 機能概要

- **PDF生成**: 印刷レイアウトをそのままPDF化
- **Notion直接アップロード**: PDFファイルをNotion APIで直接アップロード
- **LINE送信**: 日計表のサマリーとNotionページURLをLINEで通知
- **Notion保存**: 日計表データとPDFファイルをNotionデータベースに保存

## 前提条件

- LINEアカウント
- LINE Developers アカウント
- Notionアカウント
- Vercelアカウント（デプロイ用）

---

## パート1: LINE Messaging API の設定

### 1.1 LINE Developers Console にアクセス

1. [LINE Developers Console](https://developers.line.biz/console/) にアクセス
2. LINEアカウントでログイン

### 1.2 プロバイダーの作成（初回のみ）

1. 「Create」ボタンをクリック
2. 「Create a new provider」を選択
3. プロバイダー名を入力（例：「歯科医院日計表」）
4. 「Create」をクリック

### 1.3 Messaging API チャンネルの作成

1. 作成したプロバイダーを選択
2. 「Create a Messaging API channel」をクリック
3. 必要事項を入力：
   - **Channel name**: 例「日計表通知」
   - **Channel description**: 例「歯科医院日計表の自動通知」
   - **Category**: 適切なカテゴリを選択
   - **Subcategory**: 適切なサブカテゴリを選択
4. 利用規約に同意して「Create」をクリック

### 1.4 Channel Access Token の取得

1. 作成したチャンネルを選択
2. 「Messaging API」タブを開く
3. 「Channel access token」セクションで「Issue」ボタンをクリック
4. 生成されたトークンをコピーして安全に保管

**重要**: このトークンは絶対に公開しないでください！

### 1.5 送信先ユーザーIDの取得

#### Step 1: LINE公式アカウントと友だちになる

1. チャンネルの「Messaging API」タブで「Add friend」ボタンのQRコードを表示
2. スマートフォンのLINEアプリでQRコードをスキャンして友だちに追加

#### Step 2: ユーザーID/グループIDの取得

**テストスクリプトを使用**:

プロジェクトに `api/get-line-user.js` が含まれています。このスクリプトを使用してIDを取得します。

1. **アプリをデプロイ**
   - 最新のコードをVercelにデプロイ
   - デプロイ完了を確認（1-2分）

2. **LINE Developers Consoleで設定**
   - 「Messaging API」タブを開く
   - 「Webhook URL」を設定：
     ```
     https://your-app.vercel.app/api/get-line-user
     ```
   - 「Verify」をクリック → 成功を確認
   - 「Use webhook」を有効化

3. **IDを取得**

   **個人用ユーザーIDの場合**:
   - LINE公式アカウント（1対1トーク）でメッセージを送信
   - Vercel Dashboard → Functions → Logs を確認
   - ログに表示される:
     ```
     Source Type: user
     Source ID: U1234567890abcdef1234567890abcdef
     ```

   **グループIDの場合**:
   - LINE公式アカウントをグループに招待
   - グループ内でメッセージを送信
   - Vercel Dashboard → Functions → Logs を確認
   - ログに表示される:
     ```
     Source Type: group
     Source ID: C9876543210fedcba9876543210fedcba
     ```

4. **取得したIDを環境変数に設定**（後述）

5. **重要: テストスクリプトを削除**

   IDを取得したら、セキュリティのためこのファイルを削除してください：
   ```bash
   git rm api/get-line-user.js
   git commit -m "Remove temporary test script"
   git push
   ```

   または、Webhook URLを空に戻してファイルを残しておいても構いません。

---

## パート2: Notion API の設定

### 2.1 Notion Integration の作成

1. [Notion Integrations](https://www.notion.so/my-integrations) にアクセス
2. 「+ New integration」をクリック
3. 必要事項を入力：
   - **Name**: 例「歯科医院日計表」
   - **Associated workspace**: 使用するワークスペースを選択
   - **Type**: Internal
4. 「Submit」をクリック

### 2.2 Integration Token の取得

1. 作成したIntegrationをクリック
2. 「Internal Integration Token」をコピーして安全に保管

**重要**: このトークンは絶対に公開しないでください！

### 2.3 Notionデータベースの作成

1. Notionで新しいページを作成
2. 「Database」→「Table」を選択
3. データベース名を「日計表」などに設定
4. 以下のプロパティ（列）を作成：

| プロパティ名 | タイプ | 説明 |
|------------|--------|------|
| 日付 | Title | 日計表の日付（必須） |
| 収入合計 | Number | 収入の合計金額 |
| 支出合計 | Number | 支出の合計金額 |
| 残高 | Number | 本日の残高 |
| 残高チェック | Checkbox | 残高が一致しているか |
| **PDF** | **Files & media** | **PDFファイルの添付（重要）** |

**重要**: 「PDF」プロパティは必ず「Files & media」タイプで作成してください。

### 2.4 データベースIDの取得

1. 作成したデータベースを開く
2. ブラウザのアドレスバーから以下の形式でIDを取得：
   ```
   https://www.notion.so/[workspace-name]/[DATABASE_ID]?v=[view-id]
   ```
3. `DATABASE_ID` 部分（32文字の英数字）をコピー

### 2.5 Integrationをデータベースに接続

1. データベースページの右上「...」メニューをクリック
2. 「Add connections」を選択
3. 作成したIntegration（例：「歯科医院日計表」）を選択
4. 「Confirm」をクリック

---

## パート3: Vercel 環境変数の設定

### 3.1 Vercel プロジェクトにアクセス

1. [Vercel Dashboard](https://vercel.com/dashboard) にログイン
2. 日計表アプリのプロジェクトを選択

### 3.2 環境変数を追加

1. 「Settings」タブを開く
2. 「Environment Variables」を選択
3. 以下の環境変数を追加：

#### LINE_CHANNEL_ACCESS_TOKEN
- **Key**: `LINE_CHANNEL_ACCESS_TOKEN`
- **Value**: パート1.4で取得したChannel Access Token
- **Environment**: Production, Preview, Development すべてにチェック

#### LINE_USER_IDS
- **Key**: `LINE_USER_IDS`
- **Value**: パート1.5で取得したユーザーIDまたはグループID（複数の場合はカンマ区切り）
  - 例（個人1人）: `U1234567890abcdef1234567890abcdef`
  - 例（個人複数）: `U1234567890abcdef1234567890abcdef,Uabcdef1234567890abcdef1234567890`
  - 例（グループ1つ）: `C9876543210fedcba9876543210fedcba`
  - 例（個人+グループ）: `U1234567890abcdef1234567890abcdef,C9876543210fedcba9876543210fedcba`
- **Environment**: Production, Preview, Development すべてにチェック

**注意**:
- ユーザーIDは `U` で始まる33文字
- グループIDは `C` で始まる33文字
- 個人とグループを混在させることも可能

#### NOTION_API_KEY
- **Key**: `NOTION_API_KEY`
- **Value**: パート2.2で取得したIntegration Token
  - 形式: `secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- **Environment**: Production, Preview, Development すべてにチェック

#### NOTION_DATABASE_ID
- **Key**: `NOTION_DATABASE_ID`
- **Value**: パート2.4で取得したデータベースID（32文字の英数字）
- **Environment**: Production, Preview, Development すべてにチェック

4. 「Save」をクリック

### 3.3 再デプロイ

環境変数を追加したら、アプリケーションを再デプロイしてください：

1. Vercel Dashboard の「Deployments」タブを開く
2. 最新のデプロイメントの右側にある「...」メニューをクリック
3. 「Redeploy」を選択

---

## 動作確認

### 1. アプリケーションにアクセス

1. デプロイされたアプリのURLを開く
2. 日計表データを入力

### 2. LINE送信テスト

1. 「LINE送信」ボタンをクリック
2. 「PDFを生成中...」→「LINEとNotionに送信中...」のメッセージが表示される
3. LINEアプリで通知が届くことを確認
4. 通知にNotionページのURLが含まれていることを確認

### 3. Notion保存確認

1. Notionのデータベースを開く
2. 新しいエントリが作成されていることを確認
3. 日付、収入合計、支出合計、残高が正しく保存されているか確認
4. 「PDF」プロパティにPDFファイルが添付されていることを確認
5. PDFファイルをクリックしてダウンロード・プレビューできることを確認

---

## トラブルシューティング

### LINE送信ボタンを押してもエラーが出る

**環境変数を確認**
- Vercel Dashboard で環境変数が正しく設定されているか確認
- 再デプロイしたか確認

**Channel Access Token が無効**
- LINE Developers Console でトークンを再発行
- Vercel の環境変数を更新
- 再デプロイ

**ユーザーID/グループIDが間違っている**
- ユーザーIDは `U` で始まる33文字の文字列
- グループIDは `C` で始まる33文字の文字列
- 正しいIDかどうか確認
- カンマ区切りの前後にスペースが入っていないか確認

**Webhook検証が失敗する**
- Webhook URLが正しいか確認（`https://your-app.vercel.app/api/get-line-user`）
- デプロイが完了しているか確認
- 「Verify」ボタンで検証が成功することを確認

**グループに通知が届かない**
- LINE公式アカウントがグループから退出させられていないか確認
- グループIDが正しいか確認（`C` で始まる33文字）

### Notionに保存されない

**Integration Token が無効**
- Notion Integrationsでトークンを確認
- Vercel の環境変数を更新
- 再デプロイ

**データベースIDが間違っている**
- NotionのデータベースURLから正しいIDを取得
- 32文字の英数字（ハイフンなし）であることを確認

**Integrationがデータベースに接続されていない**
- データベースページの「...」メニューから「Add connections」
- Integrationを選択して接続

**プロパティ名やタイプが一致しない**
- データベースのプロパティ名が以下と一致しているか確認：
  - 日付（Title型）
  - 収入合計（Number型）
  - 支出合計（Number型）
  - 残高（Number型）
  - 残高チェック（Checkbox型）
  - **PDF（Files & media型）** ← 必須

**PDFアップロードエラー**
- PDFファイルサイズが15MBを超えていないか確認
- Notion APIのファイルアップロード制限（20MB）を超えていないか確認

### PDFが生成されない

**ブラウザの互換性**
- Chrome、Edge、Safari の最新版を使用してください
- 古いブラウザでは動作しない可能性があります

**データが入力されていない**
- 日付が入力されているか確認
- 最低限のデータが入力されているか確認

---

## セキュリティ上の注意

- **Channel Access Token は絶対に公開しないでください**
  - GitHubなどにコミットしない
  - 環境変数でのみ管理する

- **Notion Integration Token も絶対に公開しないでください**
  - GitHubなどにコミットしない
  - 環境変数でのみ管理する

- **ユーザーIDも機密情報として扱ってください**
  - 環境変数で管理する
  - 他人に教えない

---

## サポート

問題が解決しない場合は、以下を確認してください：

1. [LINE Messaging API ドキュメント](https://developers.line.biz/ja/docs/messaging-api/)
2. [Notion API ドキュメント](https://developers.notion.com/)
3. [Notion File Upload API](https://developers.notion.com/reference/upload-a-file)
4. Vercel のデプロイログ
5. ブラウザのコンソールログ

---

以上でLINE送信 & Notion保存機能の設定は完了です！
