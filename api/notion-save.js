// Vercel API Route for saving daily report to Notion
import fetch from 'node-fetch';

export default async function handler(req, res) {
  // CORS設定
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
    const notionApiKey = process.env.NOTION_API_KEY;
    const databaseId = process.env.NOTION_DATABASE_ID;

    if (!notionApiKey) {
      return res.status(500).json({ error: 'NOTION_API_KEY が設定されていません' });
    }
    if (!databaseId) {
      return res.status(500).json({ error: 'NOTION_DATABASE_ID が設定されていません' });
    }

    const data = req.body;

    if (!data || !data.date) {
      return res.status(400).json({ error: '日付データが必要です' });
    }

    // Notion ページ作成
    const notionResponse = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionApiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: buildProperties(data),
        children: buildPageContent(data),
      }),
    });

    const notionResult = await notionResponse.json();

    if (!notionResponse.ok) {
      console.error('Notion API error:', JSON.stringify(notionResult));
      return res.status(notionResponse.status).json({
        error: `Notion API エラー: ${notionResult.message || 'Unknown error'}`,
        details: notionResult,
      });
    }

    return res.status(200).json({
      success: true,
      pageUrl: notionResult.url,
      pageId: notionResult.id,
    });

  } catch (error) {
    console.error('Notion save error:', error);
    return res.status(500).json({
      error: `保存中にエラーが発生しました: ${error.message}`,
    });
  }
}

// Notion データベースのプロパティを構築
function buildProperties(data) {
  return {
    '日付': {
      date: {
        start: data.date,
      },
    },
    '本日の残高': {
      number: data.balance?.final || 0,
    },
    '総残高（実物）': {
      number: data.totalBalance || 0,
    },
    '残高一致': {
      checkbox: data.balanceCheck?.isMatched || false,
    },
    '入金合計': {
      number: data.income?.total || 0,
    },
    '出金合計': {
      number: data.expense?.total || 0,
    },
  };
}

