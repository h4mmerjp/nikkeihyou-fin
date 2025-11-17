import { Client } from '@notionhq/client';
import { put } from '@vercel/blob';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req, res) {
    // CORSヘッダー設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // FormDataをパース
        const form = formidable({});
        const [fields, files] = await form.parse(req);

        const apiKey = fields.apiKey?.[0];
        const databaseId = fields.databaseId?.[0];
        const date = fields.date?.[0];
        const totalBalance = fields.totalBalance?.[0];
        const finalBalance = fields.finalBalance?.[0];
        const pdfFile = files.pdf?.[0];

        if (!apiKey || !databaseId || !pdfFile) {
            return res.status(400).json({
                error: '必須パラメータが不足しています',
                details: {
                    hasApiKey: !!apiKey,
                    hasDatabaseId: !!databaseId,
                    hasPdfFile: !!pdfFile
                }
            });
        }

        console.log('Notion save request:', {
            date,
            totalBalance,
            finalBalance,
            pdfSize: pdfFile.size,
            pdfType: pdfFile.mimetype
        });

        // PDFファイルを読み込む
        const pdfBuffer = fs.readFileSync(pdfFile.filepath);

        // Vercel BlobにPDFをアップロード
        const blobFilename = `日計表_${date || 'no-date'}_${Date.now()}.pdf`;

        let pdfUrl;
        try {
            // Vercel Blobを使用してPDFをアップロード
            const blob = await put(blobFilename, pdfBuffer, {
                access: 'public',
                contentType: 'application/pdf',
            });
            pdfUrl = blob.url;
            console.log('PDF uploaded to Vercel Blob:', pdfUrl);
        } catch (blobError) {
            console.error('Vercel Blob upload error:', blobError);
            // Vercel Blobが利用できない場合、Notionページのみを作成
            pdfUrl = null;
        }

        // Notion APIクライアントを初期化
        const notion = new Client({ auth: apiKey });

        // データベースのプロパティスキーマを取得
        let databaseProperties = {};
        try {
            const database = await notion.databases.retrieve({ database_id: databaseId });
            databaseProperties = database.properties || {};
            console.log('Database properties:', Object.keys(databaseProperties));
        } catch (dbError) {
            console.error('Failed to retrieve database schema:', dbError);
        }

        // Notionページを作成（プロパティは動的に設定）
        const pageProperties = {};

        // タイトルプロパティを見つける
        const titleProperty = Object.keys(databaseProperties).find(
            key => databaseProperties[key].type === 'title'
        );

        if (titleProperty) {
            pageProperties[titleProperty] = {
                title: [
                    {
                        text: {
                            content: `日計表 ${date || '日付なし'}`,
                        },
                    },
                ],
            };
        }

        // 日付プロパティを追加（データベースに日付プロパティがある場合）
        if (date) {
            const dateProperty = Object.keys(databaseProperties).find(
                key => databaseProperties[key].type === 'date' &&
                       (key === '日付' || key.toLowerCase() === 'date')
            );
            if (dateProperty) {
                pageProperties[dateProperty] = {
                    date: {
                        start: date,
                    },
                };
            }
        }

        // 総残高プロパティを追加（データベースに数値プロパティがある場合）
        if (totalBalance) {
            const totalBalanceProperty = Object.keys(databaseProperties).find(
                key => databaseProperties[key].type === 'number' &&
                       (key === '総残高' || key.toLowerCase().includes('total'))
            );
            if (totalBalanceProperty) {
                pageProperties[totalBalanceProperty] = {
                    number: parseInt(totalBalance.replace(/,/g, '')) || 0,
                };
            }
        }

        // 最終残高プロパティを追加（データベースに数値プロパティがある場合）
        if (finalBalance) {
            const finalBalanceProperty = Object.keys(databaseProperties).find(
                key => databaseProperties[key].type === 'number' &&
                       (key === '最終残高' || key.toLowerCase().includes('final'))
            );
            if (finalBalanceProperty) {
                pageProperties[finalBalanceProperty] = {
                    number: parseInt(finalBalance.replace(/,/g, '')) || 0,
                };
            }
        }

        // ページの本文を作成
        const children = [];

        // PDFリンクを追加
        if (pdfUrl) {
            children.push({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [
                        {
                            type: 'text',
                            text: {
                                content: 'PDFファイル: ',
                            },
                        },
                        {
                            type: 'text',
                            text: {
                                content: 'ダウンロード',
                                link: {
                                    url: pdfUrl,
                                },
                            },
                            annotations: {
                                bold: true,
                                color: 'blue',
                            },
                        },
                    ],
                },
            });

            // PDFプレビュー（埋め込み）
            children.push({
                object: 'block',
                type: 'pdf',
                pdf: {
                    type: 'external',
                    external: {
                        url: pdfUrl,
                    },
                },
            });
        } else {
            children.push({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [
                        {
                            type: 'text',
                            text: {
                                content: 'PDFアップロードはスキップされました（Vercel Blob未設定）',
                            },
                            annotations: {
                                italic: true,
                                color: 'gray',
                            },
                        },
                    ],
                },
            });
        }

        // 残高情報を追加
        children.push({
            object: 'block',
            type: 'heading_2',
            heading_2: {
                rich_text: [
                    {
                        type: 'text',
                        text: {
                            content: '残高情報',
                        },
                    },
                ],
            },
        });

        children.push({
            object: 'block',
            type: 'bulleted_list_item',
            bulleted_list_item: {
                rich_text: [
                    {
                        type: 'text',
                        text: {
                            content: `総残高: ${totalBalance || '不明'}円`,
                        },
                    },
                ],
            },
        });

        children.push({
            object: 'block',
            type: 'bulleted_list_item',
            bulleted_list_item: {
                rich_text: [
                    {
                        type: 'text',
                        text: {
                            content: `最終残高: ${finalBalance || '不明'}円`,
                        },
                    },
                ],
            },
        });

        // Notionページを作成
        const response = await notion.pages.create({
            parent: {
                database_id: databaseId,
            },
            properties: pageProperties,
            children: children,
        });

        console.log('Notion page created:', response.id);

        // 一時ファイルを削除
        try {
            fs.unlinkSync(pdfFile.filepath);
        } catch (cleanupError) {
            console.error('Cleanup error:', cleanupError);
        }

        return res.status(200).json({
            success: true,
            pageId: response.id,
            pageUrl: response.url,
            pdfUrl: pdfUrl || null,
        });

    } catch (error) {
        console.error('Notion save error:', error);

        return res.status(500).json({
            success: false,
            error: error.message || 'Notionへの保存中にエラーが発生しました',
            details: error.code || 'unknown_error',
        });
    }
}
