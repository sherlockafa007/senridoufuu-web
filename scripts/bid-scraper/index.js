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

    bids.push({
      title,
      source_url: sourceUrl,
      category,
      category_label: categoryLabel,
      announcement_date: fields['公告（公開）日'] || '',
      deadline: fields['入札（締切）日時'] || '',
      contract_method: fields['入札契約方式'] || '',
      ordering_bureau: fields['発注担当局等'] || '',
    });
  });

  return bids;
}

async function translate(bid) {
  const prompt = `以下は大阪市の入札案件です。中国語で簡潔にまとめてください。

案件名：${bid.title}
発注元：${bid.ordering_bureau}
締切：${bid.deadline}
種別：${bid.category_label}

以下の形式で出力してください（日本語は使わないこと）：
【内容】（案件の内容を1〜2文で）
【発注元】（発注局名）
【截标】（締切日時）`;

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
