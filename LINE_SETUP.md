# LINE送信機能セットアップガイド

このドキュメントでは、歯科医院日計表アプリにLINE送信機能を追加するための設定方法を説明します。

## 前提条件

- LINEアカウント
- LINE Developers アカウント
- Vercelアカウント（デプロイ用）

## 1. LINE Messaging API チャンネルの作成

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

## 2. Channel Access Token の取得

1. 作成したチャンネルを選択
2. 「Messaging API」タブを開く
3. 「Channel access token」セクションで「Issue」ボタンをクリック
4. 生成されたトークンをコピーして安全に保管

**重要**: このトークンは絶対に公開しないでください！

## 3. 送信先ユーザーIDの取得

### 3.1 LINE公式アカウントと友だちになる

1. チャンネルの「Messaging API」タブで「Add friend」ボタンのQRコードを表示
2. スマートフォンのLINEアプリでQRコードをスキャンして友だちに追加

### 3.2 ユーザーIDの取得方法（2つの方法があります）

#### 方法A: LINE Bot Designer を使用（簡単）

1. [LINE Bot Designer](https://developers.line.biz/console/bot-designer/) にアクセス
2. 作成したチャンネルを選択
3. 「Get user ID」機能を使用

#### 方法B: Webhook を使用（確実）

1. LINE Developers Console でチャンネルを選択
2. 「Messaging API」タブを開く
3. 「Webhook settings」で「Webhook URL」を設定（一時的に任意のURL、例: `https://example.com`）
4. 「Use webhook」を有効化
5. 友だち追加した公式アカウントに、あなたのLINEアカウントから何かメッセージを送信
6. Webhookで受信したイベントの `source.userId` がユーザーID

**より簡単な方法**: 以下のテストスクリプトを使用できます（次のセクション参照）

## 4. Vercel 環境変数の設定

### 4.1 Vercel プロジェクトにアクセス

1. [Vercel Dashboard](https://vercel.com/dashboard) にログイン
2. 日計表アプリのプロジェクトを選択

### 4.2 環境変数を追加

1. 「Settings」タブを開く
2. 「Environment Variables」を選択
3. 以下の環境変数を追加：

#### LINE_CHANNEL_ACCESS_TOKEN
- **Key**: `LINE_CHANNEL_ACCESS_TOKEN`
- **Value**: 手順2で取得したChannel Access Token
- **Environment**: Production, Preview, Development すべてにチェック

#### LINE_USER_IDS
- **Key**: `LINE_USER_IDS`
- **Value**: 手順3で取得したユーザーID（複数の場合はカンマ区切り）
  - 例（1人）: `U1234567890abcdef1234567890abcdef`
  - 例（複数）: `U1234567890abcdef1234567890abcdef,Uabcdef1234567890abcdef1234567890`
- **Environment**: Production, Preview, Development すべてにチェック

4. 「Save」をクリック

### 4.3 再デプロイ

環境変数を追加したら、アプリケーションを再デプロイしてください：

1. Vercel Dashboard の「Deployments」タブを開く
2. 最新のデプロイメントの右側にある「...」メニューをクリック
3. 「Redeploy」を選択

## 5. ユーザーID取得テストスクリプト（オプション）

ユーザーIDの取得を簡単にするため、以下のテストエンドポイントを使用できます。

`api/get-line-user.js` を作成：

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

1. このファイルをデプロイ
2. Webhook URLを `https://your-app.vercel.app/api/get-line-user` に設定
3. LINE公式アカウントにメッセージを送信
4. VercelのログでユーザーIDを確認

## 6. 動作確認

1. アプリケーションにアクセス
2. 日計表データを入力
3. 「LINE送信」ボタンをクリック
4. LINEアプリで通知が届くことを確認

## トラブルシューティング

### LINE送信ボタンを押してもエラーが出る

1. **環境変数を確認**
   - Vercel Dashboard で `LINE_CHANNEL_ACCESS_TOKEN` と `LINE_USER_IDS` が正しく設定されているか確認
   - 再デプロイしたか確認

2. **Channel Access Token が無効**
   - LINE Developers Console でトークンを再発行
   - Vercel の環境変数を更新
   - 再デプロイ

3. **ユーザーIDが間違っている**
   - ユーザーIDは `U` で始まる33文字の文字列です
   - 正しいIDかどうか確認

### メッセージが届かない

1. **友だち追加を確認**
   - LINE公式アカウントと友だちになっているか確認

2. **ブロックされていないか確認**
   - 公式アカウントをブロックしていると届きません

3. **Webhook設定を確認**
   - Webhook URLは設定不要です（pushメッセージを使用）
   - 「Use webhook」は無効でOK

## セキュリティ上の注意

- **Channel Access Token は絶対に公開しないでください**
  - GitHubなどにコミットしない
  - 環境変数でのみ管理する

- **ユーザーIDも機密情報として扱ってください**
  - 環境変数で管理する
  - 他人に教えない

## サポート

問題が解決しない場合は、以下を確認してください：

1. [LINE Messaging API ドキュメント](https://developers.line.biz/ja/docs/messaging-api/)
2. Vercel のデプロイログ
3. ブラウザのコンソールログ

---

以上でLINE送信機能の設定は完了です！
