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
