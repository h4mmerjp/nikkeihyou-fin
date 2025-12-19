// Vercel API Route for LINE Messaging API & Notion Integration (PDF version)
import formidable from 'formidable';
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { Client } from '@notionhq/client';

export const config = {
  api: {
    bodyParser: false,
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
    console.log('=== LINE & NOTION PDF SEND START ===');
    console.log('Environment check:');
    console.log('- LINE_CHANNEL_ACCESS_TOKEN exists:', !!process.env.LINE_CHANNEL_ACCESS_TOKEN);
    console.log('- LINE_USER_IDS exists:', !!process.env.LINE_USER_IDS);
    console.log('- NOTION_API_KEY exists:', !!process.env.NOTION_API_KEY);
    console.log('- NOTION_DATABASE_ID exists:', !!process.env.NOTION_DATABASE_ID);

    // ファイルパース
    const form = formidable({
      maxFileSize: 15 * 1024 * 1024, // 15MB制限
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    console.log('Files parsed:', Object.keys(files));
    console.log('Fields parsed:', Object.keys(fields));

    const pdfFile = files.pdf?.[0];
    if (!pdfFile) {
      return res.status(400).json({
        error: 'No PDF file uploaded',
        message: 'PDFファイルがアップロードされていません'
      });
    }

    console.log('PDF file details:', {
      originalFilename: pdfFile.originalFilename,
      size: pdfFile.size,
      mimetype: pdfFile.mimetype
    });

    // メタデータを取得
    const metadata = fields.metadata?.[0] ? JSON.parse(fields.metadata[0]) : {};
    console.log('Metadata:', metadata);

    const results = {
      lineSuccess: false,
      lineSentCount: 0,
      notionSuccess: false,
      errors: []
    };

    // LINE送信処理
    if (process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_USER_IDS) {
      try {
        const lineResult = await sendPDFToLine(pdfFile, metadata);
        results.lineSuccess = lineResult.success;
        results.lineSentCount = lineResult.sentCount || 0;
        if (!lineResult.success) {
          results.errors.push({ service: 'LINE', error: lineResult.error });
        }
      } catch (error) {
        console.error('LINE送信エラー:', error);
        results.errors.push({ service: 'LINE', error: error.message });
      }
    } else {
      console.log('LINE設定がスキップされました（環境変数未設定）');
    }

    // Notion保存処理
    if (process.env.NOTION_API_KEY && process.env.NOTION_DATABASE_ID) {
      try {
        const notionResult = await savePDFToNotion(pdfFile, metadata);
        results.notionSuccess = notionResult.success;
        if (!notionResult.success) {
          results.errors.push({ service: 'Notion', error: notionResult.error });
        }
      } catch (error) {
        console.error('Notion保存エラー:', error);
        results.errors.push({ service: 'Notion', error: error.message });
      }
    } else {
      console.log('Notion設定がスキップされました（環境変数未設定）');
    }

    // 結果を返す
    const hasSuccess = results.lineSuccess || results.notionSuccess;
    const hasErrors = results.errors.length > 0;

    if (!hasSuccess && hasErrors) {
      return res.status(500).json({
        success: false,
        message: '送信に失敗しました',
        ...results
      });
    }

    return res.status(200).json({
      success: true,
      message: `送信完了: LINE ${results.lineSentCount}件, Notion ${results.notionSuccess ? '成功' : '未実行'}`,
      ...results
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

// LINEにPDFを送信
async function sendPDFToLine(pdfFile, metadata) {
  try {
    console.log('=== LINE PDF SEND ===');

    // 送信先ユーザーIDリスト
    const userIds = process.env.LINE_USER_IDS.split(',').map(id => id.trim());
    console.log('Target user IDs count:', userIds.length);

    let sentCount = 0;
    const errors = [];

    for (const userId of userIds) {
      try {
        console.log(`Sending PDF to user: ${userId}`);

        // PDFファイルを読み込み
        const fileBuffer = fs.readFileSync(pdfFile.filepath);

        // メッセージを送信（PDFはLINE Messaging APIの制限により直接送信できないため、
        // 代わりにテキストメッセージ + 外部リンクまたはBase64エンコードを使用）
        // ここでは簡略化のため、通知メッセージを送信
        const message = {
          type: 'text',
          text: `📄 歯科医院 日計表\n日付: ${metadata.date}\n\n収入合計: ¥${(metadata.income?.total || 0).toLocaleString()}\n支出合計: ¥${(metadata.expense?.total || 0).toLocaleString()}\n本日残高: ¥${(metadata.balance?.final || 0).toLocaleString()}\n\n${metadata.balanceCheck?.isMatched ? '✅ 残高一致' : '⚠️ 残高差額あり'}\n\n※PDFファイルは別途確認してください`
        };

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

        if (response.ok) {
          sentCount++;
          console.log(`✅ Sent to ${userId}`);
        } else {
          const errorText = await response.text();
          console.error(`❌ Failed to send to ${userId}:`, errorText);
          errors.push({ userId, error: errorText });
        }

      } catch (error) {
        console.error(`Error sending to ${userId}:`, error);
        errors.push({ userId, error: error.message });
      }
    }

    return {
      success: sentCount > 0,
      sentCount,
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (error) {
    console.error('LINE send error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// NotionにPDFを保存
async function savePDFToNotion(pdfFile, metadata) {
  try {
    console.log('=== NOTION PDF SAVE ===');

    // Notion APIクライアントを初期化
    const notion = new Client({ auth: process.env.NOTION_API_KEY });

    // PDFファイルを読み込み
    const fileBuffer = fs.readFileSync(pdfFile.filepath);
    const base64PDF = fileBuffer.toString('base64');

    // Notionデータベースにページを作成
    const response = await notion.pages.create({
      parent: {
        database_id: process.env.NOTION_DATABASE_ID
      },
      properties: {
        '日付': {
          title: [
            {
              text: {
                content: metadata.date || '日付未設定'
              }
            }
          ]
        },
        '収入合計': {
          number: metadata.income?.total || 0
        },
        '支出合計': {
          number: metadata.expense?.total || 0
        },
        '残高': {
          number: metadata.balance?.final || 0
        },
        '残高チェック': {
          checkbox: metadata.balanceCheck?.isMatched || false
        }
      },
      children: [
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '歯科医院 日計表'
                }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `日付: ${metadata.date}\n収入合計: ¥${(metadata.income?.total || 0).toLocaleString()}\n支出合計: ¥${(metadata.expense?.total || 0).toLocaleString()}\n残高: ¥${(metadata.balance?.final || 0).toLocaleString()}`
                }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'callout',
          callout: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: metadata.balanceCheck?.isMatched ? '✅ 残高一致' : '⚠️ 残高差額あり'
                }
              }
            ],
            icon: {
              emoji: metadata.balanceCheck?.isMatched ? '✅' : '⚠️'
            },
            color: metadata.balanceCheck?.isMatched ? 'green_background' : 'yellow_background'
          }
        }
      ]
    });

    console.log('✅ Notion page created:', response.id);

    // 注意: NotionはPDFの直接アップロードに制限があるため、
    // 外部ストレージ（S3など）にアップロードしてリンクを追加する必要があります
    // ここでは基本的なページ作成のみ実装

    return {
      success: true,
      pageId: response.id,
      url: response.url
    };

  } catch (error) {
    console.error('Notion save error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
