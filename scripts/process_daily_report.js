/**
 * 日計表PDF処理スクリプト
 * 
 * 1. PDFからGemini APIでデータ抽出
 * 2. 計算ロジック実行
 * 3. PuppeteerでレポートPDF生成
 * 4. Notionにデータ保存
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { Client } from '@notionhq/client';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 環境変数の読み込み（ローカル開発用）
if (process.env.NODE_ENV !== 'production') {
    const { config } = await import('dotenv');
    config();
}

// ===================
// 設定
// ===================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

// ===================
// Gemini APIでPDF解析
// ===================
async function extractDataFromPDF(pdfPath) {
    console.log('📄 PDFからデータを抽出中...');

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // PDFをBase64に変換
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfBase64 = pdfBuffer.toString('base64');

    const prompt = `あなたは歯科医院の日計表PDFからデータを抽出するAIアシスタントです。以下の指示に従って正確にデータを抽出してください。

1. 金額の取得について
	• 「負担額」列から金額を取得（点数列は無視）
	• 「自費」列: 自費診療の金額
	• 「物販」列: 物販の金額（前回差額と混同しないこと）
	• 「前回差額」列: 前回からの差額（正負の値）
	• 「差額」列: 当日の差額（正負の値を逆転して出力）

2. 患者分類ルール
主たる保険種別で分類（各患者は1カテゴリのみ）：
	• 社保: 「社本」「社家」が主保険
	• 国保: 「国本」「国家」が主保険
	• 後期: 「後期」が主保険
	• 保険なし: 保険種別欄が「保険なし」の患者

3. 金額集計ルール
	• 各保険種別: 「負担額」列の金額を集計
	• 自費患者: 「自費」列に金額を集計
	• 物販合計: 「物販」列のみを集計（前回差額列と間違えないこと）

4. 特別な判定項目
	• 保険なし患者の有無: 保険種別が「保険なし」の患者が存在するか
	• 返金患者の有無: 個別患者の「前回差額」列に負の値（マイナス）がある患者が存在するか

5. 合計行の確認
最下部の合計行から以下を確認：
	• 自費の合計
	• 前回差額の合計
	• 当日差額の合計（符号を逆転させる：-100なら100、200なら-200として出力）
	• 物販合計

## 出力形式（JSON）:
{
  "shaho_count": [社保患者の人数],
  "shaho_amount": [社保診療費合計],
  "kokuho_count": [国保患者の人数], 
  "kokuho_amount": [国保診療費合計],
  "kouki_count": [後期患者の人数],
  "kouki_amount": [後期診療費合計],
  "jihi_count": [自費患者の人数],
  "jihi_amount": [自費診療費合計],
  "hoken_nashi_count": [保険なし患者の人数],
  "hoken_nashi_amount": [保険なし患者の診療費合計],
  "bushan_note": "物販",
  "bushan_amount": [物販合計金額],
  "previous_difference": [前回差額（符号を含む）],
  "today_difference": [当日差額（符号を含む）],
  "has_hoken_nashi_patients": [true/false],
  "has_refund_patients": [true/false]
}

JSONのみを出力し、他のテキストは含めないでください。`;

    const result = await model.generateContent([
        { text: prompt },
        {
            inlineData: {
                mimeType: 'application/pdf',
                data: pdfBase64
            }
        }
    ]);

    const responseText = result.response.text();
    console.log('📝 Gemini応答:', responseText);

    // JSONを抽出
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('JSONの抽出に失敗しました');
    }

    const extractedData = JSON.parse(jsonMatch[0]);
    console.log('✅ データ抽出完了:', extractedData);

    return extractedData;
}

// ===================
// PuppeteerでPDF生成
// ===================
async function generateReportPDF(data, outputPath) {
    console.log('🖨️ レポートPDFを生成中...');

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        // index.htmlを読み込み
        const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
        await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

        // データを入力フォームに設定
        await page.evaluate((extractedData) => {
            // 収入データを入力
            document.getElementById('shahoCount').value = extractedData.shaho_count || 0;
            document.getElementById('shahoIncome').value = extractedData.shaho_amount || 0;
            document.getElementById('kokuhoCount').value = extractedData.kokuho_count || 0;
            document.getElementById('kokuhoIncome').value = extractedData.kokuho_amount || 0;
            document.getElementById('koukiCount').value = extractedData.kouki_count || 0;
            document.getElementById('koukiIncome').value = extractedData.kouki_amount || 0;
            document.getElementById('jihiCount').value = extractedData.jihi_count || 0;
            document.getElementById('jihiIncome').value = extractedData.jihi_amount || 0;
            document.getElementById('hokenNashiCount').value = extractedData.hoken_nashi_count || 0;
            document.getElementById('hokenNashiIncome').value = extractedData.hoken_nashi_amount || 0;
            document.getElementById('bushanIncome').value = extractedData.bushan_amount || 0;

            // 差額の設定
            const prevDiff = extractedData.previous_difference || 0;
            const todayDiff = extractedData.today_difference || 0;

            document.getElementById('previousDifference').value = Math.abs(prevDiff);
            document.getElementById('todayDifference').value = Math.abs(todayDiff);

            // 符号ボタンの設定
            if (prevDiff < 0) {
                window.previousDifferenceSign = '-';
                const btn = document.getElementById('previousSignBtn');
                if (btn) {
                    btn.textContent = '-';
                    btn.classList.remove('positive');
                    btn.classList.add('negative');
                }
            }
            if (todayDiff < 0) {
                window.todayDifferenceSign = '-';
                const btn = document.getElementById('todaySignBtn');
                if (btn) {
                    btn.textContent = '-';
                    btn.classList.remove('positive');
                    btn.classList.add('negative');
                }
            }

            // 日付を今日に設定
            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            document.getElementById('reportDate').value = dateStr;

            // 計算を実行
            if (typeof updateCalculations === 'function') {
                updateCalculations();
            }
            if (typeof updateDateDisplay === 'function') {
                updateDateDisplay();
            }
        }, data);

        // 少し待ってから計算を確実に反映
        await page.waitForTimeout(500);

        // PDFを生成（B5横向き）
        await page.pdf({
            path: outputPath,
            format: 'B5',
            landscape: true,
            printBackground: true,
            margin: { top: '0.3cm', right: '0.3cm', bottom: '0.3cm', left: '0.3cm' }
        });

        console.log('✅ PDF生成完了:', outputPath);
    } finally {
        await browser.close();
    }
}

// ===================
// Notionにデータ保存
// ===================
async function saveToNotion(data, pdfPath, reportPdfPath) {
    console.log('📚 Notionにデータを保存中...');

    const notion = new Client({ auth: NOTION_API_KEY });

    // 今日の日付
    const today = new Date().toISOString().split('T')[0];

    // 収入合計を計算
    const incomeTotal =
        (parseInt(data.shaho_amount) || 0) +
        (parseInt(data.kokuho_amount) || 0) +
        (parseInt(data.kouki_amount) || 0) +
        (parseInt(data.jihi_amount) || 0) +
        (parseInt(data.hoken_nashi_amount) || 0) +
        (parseInt(data.bushan_amount) || 0) +
        (parseInt(data.previous_difference) || 0) +
        (parseInt(data.today_difference) || 0);

    // ページを作成
    const response = await notion.pages.create({
        parent: { database_id: NOTION_DATABASE_ID },
        properties: {
            '日付': {
                title: [{ text: { content: today } }]
            },
            '収入合計': {
                number: incomeTotal
            },
            '社保人数': {
                number: parseInt(data.shaho_count) || 0
            },
            '社保金額': {
                number: parseInt(data.shaho_amount) || 0
            },
            '国保人数': {
                number: parseInt(data.kokuho_count) || 0
            },
            '国保金額': {
                number: parseInt(data.kokuho_amount) || 0
            },
            '後期人数': {
                number: parseInt(data.kouki_count) || 0
            },
            '後期金額': {
                number: parseInt(data.kouki_amount) || 0
            },
            '自費人数': {
                number: parseInt(data.jihi_count) || 0
            },
            '自費金額': {
                number: parseInt(data.jihi_amount) || 0
            },
            '物販金額': {
                number: parseInt(data.bushan_amount) || 0
            },
            '前回差額': {
                number: parseInt(data.previous_difference) || 0
            },
            '当日差額': {
                number: parseInt(data.today_difference) || 0
            },
            '保険なし患者あり': {
                checkbox: data.has_hoken_nashi_patients === true
            },
            '返金患者あり': {
                checkbox: data.has_refund_patients === true
            }
        }
    });

    console.log('✅ Notionページ作成完了:', response.id);

    // PDFファイルをアップロード（外部URLが必要な場合は別途実装）
    // Note: Notion APIのファイルアップロードは現在制限があるため、
    // 必要に応じてGitHub Artifactのリンクやクラウドストレージを利用

    return response;
}

// ===================
// メイン処理
// ===================
async function main() {
    const pdfPath = process.argv[2];

    if (!pdfPath) {
        console.error('❌ PDFファイルのパスを指定してください');
        console.error('使用方法: node scripts/process_daily_report.js <pdf_path>');
        process.exit(1);
    }

    if (!fs.existsSync(pdfPath)) {
        console.error('❌ PDFファイルが見つかりません:', pdfPath);
        process.exit(1);
    }

    // 必須環境変数のチェック
    if (!GEMINI_API_KEY) {
        console.error('❌ GEMINI_API_KEYが設定されていません');
        process.exit(1);
    }

    console.log('🚀 日計表処理を開始します...');
    console.log('📁 入力PDF:', pdfPath);

    try {
        // 1. PDFからデータ抽出
        const extractedData = await extractDataFromPDF(pdfPath);

        // 2. 出力ディレクトリの作成
        const outputDir = path.join(__dirname, '..', 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // 3. レポートPDF生成
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPdfPath = path.join(outputDir, `report_${timestamp}.pdf`);
        await generateReportPDF(extractedData, reportPdfPath);

        // 4. Notionに保存（設定されている場合）
        if (NOTION_API_KEY && NOTION_DATABASE_ID) {
            await saveToNotion(extractedData, pdfPath, reportPdfPath);
        } else {
            console.log('⚠️ Notion設定が見つからないため、保存をスキップします');
        }

        console.log('🎉 処理完了！');
        console.log('📄 生成されたレポート:', reportPdfPath);

    } catch (error) {
        console.error('❌ エラーが発生しました:', error);
        process.exit(1);
    }
}

main();
