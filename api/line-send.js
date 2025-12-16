// Vercel API Route for LINE Messaging API
import fetch from 'node-fetch';

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'このエンドポイントはPOSTメソッドのみ対応しています'
    });
  }

  try {
    console.log('=== LINE SEND START ===');
    console.log('Environment check:');
    console.log('- LINE_CHANNEL_ACCESS_TOKEN exists:', !!process.env.LINE_CHANNEL_ACCESS_TOKEN);
    console.log('- LINE_USER_IDS exists:', !!process.env.LINE_USER_IDS);

    // 環境変数チェック
    if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      return res.status(500).json({
        error: 'LINE Channel Access Token not configured',
        message: 'LINE_CHANNEL_ACCESS_TOKEN環境変数が設定されていません'
      });
    }

    if (!process.env.LINE_USER_IDS) {
      return res.status(500).json({
        error: 'LINE User IDs not configured',
        message: 'LINE_USER_IDS環境変数が設定されていません'
      });
    }

    // 送信先ユーザーIDリスト（カンマ区切りで複数指定可能）
    const userIds = process.env.LINE_USER_IDS.split(',').map(id => id.trim());
    console.log('Target user IDs count:', userIds.length);

    // リクエストボディから日計表データを取得
    const reportData = req.body;

    if (!reportData || !reportData.date) {
      return res.status(400).json({
        error: 'Invalid request data',
        message: '日計表データが不正です'
      });
    }

    console.log('Report date:', reportData.date);

    // LINEメッセージを作成
    const lineMessage = createLineMessage(reportData);

    // 各ユーザーにメッセージを送信
    const sendResults = [];

    for (const userId of userIds) {
      console.log(`Sending to user: ${userId}`);
      const result = await sendLineMessage(userId, lineMessage);
      sendResults.push({
        userId: userId,
        success: result.success,
        error: result.error
      });
    }

    // 送信結果を集計
    const successCount = sendResults.filter(r => r.success).length;
    const failCount = sendResults.filter(r => !r.success).length;

    console.log(`Send complete: ${successCount} success, ${failCount} failed`);

    if (failCount > 0) {
      return res.status(207).json({
        success: true,
        message: `${successCount}件送信成功、${failCount}件失敗`,
        results: sendResults
      });
    }

    return res.status(200).json({
      success: true,
      message: `${successCount}件のLINEメッセージを送信しました`,
      results: sendResults
    });

  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'サーバーエラーが発生しました',
      debug: error.message
    });
  }
}

