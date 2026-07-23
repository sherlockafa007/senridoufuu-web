// sdf-admin Worker 纯逻辑测试（validate / rateLimit）。
// .mjs：Worker 源码是 ESM，CommonJS 测试文件无法静态 import。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigin, validateContentPayload } from '../workers/sdf-admin/src/validate.js';
import { createRateLimiter } from '../workers/sdf-admin/src/rateLimit.js';
import {
  validateTranslateFields,
  buildTranslatePrompt,
  parseTranslateResponse,
} from '../workers/sdf-admin/src/translate.js';
import {
  generateSlug,
  validatePublishPayload,
  upsertPost,
  removePost,
  renderArticleHtml,
  escapeHtml,
} from '../workers/sdf-admin/src/blog.js';
import {
  MAX_IMAGE_BYTES,
  validateImageKey,
  validateImageDataUrl,
  siteImagePath,
  blogInlineImagePath,
} from '../workers/sdf-admin/src/images.js';

test('allowedOrigin 只放行正式域与 localhost', () => {
  assert.equal(allowedOrigin('https://www.senridf.com'), true);
  assert.equal(allowedOrigin('https://senridf.com'), true);
  assert.equal(allowedOrigin('http://localhost:3000'), true);
  assert.equal(allowedOrigin('http://localhost'), true);
  assert.equal(allowedOrigin('https://evil.example.com'), false);
  assert.equal(allowedOrigin('http://localhost.evil.com'), false);
  assert.equal(allowedOrigin(''), false);
});

test('validateContentPayload 接受合法覆盖对象', () => {
  const ok = validateContentPayload({
    ja: { hero_tagline: 'あいうえお' },
    zh: {},
    en: { mission_title: 'Our Mission' },
    images: { og_image: 'https://x/y.png' },
  });
  assert.equal(ok.ok, true);
});

test('validateContentPayload 接受空对象（全部用默认值）', () => {
  assert.equal(validateContentPayload({}).ok, true);
});

test('validateContentPayload 拒绝非法结构', () => {
  assert.equal(validateContentPayload(null).ok, false);
  assert.equal(validateContentPayload([]).ok, false);
  assert.equal(validateContentPayload('x').ok, false);
  assert.equal(validateContentPayload({ fr: {} }).ok, false); // 未知分组
  assert.equal(validateContentPayload({ ja: { k: 123 } }).ok, false); // 值必须是字符串
  assert.equal(validateContentPayload({ ja: 'x' }).ok, false); // 分组必须是对象
  assert.equal(validateContentPayload({ ja: ['x'] }).ok, false); // 分组不能是数组
});

test('validateContentPayload 拒绝超大载荷', () => {
  const big = { ja: { k: 'x'.repeat(120000) } };
  assert.equal(big.ja.k.length > 100000, true);
  assert.equal(validateContentPayload(big).ok, false);
});

test('createRateLimiter 同一分钟超限后拦截、跨分钟重置', () => {
  let fakeNow = 0;
  const isLimited = createRateLimiter({ limit: 3, now: () => fakeNow });
  assert.equal(isLimited('u1'), false);
  assert.equal(isLimited('u1'), false);
  assert.equal(isLimited('u1'), false);
  assert.equal(isLimited('u1'), true); // 第 4 次拦
  assert.equal(isLimited('u2'), false); // 不同用户互不影响
  fakeNow = 61_000; // 下一分钟
  assert.equal(isLimited('u1'), false);
});

test('validateTranslateFields 接受合法的字段数组', () => {
  const ok = validateTranslateFields([{ key: 'hero_tagline', zh: '你好世界' }]);
  assert.equal(ok.ok, true);
});

test('validateTranslateFields 拒绝空数组/非数组', () => {
  assert.equal(validateTranslateFields([]).ok, false);
  assert.equal(validateTranslateFields(null).ok, false);
  assert.equal(validateTranslateFields('x').ok, false);
});

