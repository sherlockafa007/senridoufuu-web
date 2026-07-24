# 3D 稳定性：前端错误边界 + API 超时兜底 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补建 `js/shared/auth-gate.js` 统一登录门控（异常不再致整页白屏），`js/main.js` 关键初始化分区隔离，`functions/api/` 六个端点接入超时+统一错误兜底，试点迁移一个页面验证。

**Architecture:** 登录门控拆成"纯判定函数（可测）+ DOM/Firebase 装配层（不测，人工验证）"两个文件；API 侧新增一个共享 `fetchWithTimeout` 工具，用 `AbortController` 只对"发出请求到收到首个响应"计时，不影响流式响应的后续读取时长。

**Tech Stack:** 纯静态零构建，浏览器原生 ES Modules，Cloudflare Pages Functions，`node --test`。

---

## 背景（写代码前必读）

- 设计文档：`docs/specs/2026-07-24-stability-error-handling-design.md`（每个任务对应其中章节，任务里会标注）。
- 项目是纯静态零构建站点，Windows 环境，部署链路：本地 `git commit` → 手动 `git push`（要先总结再推）→ 自动镜像 workflow → 同事 Cloudflare Pages 构建上线。**当前镜像链路暂时故障**（`MIRROR_PAT` 需同事重新生成，约3周后），这次改动 push 到自己仓库没问题，但不会自动同步到线上——这不影响开发和测试，只影响"人工验证"那步的时机。
- **模块类型坑（必读，否则测试写不通）**：仓库根 `package.json` 是 `"type": "commonjs"`。`js/shared/`、`functions/`、`workers/sdf-admin/` 下的 `.js` 文件用的是浏览器 ES Modules 语法（`export`/`import`），但从来没被 Node 直接 `require`/`import` 过，只被 `<script type="module">` 加载。`workers/sdf-admin/` 已经有先例：它自己的 `package.json` 写 `{"type":"module"}`，覆盖根配置，测试文件用 `.mjs` 扩展名（`tests/admin-worker.test.mjs`）去 `import`。这次给 `functions/` 和 `js/shared/` 也各加一个同样的 `package.json`，纯粹是为了让 `node --test` 能正确解析这些文件的 `export` 语法——**对 Cloudflare 的实际部署和浏览器加载完全没有影响**（Cloudflare Functions 的打包、浏览器的 `type="module"` 都不看 Node 的 `package.json`）。
- 现有纯逻辑测试都在仓库根 `tests/` 目录下，文件名 `<topic>.test.js`（CommonJS 语境）或 `<topic>.test.mjs`（需要 `import` 时）。运行命令 `npm test`（`node --test`，自动发现 `tests/*.test.*`）。
- `js/shared/admins.js` 现有内容：`export const ADMINS = [...]` 和 `export function isAdmin(user) { return ADMINS.includes(user.email); }`（不需要改，直接复用）。
- `functions/api/_middleware.js` 已经统一处理鉴权/CORS/限流，各端点文件（`analyze-stream.js` 等）不需要重复这些，只处理自己的业务逻辑。

---

### Task 1: `fetchWithTimeout` 共享工具（纯逻辑 + 测试）

对应设计文档 §5。

**Files:**
- Create: `functions/package.json`
- Create: `functions/api/_lib/fetchWithTimeout.js`
- Create: `tests/fetchWithTimeout.test.mjs`

- [ ] **Step 1: 创建 `functions/package.json`**

```json
{
  "type": "module"
}
```

- [ ] **Step 2: 写失败的测试 `tests/fetchWithTimeout.test.mjs`**

```js
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
```

- [ ] **Step 3: 运行测试确认因模块不存在而失败**

Run: `npm test`
Expected: FAIL，报错类似 `Cannot find module '../functions/api/_lib/fetchWithTimeout.js'`

- [ ] **Step 4: 创建 `functions/api/_lib/fetchWithTimeout.js`**

