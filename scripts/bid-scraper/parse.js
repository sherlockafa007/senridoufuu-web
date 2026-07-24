// Pure HTML parsing for the bid scraper — no network, no Firebase.
// Depends only on cheerio, so it can be unit-tested against saved fixtures.
const cheerio = require('cheerio');

// Parse a Japanese date in either "2026年6月24日" or "2026/6/24" form → Date | null.
function parseJpDate(str) {
  if (!str) return null;
  let m = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) m = str.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d.getTime()) ? null : d;
}

// A bid is "closed" if its title carries an ended marker, the detail page was
// flagged ended, or its deadline is already in the past.
function isClosed(bid) {
  if (bid.ended) return true;
  if (/終了しました|募集を終了|受付を終了|受付終了/.test(bid.title || '')) return true;
  const dl = parseJpDate(bid.deadline);
  if (dl) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dl < today) return true;
  }
  return false;
}

// ── Osaka City ──────────────────────────────────────────────────────────────
function parseOsakaBids(html, target) {
  const $ = cheerio.load(html);
  const bids = [];

  $('.sec_01').each((_, el) => {
    const titleEl = $(el).find('h2 a');
    const title = titleEl.text().trim();
    const sourceUrl = titleEl.attr('href') || '';
    if (!title || !sourceUrl) return;

    const fields = {};
    $(el)
      .find('table.table01 tr')
      .each((_, row) => {
        const key = $(row).find('th').text().trim();
        const val = $(row).find('td').text().trim();
        if (key && val) fields[key] = val;
      });

    const budgetRaw = fields['予定価格'] || fields['上限額'] || fields['予算額'] || '';
    const itemCat = fields['種目'] || '';
    const budgetFromItem = /[0-9０-９].*円/.test(itemCat) ? itemCat : '';

    bids.push({
      title,
      source_url: sourceUrl,
      city: target.city,
      category: target.category,
      category_label: target.categoryLabel,
      announcement_date: fields['公告（公開）日'] || '',
      deadline: fields['入札（締切）日時'] || '',
      contract_method: fields['入札契約方式'] || '',
      ordering_bureau: fields['発注担当局等'] || '',
      budget: budgetRaw || budgetFromItem,
    });
  });

  return bids;
}

// ── Suita City ──────────────────────────────────────────────────────────────
function parseSuitaBids(html, target) {
  const $ = cheerio.load(html);
  const bids = [];
  const graceCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  $('table').each((_, table) => {
    // 「入札結果」表列的是已经决标的历史结果（開札日，不是募集期间），不是招标公告，跳过——
    // 否则该表因缺少「～」分隔符导致 deadline 解析成空值，反而绕过下面的过期宽限过滤混进结果里。
    const heading = $(table).prev('h2').text().trim();
    if (heading.includes('入札結果')) return;

    $(table)
      .find('tr')
      .each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length < 3) return;

        const titleEl = $(cells[0]).find('a');
        if (!titleEl.length) return;

        const title = titleEl.text().trim();
        const href = titleEl.attr('href') || '';
        if (!title || !href) return;

        const sourceUrl = href.startsWith('/')
          ? `https://www.city.suita.osaka.jp${href}`
          : new URL(href, target.url).toString();

        // Period cell, e.g. "2026年6月17日～2026年6月24日"
        const period = $(cells[1]).text().trim();
        const bureau = $(cells[2]).text().trim();

        // Deadline = the date after "～"; announced = the date before it.
        const parts = period.split('～');
        const deadlineDate = parseJpDate(parts[1] || '');
        const announcedDate = parseJpDate(parts[0] || '');

        // Skip bids whose deadline is more than 7 days past.
        if (deadlineDate && deadlineDate < graceCutoff) return;

        const fmt = (d) => (d ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` : '');

        bids.push({
          title,
          source_url: sourceUrl,
          city: target.city,
          category: target.category,
          category_label: target.categoryLabel,
          announcement_date: fmt(announcedDate),
          deadline: fmt(deadlineDate),
          ordering_bureau: bureau,
          budget: '',
        });
      });
  });

  return bids;
}

// ── Toyonaka City ───────────────────────────────────────────────────────────
function detectToyonakaCategory(title) {
  if (/購入|賃貸借|リース|端末|機器|物品|用品|消耗|備品/.test(title)) {
    return { category: 'buppin', categoryLabel: '物品購入' };
  }
  return { category: 'gyomuitaku', categoryLabel: '業務委託' };
}

function parseToyonakaLinks(html, target) {
  const $ = cheerio.load(html);
  const links = [];
  const seen = new Set();

  // Scope to the bid-list <ul class="norcor"> only. This excludes the global
  // mega-nav and the footer (個人情報 / 著作権 / サイトマップ / 組織と業務 /
  // リンク集), which live in div.footer — a completely separate subtree.
  // (The page's #CONT / .wysiwyg_wp wrappers get auto-closed early by the
  // parser due to malformed nesting, so we cannot rely on them.)
  $('ul.norcor a').each((_, el) => {
    const title = $(el).text().trim();
    let href = $(el).attr('href') || '';

    if (!title || title.length < 5) return;
    if (!href || href.startsWith('#') || href.startsWith('mailto') || href.startsWith('javascript'))
      return;
    if (/\.(pdf|docx?|xlsx?)$/i.test(href)) return;
    // Skip nav / index / result pages.
    if (/index\.html$|nyusatsu_kekka|hacchuyotei|zuiikeiyaku|3gozuikei|open_counter/.test(href))
      return;
    // Skip generic section-index titles (e.g. "公告（委託）") — they are listings, not a single bid.
    if (/^公告（(委託|工事|物品|建設|役務)）$/.test(title)) return;
    // Skip the about/sitemap section just in case it ever appears inside the body.
    if (/\/aboutweb\/|\/sitemap/.test(href)) return;

    const resolved = href.startsWith('/')
      ? `https://www.city.toyonaka.osaka.jp${href}`
      : href.startsWith('http')
        ? href
        : new URL(href, target.url).toString();

    // Only include pages on toyonaka.osaka.jp
    if (!resolved.includes('toyonaka.osaka.jp')) return;
    if (seen.has(resolved)) return;
    seen.add(resolved);

    links.push({ title, source_url: resolved });
  });

  return links;
}

module.exports = {
  parseJpDate,
  isClosed,
  detectToyonakaCategory,
  parseOsakaBids,
  parseSuitaBids,
  parseToyonakaLinks,
};
