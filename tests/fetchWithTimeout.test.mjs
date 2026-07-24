import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithTimeout } from '../functions/api/_lib/fetchWithTimeout.js';

test('fetchWithTimeout：在超时前拿到响应时正常返回该响应', async () => {
  const fakeFetch = () => Promise.resolve({ ok: true, marker: 'real-response' });
  const res = await fetchWithTimeout('https://x', {}, 100, fakeFetch);
  assert.equal(res.marker, 'real-response');
});

test('fetchWithTimeout：超过时限且对方一直不响应时会 abort', async () => {
  const fakeFetch = (url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  await assert.rejects(
    () => fetchWithTimeout('https://x', {}, 20, fakeFetch),
    (err) => err.name === 'AbortError',
  );
});

test('fetchWithTimeout：拿到响应后不再受原定时限约束（不影响流式正文的后续读取耗时）', async () => {
  let aborted = false;
  const fakeFetch = (url, options) => {
    options.signal.addEventListener('abort', () => {
      aborted = true;
    });
    return Promise.resolve({ ok: true });
  };
  await fetchWithTimeout('https://x', {}, 10, fakeFetch);
  // 等到远超过原定的 10ms 时限，确认响应到手后计时器已被清除、不会补发 abort
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(aborted, false);
});

test('fetchWithTimeout：把 options 和 signal 一起透传给底层 fetch', async () => {
  let received;
  const fakeFetch = (url, options) => {
    received = options;
    return Promise.resolve({ ok: true });
  };
  await fetchWithTimeout('https://x', { method: 'POST', headers: { a: '1' } }, 100, fakeFetch);
  assert.equal(received.method, 'POST');
  assert.equal(received.headers.a, '1');
  assert.ok(received.signal instanceof AbortSignal);
});
