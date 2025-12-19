# LINE送信 & Notion保存機能セットアップガイド

このドキュメントでは、歯科医院日計表アプリにLINE送信とNotion保存機能を追加するための設定方法を説明します。

## 機能概要

- **PDF生成**: 印刷レイアウトをそのままPDF化
- **Vercel Blobストレージ**: PDFファイルをVercelのクラウドストレージに保存
- **LINE送信**: 日計表のサマリーとPDFダウンロードリンクをLINEで通知
- **Notion保存**: 日計表データとPDFファイルをNotionデータベースに保存

## 前提条件

- LINEアカウント
- LINE Developers アカウント
- Notionアカウント
- Vercelアカウント（デプロイ用 + Blob ストレージ用）

---

## パート0: Vercel Blob ストレージの設定

### 0.1 Vercel Blob を有効化

1. [Vercel Dashboard](https://vercel.com/dashboard) にログイン
2. プロジェクトを選択
3. 「Storage」タブを開く
4. 「Create Database」→「Blob」を選択
5. データベース名を入力（例：「daily-reports-pdf」）
6. リージョンを選択（日本の場合は「Tokyo」推奨）
7. 「Create」をクリック

### 0.2 Blob トークンの取得

Vercel Blobを作成すると、環境変数 `BLOB_READ_WRITE_TOKEN` が自動的にプロジェクトに追加されます。

確認方法：
1. 「Settings」→「Environment Variables」を開く
2. `BLOB_READ_WRITE_TOKEN` が存在することを確認

**注意**: このトークンは自動生成されるため、手動で設定する必要はありません。

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

#### Step 2: ユーザーIDの取得

**簡単な方法**: 以下のテストスクリプトを使用

1. プロジェクトの `api` フォルダに `get-line-user.js` を作成：

```javascript
export default async function handler(req, res) {
  const events = req.body?.events || [];

  if (events.length > 0) {
    const userId = events[0].source.userId;
    console.log('User ID:', userId);
    return res.status(200).json({ userId });
  }

  return res.status(200).json({ message: 'No events' });
}
```

2. デプロイ後、LINE Developers Consoleで：
   - 「Messaging API」タブを開く
   - 「Webhook URL」を `https://your-app.vercel.app/api/get-line-user` に設定
   - 「Use webhook」を有効化
   - 「Verify」をクリックして接続確認

3. LINE公式アカウントに何かメッセージを送信

4. VercelのログでユーザーIDを確認（`U` で始まる33文字の文字列）

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
- **Value**: パート1.5で取得したユーザーID（複数の場合はカンマ区切り）
  - 例（1人）: `U1234567890abcdef1234567890abcdef`
  - 例（複数）: `U1234567890abcdef1234567890abcdef,Uabcdef1234567890abcdef1234567890`
- **Environment**: Production, Preview, Development すべてにチェック

#### NOTION_API_KEY
- **Key**: `NOTION_API_KEY`
- **Value**: パート2.2で取得したIntegration Token
  - 形式: `secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- **Environment**: Production, Preview, Development すべてにチェック

#### NOTION_DATABASE_ID
- **Key**: `NOTION_DATABASE_ID`
- **Value**: パート2.4で取得したデータベースID（32文字の英数字）
- **Environment**: Production, Preview, Development すべてにチェック

#### BLOB_READ_WRITE_TOKEN（自動設定済み）
- Vercel Blobを作成すると自動的に設定されます
- 手動で追加する必要はありません
- 確認のみ行ってください

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

### 3. Notion保存確認

1. Notionのデータベースを開く
2. 新しいエントリが作成されていることを確認
3. 日付、収入合計、支出合計、残高が正しく保存されているか確認
4. ページ内にPDFファイルブロックが追加されていることを確認
5. PDFファイルをクリックしてダウンロードできることを確認

### 4. Vercel Blob確認

1. Vercel Dashboard の「Storage」タブを開く
2. Blob ストレージを選択
3. `daily-reports/[日付]/日計表_[日付].pdf` というファイルが保存されていることを確認

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

**ユーザーIDが間違っている**
- ユーザーIDは `U` で始まる33文字の文字列です
- 正しいIDかどうか確認

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

**プロパティ名が一致しない**
- データベースのプロパティ名が以下と一致しているか確認：
  - 日付（Title型）
  - 収入合計（Number型）
  - 支出合計（Number型）
  - 残高（Number型）
  - 残高チェック（Checkbox型）

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

**PDFのストレージコストについて**
- Vercel Blobは無料プランで最大10GB/月まで利用可能
- 超過した場合は従量課金（詳細は[Vercel料金ページ](https://vercel.com/docs/storage/vercel-blob/usage-and-pricing)を確認）

---

## サポート

問題が解決しない場合は、以下を確認してください：

1. [LINE Messaging API ドキュメント](https://developers.line.biz/ja/docs/messaging-api/)
2. [Notion API ドキュメント](https://developers.notion.com/)
3. Vercel のデプロイログ
4. ブラウザのコンソールログ

---

以上でLINE送信 & Notion保存機能の設定は完了です！
