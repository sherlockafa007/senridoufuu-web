const axios = require('axios');
const cheerio = require('cheerio');
const { createHash } = require('crypto');
const admin = require('firebase-admin');

const TARGETS = [
  {
    url: 'https://www.city.osaka.lg.jp/templates/gyomuitaku_nyusatsuanken/0-Curr.html',
    category: 'gyomuitaku',
    categoryLabel: '業務委託',
  },
  {
    url: 'https://www.city.osaka.lg.jp/templates/buppin_nyusatsuanken/0-Curr.html',
    category: 'buppin',
    categoryLabel: '物品供給',
  },
];

function initFirebase() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  return admin.firestore();
}

function urlHash(url) {
  return createHash('md5').update(url).digest('hex');
}

function parseBids(html, category, categoryLabel) {
  const $ = cheerio.load(html);
  const bids = [];

  $('.sec_01').each((_, el) => {
    const titleEl = $(el).find('h2 a');
    const title = titleEl.text().trim();
    const sourceUrl = titleEl.attr('href') || '';

    if (!title || !sourceUrl) return;

    const fields = {};
    $(el).find('table.table01 tr').each((_, row) => {
      const key = $(row).find('th').text().trim();
      const val = $(row).find('td').text().trim();
      if (key && val) fields[key] = val;
    });

    // Extract budget if field contains yen amount or explicit price
    const budgetRaw = fields['予定価格'] || fields['上限額'] || fields['予算額'] || '';
    const itemCategory = fields['種目'] || '';
    // Some listings embed price in 種目 field (e.g. "〇〇円以内")
    const budgetFromItem = /[0-9０-９].*円/.test(itemCategory) ? itemCategory : '';
    const budget = budgetRaw || budgetFromItem;

    bids.push({
      title,
      source_url: sourceUrl,
      category,
      category_label: categoryLabel,
      announcement_date: fields['公告（公開）日'] || '',
      deadline: fields['入札（締切）日時'] || '',
      contract_method: fields['入札契約方式'] || '',
      ordering_bureau: fields['発注担当局等'] || '',
      budget,
    });
  });

  return bids;
}

async function translate(bid) {
  const prompt = `你是一名专业的日中双语翻译助手。请将以下日本大阪市政府招标信息翻译并整理为简体中文。

招标标题：${bid.title}
发注单位：${bid.ordering_bureau}
截止日期：${bid.deadline}
类别：${bid.category_label}

【重要】请严格用简体中文输出，禁止出现任何日语假名或汉字日语词汇。按以下格式输出：
【内容】用1～2句中文简述招标内容
【发注元】发注单位的中文译名
【截标】截止日期（用中文表达，如"2026年3月12日（星期三）下午2时"）`;

  const res = await axios.post(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    {
      model: 'qwen-plus',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.QWEN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  return res.data.choices?.[0]?.message?.content?.trim() || '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const db = initFirebase();
  const bidsCol = db.collection('bids');

  let totalNew = 0;

  for (const target of TARGETS) {
    console.log(`Fetching ${target.url}`);

    let html;
    try {
      const res = await axios.get(target.url, {
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BidScraper/1.0)' },
      });
      html = res.data;
    } catch (err) {
      console.error(`Failed to fetch ${target.url}: ${err.message}`);
      continue;
    }

    const bids = parseBids(html, target.category, target.categoryLabel);
    console.log(`  Found ${bids.length} bids`);

    for (const bid of bids) {
      const hash = urlHash(bid.source_url);

      const existing = await bidsCol.where('url_hash', '==', hash).limit(1).get();
      if (!existing.empty) {
        continue;
      }

      let summary = '';
      try {
        summary = await translate(bid);
      } catch (err) {
        console.error(`  Translation failed for "${bid.title}": ${err.message}`);
      }

      await bidsCol.add({
        ...bid,
        url_hash: hash,
        summary_zh: summary,
        scraped_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`  + ${bid.title}`);
      totalNew++;

      await sleep(600);
    }
  }

  console.log(`Done. ${totalNew} new bids added.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
