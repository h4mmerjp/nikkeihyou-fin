// 一時的なテストスクリプト: ユーザーIDまたはグループIDを取得
// 使用後は削除することを推奨

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-line-signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // LINE Webhook検証用（GETリクエスト）
  if (req.method === 'GET') {
    console.log('GET request received for webhook verification');
    return res.status(200).json({
      message: 'LINE Webhook endpoint is ready',
      status: 'ok'
    });
  }

  // POSTリクエストの場合（実際のWebhook）
  if (req.method === 'POST') {
    console.log('POST request received');
    console.log('Headers:', req.headers);

    const events = req.body?.events || [];

    if (events.length > 0) {
      const event = events[0];

      // ユーザーIDまたはグループID
      const sourceId = event.source.userId || event.source.groupId;
      const sourceType = event.source.type; // 'user' or 'group'

      console.log('=== LINE ID 取得 ===');
      console.log('Source Type:', sourceType);
      console.log('Source ID:', sourceId);
      console.log('Event Type:', event.type);

      return res.status(200).json({
        sourceType,
        sourceId,
        eventType: event.type,
        message: sourceType === 'group' ? 'グループID取得成功' : 'ユーザーID取得成功'
      });
    }

    return res.status(200).json({
      message: 'No events - グループまたは個人チャットでメッセージを送信してください'
    });
  }

  // その他のメソッドは405を返す
  return res.status(405).json({
    error: 'Method not allowed'
  });
}