test('validateTranslateFields 拒绝缺 key 或缺 zh 的项', () => {
  assert.equal(validateTranslateFields([{ key: 'a' }]).ok, false);
  assert.equal(validateTranslateFields([{ zh: '你好' }]).ok, false);
  assert.equal(validateTranslateFields([{ key: '', zh: '你好' }]).ok, false);
  assert.equal(validateTranslateFields([{ key: 'a', zh: '' }]).ok, false);
});

test('validateTranslateFields 拒绝字段过多或内容过长', () => {
  const many = Array.from({ length: 201 }, (_, i) => ({ key: `k${i}`, zh: '内容' }));
  assert.equal(validateTranslateFields(many).ok, false);
  const long = [{ key: 'k', zh: 'x'.repeat(20001) }];
  assert.equal(validateTranslateFields(long).ok, false);
});

test('buildTranslatePrompt 包含每条字段的 key 和中文原文', () => {
  const p = buildTranslatePrompt([
    { key: 'hero_tagline', zh: '你好世界' },
    { key: 'mission_body', zh: '第二条内容' },
  ]);
  assert.ok(p.includes('hero_tagline'));
  assert.ok(p.includes('你好世界'));
  assert.ok(p.includes('mission_body'));
  assert.ok(p.includes('第二条内容'));
  assert.ok(p.includes('JSON'));
});

test('parseTranslateResponse 解析裸 JSON 对象', () => {
  const r = parseTranslateResponse('{"ja":{"a":"あ"},"en":{"a":"A"}}');
  assert.deepEqual(r, { ja: { a: 'あ' }, en: { a: 'A' } });
});

test('parseTranslateResponse 容忍 ```json 代码块包裹与前后解释文字', () => {
  const r1 = parseTranslateResponse('```json\n{"ja":{"a":"あ"},"en":{"a":"A"}}\n```');
  assert.deepEqual(r1, { ja: { a: 'あ' }, en: { a: 'A' } });
  const r2 = parseTranslateResponse('好的，结果如下：{"ja":{"a":"あ"},"en":{"a":"A"}} 以上。');
  assert.deepEqual(r2, { ja: { a: 'あ' }, en: { a: 'A' } });
});

test('parseTranslateResponse 过滤非字符串值，容忍缺 ja 或缺 en', () => {
  const r = parseTranslateResponse('{"ja":{"a":"あ","b":123},"en":{}}');
  assert.deepEqual(r, { ja: { a: 'あ' }, en: {} });
  const r2 = parseTranslateResponse('{"ja":{"a":"あ"}}');
  assert.deepEqual(r2, { ja: { a: 'あ' }, en: {} });
});

test('parseTranslateResponse 过滤模型凭空发明的字段名（不在 validKeys 里）', () => {
  // 真实踩坑复现：多行内容被模型拆成 ms3_desc + 凭空发明的 ms3_desc2
  const r = parseTranslateResponse(
    '{"ja":{"ms3_desc":"あ","ms3_desc2":"い"},"en":{"ms3_desc":"A","ms3_desc2":"B"}}',
    ['ms3_desc'],
  );
  assert.deepEqual(r, { ja: { ms3_desc: 'あ' }, en: { ms3_desc: 'A' } });
});

test('parseTranslateResponse 不传 validKeys 时不过滤（向后兼容）', () => {
  const r = parseTranslateResponse('{"ja":{"a":"あ","b":"い"},"en":{}}');
  assert.deepEqual(r, { ja: { a: 'あ', b: 'い' }, en: {} });
});

test('parseTranslateResponse 非法输入返回 null（表示翻译异常）', () => {
  assert.equal(parseTranslateResponse(''), null);
  assert.equal(parseTranslateResponse(null), null);
  assert.equal(parseTranslateResponse('抱歉我无法完成'), null);
  assert.equal(parseTranslateResponse('[1,2,3]'), null);
});

