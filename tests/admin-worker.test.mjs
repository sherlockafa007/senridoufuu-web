// sdf-admin Worker 纯逻辑测试（validate / rateLimit）。
// .mjs：Worker 源码是 ESM，CommonJS 测试文件无法静态 import。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigin, validateContentPayload } from '../workers/sdf-admin/src/validate.js';
import { createRateLimiter } from '../workers/sdf-admin/src/rateLimit.js';

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
