// LLM 抽取模块的纯函数测试（不含网络调用）。
const test = require('node:test');
const assert = require('node:assert');
const {
  extractPageText,
  buildExtractionPrompt,
  parseExtractedBids,
} = require('../scripts/bid-scraper/extract');

test('extractPageText 去掉脚本/导航/页脚，保留正文', () => {
  const html = `<html><head><style>.x{}</style></head><body>
    <nav>导航菜单 站点地图</nav>
    <main><h1>入札公告</h1><p>業務委託の入札を実施します。</p></main>
    <footer>版权所有 Copyright</footer>
    <script>console.log('x')</script>
  </body></html>`;
  const text = extractPageText(html);
  assert.ok(text.includes('入札公告'));
  assert.ok(text.includes('業務委託'));
  assert.ok(!text.includes('导航菜单'));
  assert.ok(!text.includes('Copyright'));
  assert.ok(!text.includes('console.log'));
});

test('buildExtractionPrompt 含城市名与正文，且要求 JSON 数组', () => {
  const p = buildExtractionPrompt('某招标正文', { city: '大阪市' });
  assert.ok(p.includes('大阪市'));
  assert.ok(p.includes('某招标正文'));
  assert.ok(p.includes('JSON 数组'));
});

test('parseExtractedBids 解析裸 JSON 数组', () => {
  const r = parseExtractedBids('[{"title":"A","deadline":"2026年3月1日"},{"title":"B"}]');
  assert.equal(r.length, 2);
  assert.equal(r[0].title, 'A');
});

test('parseExtractedBids 容忍 ```json 代码块包裹', () => {
  const r = parseExtractedBids('```json\n[{"title":"甲"}]\n```');
  assert.equal(r.length, 1);
  assert.equal(r[0].title, '甲');
});

test('parseExtractedBids 容忍数组前后有解释文字', () => {
  const r = parseExtractedBids('好的，结果如下：[{"title":"X"}] 以上。');
  assert.equal(r.length, 1);
});

test('parseExtractedBids 过滤掉无 title 的项', () => {
  const r = parseExtractedBids('[{"title":"有"},{"deadline":"无标题"},{"title":""}]');
  assert.equal(r.length, 1);
  assert.equal(r[0].title, '有');
});

test('parseExtractedBids 空数组正常返回 []（区别于异常 null）', () => {
  assert.deepEqual(parseExtractedBids('[]'), []);
});

test('parseExtractedBids 非法输入返回 null（表示抽取异常）', () => {
  assert.equal(parseExtractedBids(''), null);
  assert.equal(parseExtractedBids('抱歉我无法完成'), null);
  assert.equal(parseExtractedBids(null), null);
  assert.equal(parseExtractedBids('{"title":"不是数组"}'), null);
});