```js
// 给对外部服务（Qwen/Deepgram）的请求包一层超时。
// 只对"发出请求到收到首个响应"计时——一旦 fetch 的 Promise 落定（拿到 Response 对象，
// 哪怕是流式响应刚建立连接的那一刻），计时器就被清除，不影响后续读取正文/流的耗时。
// 长文档翻译/文书分析这类耗时久的调用不受影响；真正卡死无响应的连接会被按时 abort。
export async function fetchWithTimeout(url, options = {}, timeoutMs = 30000, fetchFn = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 5: 运行测试确认全部通过**

Run: `npm test`
Expected: PASS，新增的 4 个测试全绿

- [ ] **Step 6: Commit**

```bash
git add functions/package.json functions/api/_lib/fetchWithTimeout.js tests/fetchWithTimeout.test.mjs
git commit -m "feat(api): add fetchWithTimeout shared helper for outbound Qwen/Deepgram calls"
```
commit message 结尾加：
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 2: 6 个 `/api` 端点接入超时 + 统一异常兜底

对应设计文档 §5。这些端点目前对外部 fetch 调用没有超时、也没有外层 try/catch——网络异常会抛未捕获异常，Cloudflare 返回通用 500 页面而不是可解析的 JSON。

**Files:**
- Modify: `functions/api/translate.js`
- Modify: `functions/api/deepgram-token.js`
- Modify: `functions/api/analyze-stream.js`
- Modify: `functions/api/proofread.js`
- Modify: `functions/api/summary.js`
- Modify: `functions/api/translate-stream.js`

- [ ] **Step 1: `functions/api/translate.js`**

把文件顶部加一行 import：
```js
// Cloudflare Pages Function — non-streaming translation proxy
import { fetchWithTimeout } from './_lib/fetchWithTimeout.js';
```

把：
```js
  const upstream = await fetch(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 2000,
        temperature: 0.2,
      }),
    },
  );

  const data = await upstream.json();
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: data.error?.message || 'Qwen API error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ content: data.choices[0].message.content }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```
改成：
```js
  try {
    const upstream = await fetchWithTimeout(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'qwen-plus',
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          max_tokens: 2000,
          temperature: 0.2,
        }),
      },
    );

    const data = await upstream.json();
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || 'Qwen API error' }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ content: data.choices[0].message.content }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err.name === 'AbortError' ? '请求超时，请稍后重试' : '翻译服务暂时不可用，请稍后重试';
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

- [ ] **Step 2: `functions/api/deepgram-token.js`**

把文件顶部加一行 import（放在现有注释之后）：
```js
import { fetchWithTimeout } from './_lib/fetchWithTimeout.js';
```

把：
```js
  const grant = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl_seconds: 300 }),
  });

  const data = await grant.json();
  if (!grant.ok) {
    return new Response(
      JSON.stringify({
        error: data.err_msg || data.error || 'Deepgram token grant failed',
      }),
      { status: grant.status, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // { access_token, expires_in } — client connects via WS subprotocol ['bearer', access_token]
  return new Response(
    JSON.stringify({
      access_token: data.access_token,
      expires_in: data.expires_in,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
```
改成：
```js
  try {
    const grant = await fetchWithTimeout('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: 300 }),
    });

    const data = await grant.json();
    if (!grant.ok) {
      return new Response(
        JSON.stringify({
          error: data.err_msg || data.error || 'Deepgram token grant failed',
        }),
        { status: grant.status, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // { access_token, expires_in } — client connects via WS subprotocol ['bearer', access_token]
    return new Response(
      JSON.stringify({
        access_token: data.access_token,
        expires_in: data.expires_in,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err.name === 'AbortError' ? '请求超时，请稍后重试' : '语音服务暂时不可用，请稍后重试';
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

- [ ] **Step 3: `functions/api/analyze-stream.js`**

把文件顶部加一行 import：
```js
// Cloudflare Pages Function — streaming proxy for DashScope analysis
import { fetchWithTimeout } from './_lib/fetchWithTimeout.js';
```

把：
```js
  const upstream = await fetch(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 2000,
        temperature: 0.2,
        stream: true,
      }),
    },
  );

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}));
    return new Response(JSON.stringify({ error: err.error?.message || 'Qwen API error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
```
改成：
```js
  try {
    const upstream = await fetchWithTimeout(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'qwen-plus',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 2000,
          temperature: 0.2,
          stream: true,
        }),
      },
    );

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: err.error?.message || 'Qwen API error' }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    const msg = err.name === 'AbortError' ? '请求超时，请稍后重试' : '分析服务暂时不可用，请稍后重试';
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

- [ ] **Step 4: `functions/api/proofread.js`**

在文件顶部（`const MAX_CHARS = 20000;` 之前）加：
```js
import { fetchWithTimeout } from './_lib/fetchWithTimeout.js';

const MAX_CHARS = 20000;
```

把：
```js
  const qwenRes = await fetch(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${context.env.QWEN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [{ role: 'user', content: buildPrompt(input) }],
        max_tokens: 6000,
      }),
    },
  );

  if (!qwenRes.ok) {
    const err = await qwenRes.text();
    return new Response(JSON.stringify({ error: `AI 服务错误：${err}` }), {
      status: 502,
    });
  }

  const data = await qwenRes.json();
  const result = data.choices?.[0]?.message?.content?.trim() || '';

  return new Response(JSON.stringify({ result, truncated, char_count: text.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```
改成：
```js
  try {
    const qwenRes = await fetchWithTimeout(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${context.env.QWEN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen-plus',
          messages: [{ role: 'user', content: buildPrompt(input) }],
          max_tokens: 6000,
        }),
      },
    );

    if (!qwenRes.ok) {
      const err = await qwenRes.text();
      return new Response(JSON.stringify({ error: `AI 服务错误：${err}` }), {
        status: 502,
      });
    }

    const data = await qwenRes.json();
    const result = data.choices?.[0]?.message?.content?.trim() || '';

    return new Response(JSON.stringify({ result, truncated, char_count: text.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err.name === 'AbortError' ? '请求超时，请稍后重试' : '校对服务暂时不可用，请稍后重试';
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

- [ ] **Step 5: `functions/api/summary.js`**

在文件顶部加：
```js
// Cloudflare Pages Function — meeting summary (JSON only; DOCX generated client-side)
import { fetchWithTimeout } from './_lib/fetchWithTimeout.js';
```

把：
```js
  const upstream = await fetch(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [
          { role: 'system', content: SYS_SUMMARY },
          { role: 'user', content: `以下是会议对话：\n\n${dialogueText}` },
        ],
        max_tokens: 1500,
        temperature: 0.5,
      }),
    },
  );

  const data = await upstream.json();
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: data.error?.message || 'Qwen API error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const raw = data.choices[0].message.content.trim();
  let summary;
  try {
    summary = JSON.parse(
      raw
        .replace(/```(?:json)?\n?/g, '')
        .replace(/```/g, '')
        .trim(),
    );
  } catch {
    summary = { topics: [], feedback: [], actions: [] };
  }

  return new Response(JSON.stringify({ summary }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```
改成：
```js
  try {
    const upstream = await fetchWithTimeout(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'qwen-plus',
          messages: [
            { role: 'system', content: SYS_SUMMARY },
            { role: 'user', content: `以下是会议对话：\n\n${dialogueText}` },
          ],
          max_tokens: 1500,
          temperature: 0.5,
        }),
      },
    );

    const data = await upstream.json();
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || 'Qwen API error' }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const raw = data.choices[0].message.content.trim();
    let summary;
    try {
      summary = JSON.parse(
        raw
          .replace(/```(?:json)?\n?/g, '')
          .replace(/```/g, '')
          .trim(),
      );
    } catch {
      summary = { topics: [], feedback: [], actions: [] };
    }

    return new Response(JSON.stringify({ summary }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err.name === 'AbortError' ? '请求超时，请稍后重试' : '纪要生成服务暂时不可用，请稍后重试';
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

- [ ] **Step 6: `functions/api/translate-stream.js`**

在文件顶部加：
```js
// Cloudflare Pages Function — streaming translation proxy (SSE)
import { fetchWithTimeout } from './_lib/fetchWithTimeout.js';
```

把：
```js
  const upstream = await fetch(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 400,
        temperature: 0.1,
        stream: true,
      }),
    },
  );

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}));
    return new Response(JSON.stringify({ error: err.error?.message || 'Qwen API error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
```
改成：
```js
  try {
    const upstream = await fetchWithTimeout(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'qwen-plus',
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          max_tokens: 400,
          temperature: 0.1,
          stream: true,
        }),
      },
    );

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: err.error?.message || 'Qwen API error' }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    const msg = err.name === 'AbortError' ? '请求超时，请稍后重试' : '口译服务暂时不可用，请稍后重试';
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

- [ ] **Step 7: 运行 lint 确认没有语法问题**

Run: `npx eslint functions/api/`
Expected: 无报错输出

- [ ] **Step 8: Commit**

```bash
git add functions/api/translate.js functions/api/deepgram-token.js functions/api/analyze-stream.js functions/api/proofread.js functions/api/summary.js functions/api/translate-stream.js
git commit -m "fix(api): add timeout + unified error fallback to 6 endpoints missing them"
```
commit message 结尾加：
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 3: `auth-gate-state.js`（纯判定逻辑 + 测试）

对应设计文档 §3"内部拆分"。这个文件**不引用任何外部模块**（不 import Firebase、不碰 DOM），只是根据已知信息判定状态，所以能被 `node --test` 直接测试。

**Files:**
- Create: `js/shared/package.json`
- Create: `js/shared/auth-gate-state.js`
- Create: `tests/auth-gate-state.test.mjs`

- [ ] **Step 1: 创建 `js/shared/package.json`**

```json
{
  "type": "module"
}
```

- [ ] **Step 2: 写失败的测试 `tests/auth-gate-state.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGateState } from '../js/shared/auth-gate-state.js';

test('resolveGateState：未登录返回 guest', () => {
  assert.equal(resolveGateState({ user: null, isAdminUser: false, status: undefined }), 'guest');
});

test('resolveGateState：管理员优先于其他状态，返回 admin', () => {
  assert.equal(resolveGateState({ user: {}, isAdminUser: true, status: 'pending' }), 'admin');
  assert.equal(resolveGateState({ user: {}, isAdminUser: true, status: undefined }), 'admin');
});

test('resolveGateState：非管理员 + approved 返回 approved', () => {
  assert.equal(resolveGateState({ user: {}, isAdminUser: false, status: 'approved' }), 'approved');
});

test('resolveGateState：非管理员 + disabled 返回 disabled', () => {
  assert.equal(resolveGateState({ user: {}, isAdminUser: false, status: 'disabled' }), 'disabled');
});

test('resolveGateState：非管理员 + pending 或未知状态 一律返回 pending', () => {
  assert.equal(resolveGateState({ user: {}, isAdminUser: false, status: 'pending' }), 'pending');
  assert.equal(resolveGateState({ user: {}, isAdminUser: false, status: undefined }), 'pending');
  assert.equal(resolveGateState({ user: {}, isAdminUser: false, status: 'some_unknown_value' }), 'pending');
});
```

- [ ] **Step 3: 运行测试确认因模块不存在而失败**

Run: `npm test`
Expected: FAIL，报错类似 `Cannot find module '../js/shared/auth-gate-state.js'`

- [ ] **Step 4: 创建 `js/shared/auth-gate-state.js`**

```js
// 登录门控的纯判定逻辑：不碰 DOM、不碰 Firebase，只根据已知信息决定当前应该
// 进入哪个状态。零依赖，可以被 node --test 直接测试。
// 实际接 Firebase 事件、操作 DOM 的装配层在同目录的 auth-gate.js。
export function resolveGateState({ user, isAdminUser, status }) {
  if (!user) return 'guest';
  if (isAdminUser) return 'admin';
  if (status === 'approved') return 'approved';
  if (status === 'disabled') return 'disabled';
  return 'pending';
}
```

- [ ] **Step 5: 运行测试确认全部通过**

Run: `npm test`
Expected: PASS，新增的 5 个测试全绿

- [ ] **Step 6: Commit**

```bash
git add js/shared/package.json js/shared/auth-gate-state.js tests/auth-gate-state.test.mjs
git commit -m "feat(shared): add resolveGateState pure logic for auth-gate"
```
commit message 结尾加：
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 4: `auth-gate.js`（DOM/Firebase 装配层）

对应设计文档 §3。这个文件引用 Firebase CDN 模块，只被浏览器 `<script type="module">` 加载，不写自动化测试（人工验证在 Task 6 试点页迁移后进行）。

**Files:**
- Create: `js/shared/auth-gate.js`

- [ ] **Step 1: 创建 `js/shared/auth-gate.js`**

```js
// 统一登录门控：监听登录态、判定状态、渲染遮罩提示、分发回调。
// 判定逻辑本身在 auth-gate-state.js（纯函数，有单测）；这里是操作 DOM 和 Firebase 的装配层。
//
// 用法：
//   import { auth, db } from '/js/shared/firebase-init.js';
//   import { mountAuthGate } from '/js/shared/auth-gate.js';
//   mountAuthGate({ auth, db, onApproved: (user) => {...}, onAdmin: (user) => {...} });
//
// 页面里需要一个 id="auth-gate" 的遮罩元素；通过后该元素会被移除。
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { ADMINS } from './admins.js';
import { resolveGateState } from './auth-gate-state.js';

function renderMessage(gate, { icon, title, body }) {
  gate.innerHTML = `<div style="text-align:center;max-width:340px;padding:32px 24px;font-family:sans-serif"><div style="font-size:2.5rem;margin-bottom:16px">${icon}</div><h2 style="font-size:18px;font-weight:600;margin-bottom:12px;color:#1f2937">${title}</h2><p style="color:#6b7280;font-size:13px;line-height:1.8">${body}</p><a href="/account.html" style="display:inline-block;margin-top:20px;color:#9ca3af;font-size:12px;text-decoration:none">← 返回</a></div>`;
}

const MESSAGES = {
  pending: { icon: '⏳', title: '审核中', body: '账号正在审核中，审核通过后即可使用。' },
  disabled: { icon: '🚫', title: '账号已停用', body: '您的账号已被停用，请联系管理员。' },
  error: { icon: '⚠️', title: '出错了', body: '页面加载时出现问题，请刷新页面重试。' },
};

export function mountAuthGate({ auth, db, gateElId = 'auth-gate', onApproved, onAdmin }) {
  return onAuthStateChanged(auth, async (user) => {
    const gate = document.getElementById(gateElId);
    try {
      if (!user) {
        window.location.replace('/account.html');
        return;
      }
      localStorage.setItem('sdf_user_email', user.email);

      const isAdminUser = ADMINS.includes(user.email);
      let status;
      if (!isAdminUser) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        status = snap.data()?.status || 'pending';
      }

      const state = resolveGateState({ user, isAdminUser, status });

      if (state === 'admin') {
        gate?.remove();
        (onAdmin || onApproved)?.(user);
        return;
      }
      if (state === 'approved') {
        gate?.remove();
        onApproved?.(user);
        return;
      }
      if (gate) renderMessage(gate, MESSAGES[state]);
    } catch (err) {
      console.error('[auth-gate]', err);
      if (gate) renderMessage(gate, MESSAGES.error);
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add js/shared/auth-gate.js
git commit -m "feat(shared): add mountAuthGate DOM/Firebase assembly layer"
```
commit message 结尾加：
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 5: `js/main.js` 共享初始化分区隔离

对应设计文档 §4。

**Files:**
- Modify: `js/main.js`（`DOMContentLoaded` 那一段，约第814-836行）

- [ ] **Step 1: 给每一块共享初始化包 try/catch**

把：
```js
/* === INIT === */
document.addEventListener('DOMContentLoaded', () => {
  injectShared();
  injectAnalytics();
  fetch('/content.json')
    .then((r) => (r.ok ? r.json() : {}))
    .then((ov) => {
      ['ja', 'zh', 'en'].forEach((l) => {
        if (ov[l]) Object.assign(T[l], ov[l]);
      });
      if (ov.images) applyImages(ov.images);
    })
    .catch(() => {})
    .finally(() => {
      applyTranslations(currentLang);
      initScrollAnimations();
    });
});
```
改成：
```js
/* === INIT ===
   每一块共享初始化单独包 try/catch——某一块报错只在控制台留痕，不阻断其余几块继续跑
   （比如导航注入失败，不应该连累语言切换或滚动动画）。 */
document.addEventListener('DOMContentLoaded', () => {
  try {
    injectShared();
  } catch (err) {
    console.error('[main] injectShared failed:', err);
  }
  try {
    injectAnalytics();
  } catch (err) {
    console.error('[main] injectAnalytics failed:', err);
  }
  fetch('/content.json')
    .then((r) => (r.ok ? r.json() : {}))
    .then((ov) => {
      try {
        ['ja', 'zh', 'en'].forEach((l) => {
          if (ov[l]) Object.assign(T[l], ov[l]);
        });
      } catch (err) {
        console.error('[main] merging content.json translations failed:', err);
      }
      try {
        if (ov.images) applyImages(ov.images);
      } catch (err) {
        console.error('[main] applyImages failed:', err);
      }
    })
    .catch(() => {})
    .finally(() => {
      try {
        applyTranslations(currentLang);
      } catch (err) {
        console.error('[main] applyTranslations failed:', err);
      }
      try {
        initScrollAnimations();
      } catch (err) {
        console.error('[main] initScrollAnimations failed:', err);
      }
    });
});
```

- [ ] **Step 2: Lint 确认没有语法问题**

Run: `npx eslint js/main.js`
Expected: 无报错输出

- [ ] **Step 3: Commit**

```bash
git add js/main.js
git commit -m "fix(main): isolate shared init blocks so one failure doesn't block the rest"
```
commit message 结尾加：
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 6: 试点迁移 `solutions/demo/translation.html`

对应设计文档 §6（迁移顺序第一步）。

**Files:**
- Modify: `solutions/demo/translation.html`（文件末尾的 `<script type="module">` 块，约第1853-1877行）

- [ ] **Step 1: 替换登录门控逻辑，改用 `mountAuthGate`**

把：
```html
<script type="module">
import { auth, db } from '/js/shared/firebase-init.js';
import { ADMINS } from '/js/shared/admins.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {collection,doc,getDoc,addDoc,updateDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const _start=Date.now();let _ref=null,_logged=false;
function _anonId(){let i=localStorage.getItem('sdf_anon_id');if(!i){i='anon_'+Math.random().toString(36).slice(2,9);localStorage.setItem('sdf_anon_id',i);}return i;}
function _track(e){if(_logged)return;_logged=true;addDoc(collection(db,'visits'),{email:e,anonId:_anonId(),page:'translation',timestamp:serverTimestamp(),device:/Mobi|Android/i.test(navigator.userAgent)?'mobile':'desktop'}).then(r=>{_ref=r;}).catch(()=>{});}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&_ref){updateDoc(_ref,{duration:Math.round((Date.now()-_start)/1000)}).catch(()=>{});_ref=null;}});
window.sdfGetToken=()=>auth.currentUser?.getIdToken();
onAuthStateChanged(auth,async user=>{
  const gate=document.getElementById('auth-gate');
  if(!user){window.location.replace('/account.html');return;}
  localStorage.setItem('sdf_user_email',user.email);
  if(ADMINS.includes(user.email)){_track(user.email);gate.remove();return;}
  try{
    const snap=await getDoc(doc(db,'users',user.uid));
    const status=snap.data()?.status||'pending';
    if(status==='approved'){_track(user.email);gate.remove();return;}
    gate.innerHTML=`<div style="text-align:center;max-width:340px;padding:32px 24px;font-family:sans-serif"><div style="font-size:2.5rem;margin-bottom:16px">${status==='disabled'?'🚫':'⏳'}</div><h2 style="font-size:18px;font-weight:600;margin-bottom:12px;color:#1f2937">${status==='disabled'?'账号已停用':'审核中'}</h2><p style="color:#6b7280;font-size:13px;line-height:1.8">${status==='disabled'?'您的账号已被停用，请联系管理员。':'账号正在审核中，审核通过后即可使用。'}</p><a href="/account.html" style="display:inline-block;margin-top:20px;color:#9ca3af;font-size:12px;text-decoration:none">← 返回</a></div>`;
  }catch{
    gate.innerHTML='<div style="text-align:center;max-width:340px;padding:32px 24px;font-family:sans-serif"><div style="font-size:2.5rem;margin-bottom:16px">⏳</div><h2 style="font-size:18px;font-weight:600;margin-bottom:12px;color:#1f2937">审核中</h2><p style="color:#6b7280;font-size:13px;line-height:1.8">账号正在审核中，审核通过后即可使用。</p><a href="/account.html" style="display:inline-block;margin-top:20px;color:#9ca3af;font-size:12px;text-decoration:none">← 返回</a></div>';
  }
});
</script>
```
改成：
```html
<script type="module">
import { auth, db } from '/js/shared/firebase-init.js';
import { mountAuthGate } from '/js/shared/auth-gate.js';
import {collection,addDoc,updateDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const _start=Date.now();let _ref=null,_logged=false;
function _anonId(){let i=localStorage.getItem('sdf_anon_id');if(!i){i='anon_'+Math.random().toString(36).slice(2,9);localStorage.setItem('sdf_anon_id',i);}return i;}
function _track(e){if(_logged)return;_logged=true;addDoc(collection(db,'visits'),{email:e,anonId:_anonId(),page:'translation',timestamp:serverTimestamp(),device:/Mobi|Android/i.test(navigator.userAgent)?'mobile':'desktop'}).then(r=>{_ref=r;}).catch(()=>{});}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&_ref){updateDoc(_ref,{duration:Math.round((Date.now()-_start)/1000)}).catch(()=>{});_ref=null;}});
window.sdfGetToken=()=>auth.currentUser?.getIdToken();
mountAuthGate({
  auth,
  db,
  onApproved: (user) => _track(user.email),
  onAdmin: (user) => _track(user.email),
});
</script>
```

（这里去掉了 `ADMINS`、`onAuthStateChanged`、`doc`、`getDoc` 这几个 import——它们现在都在 `auth-gate.js` 内部处理，页面不需要再直接用。`_track`/`_anonId`/访问时长统计这些是页面自己的逻辑，`auth-gate.js` 不接管，原样保留。）

- [ ] **Step 2: 运行 lint 和 qa 扫描确认没有破坏页面**

Run: `npx eslint solutions/demo/translation.html && npm run qa`
Expected: 两个命令都无报错（`eslint.config.js` 如果不覆盖 `.html` 内嵌 script，这条命令可能直接跳过或报 "no files matching"，属于正常情况；`npm run qa` 的死链/缺alt扫描应该 PASS）

- [ ] **Step 3: Commit**

```bash
git add solutions/demo/translation.html
git commit -m "refactor(translation): migrate to shared auth-gate.js (pilot page)"
```
commit message 结尾加：
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 7: 更新 `docs/TOOLS.md`

**Files:**
- Modify: `docs/TOOLS.md`

- [ ] **Step 1**：先用 Read 工具通读一遍 `docs/TOOLS.md`，找到描述 `js/shared/` 共享模块的段落（`firebase-init.js`/`admins.js` 那部分）和"修改记录"章节现有条目的格式。

- [ ] **Step 2**：在 `js/shared/` 描述段落里补充说明新增的 `auth-gate-state.js`（纯判定逻辑，可测）和 `auth-gate.js`（`mountAuthGate` 装配层，统一登录门控+异常兜底渲染，替代过去每页复制一份的内联逻辑）；补充说明 `functions/api/_lib/fetchWithTimeout.js`（30秒"首个响应"超时，6个端点已接入）。

- [ ] **Step 3**：在"修改记录"章节末尾追加一条（跟现有条目格式一致，日期用 2026-07-24）：
```
- 新建 js/shared/auth-gate.js（+auth-gate-state.js 纯逻辑）：统一登录门控，异常兜底渲染"出错了请刷新"，不再因单点报错卡在空白/转圈；试点迁移 solutions/demo/translation.html
- js/main.js 共享初始化（injectShared/content.json合并/applyTranslations/initScrollAnimations）分区 try/catch 隔离
- functions/api/ 6个端点（translate/deepgram-token/analyze-stream/proofread/summary/translate-stream）接入 fetchWithTimeout（30秒首响应超时）+ 统一错误JSON兜底
```

- [ ] **Step 4: Commit**

```bash
git add docs/TOOLS.md
git commit -m "docs: record 3D stability changes in TOOLS.md"
```
commit message 结尾加：
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 8: 人工验证（CI 覆盖不到，需要真实登录 + 镜像恢复后）

这一步不是代码改动。**注意：当前镜像链路故障（`MIRROR_PAT` 待同事处理），下面这些步骤要等 `git push` 之后镜像恢复同步、Cloudflare 构建上线了才能做**：

- [ ] 1. `git push`（需要用户确认）
- [ ] 2. 镜像恢复后，打开 `https://www.senridf.com/solutions/demo/translation.html`：
   - 未登录访问，确认自动跳转 `/account.html`
   - 用一个 `pending` 状态的测试账号登录，确认显示"⏳ 审核中"
   - 用一个 `approved` 账号登录，确认正常进入工具、访问统计正常写入（Firestore `visits` 集合能看到新记录）
   - 用管理员账号登录，确认正常进入
- [ ] 3. 确认 `/api/translate`、`/api/proofread` 等端点在正常网络下响应不受影响（用翻译工具跑一次真实请求，确认能正常出结果）
- [ ] 4. 决定是否要批量迁移其余 9 个页面（`admin/index.html`、`admin/blog/index.html`、`solutions/demo/admin.html`、`bids/index.html`、`solutions/demo/{japanese_learner,proofreader,lifestory,analysis}.html`、`account.html`）——这属于设计文档 §6 的下一步，本计划只覆盖试点页

---

## Spec 覆盖率自查

| 设计文档章节 | 对应任务 |
|---|---|
| §3 auth-gate.js 设计（含内部拆分） | Task 3（纯逻辑）、Task 4（装配层） |
| §4 main.js 防御性隔离 | Task 5 |
| §5 fetchWithTimeout + 6端点接入 | Task 1、Task 2 |
| §6 迁移范围与顺序（先试点） | Task 6（只做试点页，批量迁移列入 Task 8 待办，不在本计划范围内） |
| §7 测试 | Task 1（fetchWithTimeout测试）、Task 3（resolveGateState测试）、Task 8（人工验证） |
| §8 错误处理 | Task 2（统一JSON错误）、Task 4（auth-gate统一错误提示） |
| 范围外（i18n.js、visits治理、CSP、App Check） | 未新增对应任务，符合预期 |

placeholder/类型一致性自查：`resolveGateState`、`mountAuthGate`、`fetchWithTimeout`、`auth-gate-state.js`/`auth-gate.js` 文件名、`MESSAGES`/`renderMessage` 这些命名在所有任务里保持一致，没有前后不一致的函数名/字段名。
