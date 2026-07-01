const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseJpDate,
  isClosed,
  parseSuitaBids,
  parseToyonakaLinks,
} = require('../scripts/bid-scraper/parse');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

test('parseJpDate 支持年月日与斜杠两种格式', () => {
  const a = parseJpDate('2026年6月24日');
  assert.equal(a.getFullYear(), 2026);
  assert.equal(a.getMonth(), 5); // 0-based：6 月
  assert.equal(a.getDate(), 24);
  const b = parseJpDate('2026/6/24');
  assert.equal(b.getMonth(), 5);
  assert.equal(parseJpDate('情報未提供'), null);
});

test('isClosed：过截标日或标题含終了 判为已结束', () => {
  assert.equal(isClosed({ deadline: '2020年1月1日' }), true);
  assert.equal(isClosed({ deadline: '2099年1月1日' }), false);
  assert.equal(isClosed({ title: '……(終了しました)' }), true);
});

test('parseSuitaBids：解析年月日截标，过滤>7天过期', () => {
  const target = {
    url: 'https://www.city.suita.osaka.jp/sangyo/1017983/1017993/1042102/index.html',
    city: '吹田市',
    category: 'gyomuitaku',
    categoryLabel: '業務委託',
  };
  const bids = parseSuitaBids(fixture('suita-sample.html'), target);
  // 未来案件保留，过期(2020)被 7 天宽限过滤掉
  assert.equal(bids.length, 1);
  assert.match(bids[0].title, /未来案件/);
  assert.equal(bids[0].deadline, '2099年2月20日');
});

test('parseToyonakaLinks：只取正文招标，隔离页脚 junk 与索引页', () => {
  const target = {
    url: 'https://www.city.toyonaka.osaka.jp/jigyosya/keiyaku/kokokutanto/index.html',
    city: '豊中市',
  };
  const links = parseToyonakaLinks(fixture('toyonaka-sample.html'), target);
  const titles = links.map((l) => l.title).join(' | ');
  assert.match(titles, /実在の業務委託/); // 真招标在
  assert.doesNotMatch(titles, /サイトマップ/); // 页脚被隔离
  assert.doesNotMatch(titles, /著作権/);
  assert.doesNotMatch(titles, /^公告（委託）$/); // 索引页被排除
});