test('generateSlug 格式为 日期-4位十六进制', () => {
  const s = generateSlug('2026-07-22', () => 0.5);
  assert.match(s, /^2026-07-22-[0-9a-f]{4}$/);
});

test('generateSlug 不同随机数产出不同短码', () => {
  const a = generateSlug('2026-07-22', () => 0.1);
  const b = generateSlug('2026-07-22', () => 0.9);
  assert.notEqual(a, b);
});

test('validatePublishPayload 接受合法载荷', () => {
  const ok = validatePublishPayload({
    tag: 'AI',
    date: '2026-07-22',
    title: { ja: 'あ', zh: '中', en: 'A' },
    body: { ja: 'あ本文', zh: '中文正文', en: 'Body' },
  });
  assert.equal(ok.ok, true);
});

test('validatePublishPayload 拒绝缺字段/格式错误', () => {
  assert.equal(validatePublishPayload(null).ok, false);
  assert.equal(validatePublishPayload({}).ok, false);
  assert.equal(
    validatePublishPayload({ tag: 'AI', date: '2026/07/22', title: {}, body: {} }).ok,
    false,
  ); // 日期格式必须 YYYY-MM-DD
  assert.equal(
    validatePublishPayload({
      tag: 'AI',
      date: '2026-07-22',
      title: { ja: 'あ', zh: '', en: 'A' },
      body: { ja: 'x', zh: 'x', en: 'x' },
    }).ok,
    false,
  ); // zh 标题为空
});

test('validatePublishPayload 接受不带封面图，拒绝超大封面图（1MB 上限）', () => {
  const base = {
    tag: 'AI',
    date: '2026-07-22',
    title: { ja: 'a', zh: 'a', en: 'a' },
    body: { ja: 'a', zh: 'a', en: 'a' },
  };
  assert.equal(validatePublishPayload(base).ok, true);
  const huge = { ...base, cover: 'data:image/webp;base64,' + 'A'.repeat(1_400_000) };
  assert.equal(validatePublishPayload(huge).ok, false);
  const okSize = { ...base, cover: 'data:image/webp;base64,' + 'A'.repeat(800_000) };
  assert.equal(validatePublishPayload(okSize).ok, true); // 约600KB：超过旧的500KB上限、在新的1MB上限之内，真正验证了本次改动的效果
});

test('upsertPost 插入新文章并按日期倒序', () => {
  const posts = [{ slug: 'a', date: '2026-07-01' }];
  const updated = upsertPost(posts, { slug: 'b', date: '2026-07-20' });
  assert.deepEqual(
    updated.map((p) => p.slug),
    ['b', 'a'],
  );
});

test('upsertPost 按 slug 更新已有文章（不重复）', () => {
  const posts = [{ slug: 'a', date: '2026-07-01', tag: '旧' }];
  const updated = upsertPost(posts, { slug: 'a', date: '2026-07-01', tag: '新' });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].tag, '新');
});

test('removePost 按 slug 移除，找不到则原样返回', () => {
  const posts = [{ slug: 'a' }, { slug: 'b' }];
  assert.deepEqual(
    removePost(posts, 'a').map((p) => p.slug),
    ['b'],
  );
  assert.deepEqual(
    removePost(posts, 'zzz').map((p) => p.slug),
    ['a', 'b'],
  );
});

test('escapeHtml 转义特殊字符', () => {
  assert.equal(escapeHtml('<a>&"</a>'), '&lt;a&gt;&amp;&quot;&lt;/a&gt;');
});

test('renderArticleHtml 包含三语数据、正确转义标题、marked/DOMPurify 引用', () => {
  const html = renderArticleHtml({
    slug: '2026-07-22-a3f8',
    date: '2026-07-22',
    tag: 'AI',
    title: { ja: '<script>', zh: '中文标题', en: 'Title' },
    body: { ja: 'あ', zh: '中', en: 'body' },
    cover: null,
  });
  assert.ok(html.includes('marked@12.0.2'));
  assert.ok(html.includes('dompurify@3.4.12'));
  assert.ok(html.includes('&lt;script&gt;')); // <title> 标签里转义
  assert.ok(!html.includes('</script><script>')); // 不能因标题里的 <script> 提前截断
  assert.ok(html.includes('"zh":{"title":"中文标题"'));
  assert.ok(html.includes('<base href="../../">'));
});

