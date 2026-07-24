import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visitDocId } from '../js/shared/track-visit-id.js';

test('visitDocId：同一身份/页面/日期产出相同ID（同一天内多次访问应该去重到一条）', () => {
  const a = visitDocId('user@x.com', 'translation', new Date('2026-07-24T01:00:00Z'));
  const b = visitDocId('user@x.com', 'translation', new Date('2026-07-24T23:00:00Z'));
  assert.equal(a, b);
});

test('visitDocId：不同身份产出不同ID', () => {
  const now = new Date('2026-07-24T10:00:00Z');
  assert.notEqual(
    visitDocId('user@x.com', 'translation', now),
    visitDocId('anon_abc123', 'translation', now),
  );
});

test('visitDocId：不同页面产出不同ID', () => {
  const now = new Date('2026-07-24T10:00:00Z');
  assert.notEqual(
    visitDocId('user@x.com', 'translation', now),
    visitDocId('user@x.com', 'lifestory', now),
  );
});

test('visitDocId：跨天产出不同ID', () => {
  assert.notEqual(
    visitDocId('user@x.com', 'translation', new Date('2026-07-24T23:59:59Z')),
    visitDocId('user@x.com', 'translation', new Date('2026-07-25T00:00:01Z')),
  );
});

test('visitDocId：格式为 identity_page_YYYY-MM-DD', () => {
  const id = visitDocId('user@x.com', 'translation', new Date('2026-07-24T10:00:00Z'));
  assert.equal(id, 'user@x.com_translation_2026-07-24');
});