// Notion ページのコンテンツ（ブロック）を構築
function buildPageContent(data) {
  const blocks = [];

  // ヘッダー
  blocks.push(heading2('歯科医院 日計表'));
  blocks.push(paragraph(`日付: ${data.date} ${data.dateDisplay || ''}`));
  blocks.push(divider());

  // --- 窓口現金入金の記録 ---
  blocks.push(heading3('窓口現金入金の記録'));

  const incomeRows = [];
  // 前回差額
  if (data.income?.previousDifference) {
    const pd = data.income.previousDifference;
    incomeRows.push(tableRow(['前回差額', '繰越', pd.sign || '+', formatNum(pd.amount)]));
  }
  // 当日差額
  if (data.income?.todayDifference) {
    const td = data.income.todayDifference;
    incomeRows.push(tableRow(['当日差額', '調整', td.sign || '+', formatNum(td.amount)]));
  }
  // 保険種別
  const categories = [
    { key: 'shaho', label: '社保' },
    { key: 'kokuho', label: '国保' },
    { key: 'kouki', label: '後期高齢者' },
    { key: 'jihi', label: '自費' },
    { key: 'hokenNashi', label: '保険なし' },
  ];
  for (const cat of categories) {
    const item = data.income?.[cat.key];
    if (item) {
      incomeRows.push(tableRow([cat.label, '窓口収入合計', `${item.count || 0}名`, formatNum(item.amount)]));
    }
  }
  // 物販
  if (data.income?.bushan) {
    incomeRows.push(tableRow(['物販収入', '窓口収入合計', data.income.bushan.note || '', formatNum(data.income.bushan.amount)]));
  }
  // 追加入金
  for (const extraKey of ['extra1', 'extra2']) {
    const extra = data.income?.[extraKey];
    if (extra && (extra.subject || extra.amount)) {
      incomeRows.push(tableRow([extra.subject || '', extra.destination || '', extra.note || '', formatNum(extra.amount)]));
    }
  }
  // 合計行
  incomeRows.push(tableRow(['合計', '', '', formatNum(data.income?.total)]));

  if (incomeRows.length > 0) {
    blocks.push(table(4, [
      tableRow(['科目', '入金先', '摘要', '入金額']),
      ...incomeRows,
    ]));
  }

  blocks.push(divider());

  // --- 窓口現金出金の記録 ---
  blocks.push(heading3('窓口現金出金の記録'));

  const expenseRows = [];
  for (const expKey of ['expense1', 'expense2', 'expense3']) {
    const exp = data.expense?.[expKey];
    if (exp && (exp.subject || exp.amount)) {
      expenseRows.push(tableRow([exp.subject || '', exp.destination || '', exp.note || '', formatNum(exp.amount)]));
    }
  }
  // 院長へ
  if (data.expense?.director) {
    expenseRows.push(tableRow(['', '', '院長へ', formatNum(data.expense.director)]));
  }
  // 合計
  expenseRows.push(tableRow(['合計', '', '', formatNum(data.expense?.total)]));

  if (expenseRows.length > 0) {
    blocks.push(table(4, [
      tableRow(['科目', '出金先', '摘要', '出金額']),
      ...expenseRows,
    ]));
  }

  blocks.push(divider());

  // --- 窓口現金出納 ---
  blocks.push(heading3('窓口現金出納'));
  blocks.push(table(2, [
    tableRow(['項目', '金額']),
    tableRow(['前日の繰越', formatNum(data.balance?.previous)]),
    tableRow(['本日の現金入金', formatNum(data.income?.total)]),
    tableRow(['本日の現金出金', formatNum(data.expense?.total)]),
    tableRow(['本日の残高', formatNum(data.balance?.final)]),
  ]));

  blocks.push(divider());

  // --- ストック ---
  blocks.push(heading3('ストック'));
  const stockItems = [
    { key: 'stock500', label: '500円' },
    { key: 'stock100', label: '100円' },
    { key: 'stock50', label: '50円' },
    { key: 'stock10', label: '10円' },
    { key: 'stock5', label: '5円' },
    { key: 'stock1', label: '1円' },
  ];
  const stockRows = stockItems.map(item => {
    const count = data.stock?.[item.key] || 0;
    const value = parseInt(item.label) * count;
    return tableRow([item.label, `${count}枚`, formatNum(value)]);
  });
  stockRows.push(tableRow(['ストック合計', '', formatNum(data.stock?.total)]));
  blocks.push(table(3, [
    tableRow(['金種', '枚数', '金額']),
    ...stockRows,
  ]));

  blocks.push(divider());

  // --- 本日の残高金種 ---
  blocks.push(heading3('本日の残高金種'));
  const currencyItems = [
    { key: 'bill10000', label: '1万円', unit: 10000 },
    { key: 'bill5000', label: '5千円', unit: 5000 },
    { key: 'bill2000', label: '2千円', unit: 2000 },
    { key: 'bill1000', label: '千円', unit: 1000 },
    { key: 'coin500', label: '500円', unit: 500 },
    { key: 'coin100', label: '100円', unit: 100 },
    { key: 'coin50', label: '50円', unit: 50 },
    { key: 'coin10', label: '10円', unit: 10 },
    { key: 'coin5', label: '5円', unit: 5 },
    { key: 'coin1', label: '1円', unit: 1 },
  ];
  const currencyRows = currencyItems.map(item => {
    const count = data.currency?.[item.key] || 0;
    const value = item.unit * count;
    return tableRow([item.label, `${count}枚`, formatNum(value)]);
  });
  currencyRows.push(tableRow(['金種合計', '', formatNum(data.currency?.total)]));
  currencyRows.push(tableRow(['総残高', '', formatNum(data.totalBalance)]));
  blocks.push(table(3, [
    tableRow(['金種', '枚数', '金額']),
    ...currencyRows,
  ]));

  blocks.push(divider());

  // --- 残高チェック ---
  blocks.push(heading3('残高チェック'));
  const bc = data.balanceCheck || {};
  const matchText = bc.isMatched ? '✓ 一致' : `✗ 差額 ${formatNum(bc.difference)}円`;
  blocks.push(paragraph(`実物残高: ${formatNum(bc.physicalBalance)}円`));
  blocks.push(paragraph(`計算残高: ${formatNum(bc.calculatedBalance)}円`));
  blocks.push(paragraph(`結果: ${matchText}`));

  return blocks;
}

// --- Notion ブロックヘルパー ---

function heading2(text) {
  return {
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: [{ type: 'text', text: { content: text } }],
    },
  };
}

function heading3(text) {
  return {
    object: 'block',
    type: 'heading_3',
    heading_3: {
      rich_text: [{ type: 'text', text: { content: text } }],
    },
  };
}

function paragraph(text) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: text } }],
    },
  };
}

function divider() {
  return {
    object: 'block',
    type: 'divider',
    divider: {},
  };
}

function table(width, rows) {
  return {
    object: 'block',
    type: 'table',
    table: {
      table_width: width,
      has_column_header: true,
      has_row_header: false,
      children: rows,
    },
  };
}

function tableRow(cells) {
  return {
    object: 'block',
    type: 'table_row',
    table_row: {
      cells: cells.map(cell => [
        { type: 'text', text: { content: String(cell ?? '') } },
      ]),
    },
  };
}

function formatNum(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('ja-JP');
}