test('renderArticleHtml 防止正文里的 </script> 提前截断内嵌数据脚本', () => {
  const html = renderArticleHtml({
    slug: 's',
    date: '2026-07-22',
    tag: 'AI',
    title: { ja: 'a', zh: 'a', en: 'a' },
    body: { ja: 'x</script>alert(1)', zh: 'a', en: 'a' },
    cover: null,
  });
  assert.ok(!html.includes('</script>alert(1)'));
  assert.ok(html.includes('\\u003c/script>alert(1)'));
});

test('renderArticleHtml 有封面图时插入 img 标签，无封面图时不插入', () => {
  const withCover = renderArticleHtml({
    slug: 's',
    date: '2026-07-22',
    tag: 'AI',
    title: { ja: 'a', zh: 'a', en: 'a' },
    body: { ja: 'a', zh: 'a', en: 'a' },
    cover: 'assets/images/blog/s-cover.webp',
  });
  assert.ok(withCover.includes('assets/images/blog/s-cover.webp'));
  const noCover = renderArticleHtml({
    slug: 's',
    date: '2026-07-22',
    tag: 'AI',
    title: { ja: 'a', zh: 'a', en: 'a' },
    body: { ja: 'a', zh: 'a', en: 'a' },
    cover: null,
  });
  assert.ok(!noCover.includes('blog-post__cover'));
});

test('validateImageKey 只接受字母数字下划线，长度1-64', () => {
  assert.equal(validateImageKey('team1_photo'), true);
  assert.equal(validateImageKey(''), false);
  assert.equal(validateImageKey('a'.repeat(65)), false);
  assert.equal(validateImageKey('../etc/passwd'), false);
  assert.equal(validateImageKey('has space'), false);
  assert.equal(validateImageKey(123), false);
});

test('validateImageDataUrl 接受合法 data URL 且在大小限制内', () => {
  const small = 'data:image/webp;base64,' + 'A'.repeat(1000);
  const r = validateImageDataUrl(small);
  assert.equal(r.ok, true);
  assert.equal(r.base64, 'A'.repeat(1000));
});

test('validateImageDataUrl 拒绝非 data URL / 非字符串', () => {
  assert.equal(validateImageDataUrl('not-a-data-url').ok, false);
  assert.equal(validateImageDataUrl(null).ok, false);
  assert.equal(validateImageDataUrl(123).ok, false);
});

test('validateImageDataUrl 拒绝超过 1MB 的图片', () => {
  const huge = 'data:image/webp;base64,' + 'A'.repeat(1_400_000);
  assert.equal(validateImageDataUrl(huge).ok, false);
});

test('MAX_IMAGE_BYTES 是 1MB（1_000_000）', () => {
  assert.equal(MAX_IMAGE_BYTES, 1_000_000);
});

test('siteImagePath 格式为 assets/images/site/<key>-<时间戳>.webp', () => {
  const p = siteImagePath('team1_photo', 1721700000000);
  assert.equal(p, 'assets/images/site/team1_photo-1721700000000.webp');
});

test('blogInlineImagePath 格式为 assets/images/blog/inline-<时间戳>-<6位hex>.webp', () => {
  const p = blogInlineImagePath(1721700000000, () => 0.5);
  assert.match(p, /^assets\/images\/blog\/inline-1721700000000-[0-9a-f]{6}\.webp$/);
});

test('blogInlineImagePath 不同随机数产出不同文件名', () => {
  const a = blogInlineImagePath(1721700000000, () => 0.1);
  const b = blogInlineImagePath(1721700000000, () => 0.9);
  assert.notEqual(a, b);
});