// LINE Messaging APIでメッセージ送信
async function sendLineMessage(userId, message) {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        to: userId,
        messages: [message]
      })
    });

    const responseText = await response.text();
    console.log('LINE API response status:', response.status);

    if (!response.ok) {
      console.error('LINE API error:', responseText);
      return {
        success: false,
        error: `HTTP ${response.status}: ${responseText}`
      };
    }

    return {
      success: true
    };

  } catch (error) {
    console.error('Send error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 日計表データをLINEメッセージに変換（Flex Message形式）
function createLineMessage(data) {
  // 日付の整形
  const dateObj = new Date(data.date + 'T00:00:00');
  const dateStr = dateObj.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });

  // 残高チェック
  const physicalBalance = data.balanceCheck?.physicalBalance || 0;
  const calculatedBalance = data.balanceCheck?.calculatedBalance || 0;
  const difference = physicalBalance - calculatedBalance;
  const isBalanced = difference === 0;

  return {
    type: 'flex',
    altText: `歯科医院 日計表 ${data.date}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '歯科医院 日計表',
            weight: 'bold',
            size: 'xl',
            color: '#ffffff'
          },
          {
            type: 'text',
            text: dateStr,
            size: 'sm',
            color: '#ffffff',
            margin: 'md'
          }
        ],
        backgroundColor: '#007bff',
        paddingAll: '20px'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          // 収入セクション
          {
            type: 'text',
            text: '💰 収入',
            weight: 'bold',
            size: 'lg',
            margin: 'md'
          },
          createDataRow('社保', `${data.income?.shaho?.count || 0}名`, `¥${formatNumber(data.income?.shaho?.amount || 0)}`),
          createDataRow('国保', `${data.income?.kokuho?.count || 0}名`, `¥${formatNumber(data.income?.kokuho?.amount || 0)}`),
          createDataRow('後期高齢者', `${data.income?.kouki?.count || 0}名`, `¥${formatNumber(data.income?.kouki?.amount || 0)}`),
          createDataRow('自費', `${data.income?.jihi?.count || 0}名`, `¥${formatNumber(data.income?.jihi?.amount || 0)}`),
          createDataRow('保険なし', `${data.income?.hokenNashi?.count || 0}名`, `¥${formatNumber(data.income?.hokenNashi?.amount || 0)}`),
          createDataRow('物販', data.income?.bushan?.note || '-', `¥${formatNumber(data.income?.bushan?.amount || 0)}`),
          createSeparator(),
          createTotalRow('収入合計', `¥${formatNumber(data.income?.total || 0)}`),

          // 出金セクション
          {
            type: 'text',
            text: '💸 出金',
            weight: 'bold',
            size: 'lg',
            margin: 'xl'
          },
          createDataRow('院長へ', '-', `¥${formatNumber(data.expense?.director || 0)}`),
          createSeparator(),
          createTotalRow('出金合計', `¥${formatNumber(data.expense?.total || 0)}`),

          // 残高セクション
          {
            type: 'text',
            text: '💴 残高',
            weight: 'bold',
            size: 'lg',
            margin: 'xl'
          },
          createDataRow('前日繰越', '', `¥${formatNumber(data.balance?.previous || 0)}`),
          createDataRow('本日残高', '', `¥${formatNumber(data.balance?.final || 0)}`),
          createDataRow('総残高', '', `¥${formatNumber(data.totalBalance || 0)}`),

          // 残高チェック
          createSeparator(),
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: isBalanced ? '✅ 残高一致' : '⚠️ 残高差額あり',
                weight: 'bold',
                size: 'md',
                color: isBalanced ? '#28a745' : '#dc3545',
                align: 'center'
              },
              ...(isBalanced ? [] : [
                {
                  type: 'text',
                  text: `差額: ¥${formatNumber(difference)}`,
                  size: 'sm',
                  color: '#dc3545',
                  align: 'center',
                  margin: 'sm'
                }
              ])
            ],
            backgroundColor: isBalanced ? '#d4edda' : '#f8d7da',
            cornerRadius: 'md',
            paddingAll: '12px',
            margin: 'md'
          }
        ],
        paddingAll: '20px'
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '自動送信 - 歯科医院日計表システム',
            size: 'xxs',
            color: '#aaaaaa',
            align: 'center'
          }
        ],
        paddingAll: '10px'
      }
    }
  };
}

// データ行を作成
function createDataRow(label, value1, value2) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: label,
        size: 'sm',
        color: '#555555',
        flex: 2
      },
      {
        type: 'text',
        text: value1,
        size: 'sm',
        color: '#111111',
        align: 'end',
        flex: 1
      },
      {
        type: 'text',
        text: value2,
        size: 'sm',
        color: '#111111',
        align: 'end',
        flex: 2,
        weight: 'bold'
      }
    ],
    margin: 'md'
  };
}

// 合計行を作成
function createTotalRow(label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: label,
        size: 'md',
        color: '#111111',
        weight: 'bold',
        flex: 1
      },
      {
        type: 'text',
        text: value,
        size: 'md',
        color: '#111111',
        align: 'end',
        weight: 'bold',
        flex: 1
      }
    ],
    backgroundColor: '#f0f0f0',
    cornerRadius: 'md',
    paddingAll: '10px',
    margin: 'md'
  };
}

// 区切り線を作成
function createSeparator() {
  return {
    type: 'separator',
    margin: 'md'
  };
}

// 数値をカンマ区切りでフォーマット
function formatNumber(num) {
  return num.toLocaleString('ja-JP');
}
