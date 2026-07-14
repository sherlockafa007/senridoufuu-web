# 管理后台一期：sdf-admin Worker + 内容编辑通道 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理员在 /admin/ 用 Firebase 账号登录后能编辑网站文字并一键发布，写入通道走用户自己 Cloudflare 账号下的 sdf-admin Worker（服务端持有 GitHub 令牌），彻底移除"浏览器粘贴 PAT"旧通道。

**Architecture:** 浏览器（/admin/，Firebase 登录）→ sdf-admin Worker（验 Firebase ID token + ADMINS 名单 + 限流，代为提交 content.json 到 GitHub）→ 现有镜像链自动上线。Worker 直接 import 仓库现有的 verifyFirebaseToken.js 与 js/shared/admins.js，不复制代码。

**Tech Stack:** Cloudflare Workers（wrangler 部署）、GitHub Contents API、Firebase Auth（现有）、node --test。

**Spec:** docs/specs/2026-07-14-admin-cms-design.md（本计划只覆盖其一期范围：§3 通道 + §6 内容编辑；Blog §5 与图片 §7 二、三期另立计划）

**约定：** 计划中标 🧑【用户操作】的步骤需要用户本人动手（登录、粘贴密钥），其余由执行者完成。用户是非专业程序员，用户操作步骤必须给出逐点点击路径。

---

## 文件结构

```
workers/sdf-admin/
├── wrangler.toml            Worker 配置（名字、入口、兼容日期）
└── src/
    ├── index.js             入口：CORS → 鉴权 → 限流 → 路由（/health /content）
    ├── validate.js          纯函数：来源白名单、content 载荷校验（可测）
    ├── rateLimit.js         纯函数工厂：内存限流器（可测）
    └── github.js            GitHub Contents API 读写（含 sha 冲突重试）
tests/admin-worker.test.mjs  validate + rateLimit 的 node --test 用例（.mjs 因 Worker 源码是 ESM）
admin/index.html             改造：删 PAT 通道，接 Worker，顶栏加导航
eslint.config.js             新增 workers/** 与 tests/**/*.mjs 两个 ESM 配置块
docs/TOOLS.md                记录 Worker 档案
```

复用（不改动）：`functions/api/_lib/verifyFirebaseToken.js`、`js/shared/admins.js`（Worker 经相对路径 import，wrangler 打包时会一起打进去）。

**注意：** ADMINS 名单改动后，前端随 push 自动生效，但 **Worker 需要重新 `npx wrangler deploy` 一次**（名单在部署时打包）。同事回归加名单时勿忘。

---

### Task 1: 纯函数模块 validate.js / rateLimit.js（TDD）

**Files:**
- Create: `workers/sdf-admin/src/validate.js`
- Create: `workers/sdf-admin/src/rateLimit.js`
- Test: `tests/admin-worker.test.mjs`

- [ ] **Step 1: 写失败测试**

`tests/admin-worker.test.mjs`：

```js
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
  assert.equal(allowedOrigin('https://evil.example.com'), false);
  assert.equal(allowedOrigin(''), false);
});

test('validateContentPayload 接受合法覆盖对象', () => {
  const ok = validateContentPayload({ ja: { hero_tagline: 'あ' }, zh: {}, en: {}, images: { og_image: 'https://x/y.png' } });
  assert.equal(ok.ok, true);
});

test('validateContentPayload 拒绝非法结构', () => {
  assert.equal(validateContentPayload(null).ok, false);
  assert.equal(validateContentPayload([]).ok, false);
  assert.equal(validateContentPayload({ fr: {} }).ok, false); // 未知分组
  assert.equal(validateContentPayload({ ja: { k: 123 } }).ok, false); // 值必须是字符串
  assert.equal(validateContentPayload({ ja: 'x' }).ok, false); // 分组必须是对象
});

test('validateContentPayload 拒绝超大载荷', () => {
  const big = { ja: { k: 'x'.repeat(120000) } };
  assert.equal(validateContentPayload(big).ok, false);
});

test('createRateLimiter 同一分钟超限后拦截、跨分钟重置', () => {
  let fakeNow = 0;
  const isLimited = createRateLimiter({ limit: 3, now: () => fakeNow });
  assert.equal(isLimited('u1'), false);
  assert.equal(isLimited('u1'), false);
  assert.equal(isLimited('u1'), false);
  assert.equal(isLimited('u1'), true);  // 第 4 次拦
  assert.equal(isLimited('u2'), false); // 不同用户互不影响
  fakeNow = 61_000;                     // 下一分钟
  assert.equal(isLimited('u1'), false);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL（Cannot find module …/workers/sdf-admin/src/validate.js）

- [ ] **Step 3: 实现 validate.js**

```js
// 纯校验逻辑（无 IO），供 sdf-admin Worker 使用，可用 node --test 直接测。

const LANGS = ['ja', 'zh', 'en'];
const MAX_JSON_BYTES = 100_000; // content.json 上限，防误传大对象

export function allowedOrigin(origin) {
  return (
    origin === 'https://www.senridf.com' ||
    origin === 'https://senridf.com' ||
    /^http:\/\/localhost(:\d+)?$/.test(origin)
  );
}

// content.json 载荷形状：{ ja|zh|en|images: { 字段名: 字符串 } }
export function validateContentPayload(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return { ok: false, error: '内容格式错误' };
  }
  const allowedGroups = [...LANGS, 'images'];
  for (const [group, fields] of Object.entries(content)) {
    if (!allowedGroups.includes(group)) return { ok: false, error: `未知分组：${group}` };
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      return { ok: false, error: `分组 ${group} 格式错误` };
    }
    for (const [key, val] of Object.entries(fields)) {
      if (typeof val !== 'string') return { ok: false, error: `字段 ${group}.${key} 必须是文字` };
    }
  }
  if (JSON.stringify(content).length > MAX_JSON_BYTES) return { ok: false, error: '内容过大，请分次保存' };
  return { ok: true };
}
```

- [ ] **Step 4: 实现 rateLimit.js**

```js
// 内存限流器（每 Worker 实例独立、重启清零）。管理员写操作频率极低，
// 这里只防脚本滥用，不追求跨实例精确 —— 有意比 functions/api 的 Firestore 限流简单。

export function createRateLimiter({ limit = 30, now = Date.now } = {}) {
  const buckets = new Map();
  return function isLimited(key) {
    const minute = Math.floor(now() / 60_000);
    const b = buckets.get(key);
    if (!b || b.minute !== minute) {
      buckets.set(key, { minute, count: 1 });
      return false;
    }
    b.count += 1;
    return b.count > limit;
  };
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test`
Expected: 全部 PASS（原有 4 个爬虫用例 + 新增 6 个）

- [ ] **Step 6: Commit**

```bash
git add workers/sdf-admin/src/validate.js workers/sdf-admin/src/rateLimit.js tests/admin-worker.test.mjs
git commit -m "feat(admin-worker): add validate + rateLimit pure modules with tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: github.js + Worker 入口 + wrangler.toml

**Files:**
- Create: `workers/sdf-admin/src/github.js`
- Create: `workers/sdf-admin/src/index.js`
- Create: `workers/sdf-admin/wrangler.toml`

- [ ] **Step 1: 实现 github.js**

```js
// GitHub Contents API 薄封装。只做 IO，不含业务判断。

const GH = 'https://api.github.com';

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'sdf-admin-worker', // GitHub API 必须带 UA
  };
}

function b64encodeUtf8(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  const CHUNK = 8192; // 分块防调用栈溢出
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function b64decodeUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// 读文件。文件不存在时返回 { text: null, sha: null }（首次保存场景）。
export async function getFile(repo, path, token) {
  const res = await fetch(`${GH}/repos/${repo}/contents/${path}`, { headers: ghHeaders(token) });
  if (res.status === 404) return { text: null, sha: null };
  if (!res.ok) throw new Error(`GitHub 读取失败（${res.status}）`);
  const data = await res.json();
  return { text: b64decodeUtf8(data.content), sha: data.sha };
}

// 写文件：每次现取最新 sha 再提交；409/422 视为并发冲突，重取一次再试。
export async function putFile(repo, path, text, message, token) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { sha } = await getFile(repo, path, token);
    const body = { message, content: b64encodeUtf8(text) };
    if (sha) body.sha = sha;
    const res = await fetch(`${GH}/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      return { commitSha: data.commit.sha };
    }
    if (res.status !== 409 && res.status !== 422) {
      throw new Error(`GitHub 写入失败（${res.status}）`);
    }
  }
  throw new Error('保存冲突，请刷新页面重试');
}
```

- [ ] **Step 2: 实现 index.js**

```js
// sdf-admin Worker — 管理后台的写入通道。
// 部署在用户自己的 Cloudflare 账号，持有 GITHUB_TOKEN（细粒度、仅本仓库 Contents:RW）。
// 复用主仓库的 token 校验与管理员名单，保证前后端同一份逻辑。

import { verifyFirebaseToken } from '../../../functions/api/_lib/verifyFirebaseToken.js';
import { isAdmin } from '../../../js/shared/admins.js';
import { allowedOrigin, validateContentPayload } from './validate.js';
import { createRateLimiter } from './rateLimit.js';
import { getFile, putFile } from './github.js';

const REPO = 'sherlockafa007/senridoufuu-web';
const CONTENT_PATH = 'content.json';

const isLimited = createRateLimiter({ limit: 30 });

function json(status, body, cors = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = allowedOrigin(origin)
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      : {};

    if (request.method === 'OPTIONS') {
      if (!cors['Access-Control-Allow-Origin']) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/health') return json(200, { ok: true }, cors);

    // ── 鉴权：Firebase ID token 有效 + 在管理员名单 ──
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) return json(401, { error: '未登录' }, cors);

    let user;
    try {
      user = await verifyFirebaseToken(token);
    } catch {
      return json(401, { error: '登录已过期或无效，请刷新页面重新登录' }, cors);
    }
    if (!isAdmin(user)) return json(403, { error: '该账号无管理员权限' }, cors);
    if (isLimited(user.uid)) return json(429, { error: '操作过于频繁，请稍后再试' }, cors);

    try {
      if (url.pathname === '/content' && request.method === 'GET') {
        const { text } = await getFile(REPO, CONTENT_PATH, env.GITHUB_TOKEN);
        return json(200, { content: text ? JSON.parse(text) : {} }, cors);
      }

      if (url.pathname === '/content' && request.method === 'PUT') {
        let body;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: '请求格式错误' }, cors);
        }
        const check = validateContentPayload(body.content);
        if (!check.ok) return json(400, { error: check.error }, cors);
        const { commitSha } = await putFile(
          REPO,
          CONTENT_PATH,
          JSON.stringify(body.content, null, 2) + '\n',
          'content: update via admin panel',
          env.GITHUB_TOKEN,
        );
        return json(200, { ok: true, commitSha }, cors);
      }
    } catch (e) {
      return json(502, { error: e.message || '保存服务出错，请稍后重试' }, cors);
    }

    return json(404, { error: 'not found' }, cors);
  },
};
```

- [ ] **Step 3: 写 wrangler.toml**

```toml
name = "sdf-admin"
main = "src/index.js"
compatibility_date = "2026-07-01"
# secret（不在此文件）：GITHUB_TOKEN —— 在 Cloudflare 面板 Variables and Secrets 里设置
```

- [ ] **Step 4: Commit**

```bash
git add workers/sdf-admin
git commit -m "feat(admin-worker): GitHub content channel with Firebase auth gate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: ESLint 覆盖新目录 + 质量闸门全绿

**Files:**
- Modify: `eslint.config.js`（在现有配置数组中、末尾 rules 块之前插入两块）

- [ ] **Step 1: 加配置块**

```js
  // sdf-admin Worker（ESM，Workers 运行时：有 fetch/Response/crypto 等 service worker 全局）
  {
    files: ['workers/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.serviceworker },
    },
  },
  // ESM 测试文件（Worker 源码是 ESM，测试也得用 ESM）
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
```

- [ ] **Step 2: 全套检查**

Run: `npm run check`
Expected: lint / format:check / test / qa 全部通过。若 Prettier 对新文件报格式，先 `npm run format` 再重跑。

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "chore(lint): cover workers/ and .mjs tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 🧑【用户操作】部署 Worker + 设置密钥

前置：Task 2 完成；用户已持有 GitHub 细粒度 PAT（sdf-admin-worker，2027-07 到期）。

- [ ] **Step 1: 登录 wrangler**（执行者在终端运行，浏览器会弹出授权页，🧑 用户点 Allow）

Run: `cd workers/sdf-admin && npx wrangler login`
Expected: 浏览器打开 Cloudflare 授权页 → 用户点击 Allow → 终端显示 Successfully logged in

- [ ] **Step 2: 首次部署**

Run: `cd workers/sdf-admin && npx wrangler deploy`
Expected: 输出形如 `https://sdf-admin.<子域>.workers.dev`，**记下这个 URL**（Task 5 回填）

- [ ] **Step 3: 🧑 在面板粘贴 GitHub 令牌**（不经终端，避免留在命令历史）

引导用户：dash.cloudflare.com → 左栏 **Workers & Pages** → 点 **sdf-admin** → **Settings** → **Variables and Secrets** → **Add** → Type 选 **Secret**，Name 填 `GITHUB_TOKEN`，Value 粘贴 `github_pat_…` → **Deploy**。

- [ ] **Step 4: 冒烟测试**

Run: `curl https://sdf-admin.<子域>.workers.dev/health`
Expected: `{"ok":true}`

Run: `curl https://sdf-admin.<子域>.workers.dev/content`
Expected: `{"error":"未登录"}`（401，说明鉴权闸门在工作）

---

### Task 5: 改造 admin/index.html（换保存通道）

**Files:**
- Modify: `admin/index.html`

改动清单（SECTIONS/IMAGE_FIELDS/buildEditor/buildSection/buildImages/toggleSection/setTab 全部保留不动）：

- [ ] **Step 1: 删除 PAT 相关**

删掉：`#login` 整个 div（158-172 行区域）及其 CSS（`.login-input/.login-hint` 可留可删）、`connect()`、`disconnect()`、`ghGet()`、`ghPut()`、`tryAutoPat()`、`const REPO/FILE`、`let pat/fileSha` 变量。

- [ ] **Step 2: 顶栏改造**（`.top-bar` 内）

```html
<div class="top-bar">
  <div class="top-bar__left" style="display:flex;align-items:center;gap:18px;">
    <a href="/" style="font-weight:700;letter-spacing:.08em;color:var(--text);text-decoration:none;" title="返回网站主页">千里同風</a>
    <nav style="display:flex;gap:14px;font-size:13px;">
      <span style="color:var(--accent);border-bottom:2px solid var(--accent);padding:4px 0;">网站内容</span>
      <span style="color:var(--text3);cursor:default;" title="二期开通">Blog（即将上线）</span>
      <a href="/solutions/demo/admin.html" style="color:var(--text2);text-decoration:none;">运行监控</a>
    </nav>
  </div>
  <div class="top-bar__right">
    <span class="status" id="status"></span>
    <button type="button" class="btn-save" id="save-btn" onclick="save()">保存并发布</button>
    <button type="button" class="btn-link" onclick="fbLogout()">退出登录</button>
  </div>
</div>
```

- [ ] **Step 3: 新的加载/保存逻辑**（module script 内，替换 tryAutoPat 调用点）

```js
// deploy 后回填 Task 4 Step 2 得到的地址
const WORKER_URL = 'https://sdf-admin.<子域>.workers.dev';
const MIRROR_API = 'https://api.github.com/repos/Eveysnow5/senridf-web/commits/main';

async function api(method, path, body) {
  const idToken = await auth.currentUser.getIdToken(); // SDK 自动续期
  const res = await fetch(WORKER_URL + path, {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* 非 JSON 响应按状态码报错 */ }
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data;
}

async function loadContent() {
  const { content } = await api('GET', '/content');
  currentOverrides = content || {};
  buildEditor();
  document.getElementById('editor').style.display = 'block';
}

// 发布后轮询镜像仓库 HEAD，等于本次 commit 即代表镜像完成、Cloudflare 开始构建
async function waitForDeploy(commitSha, statusEl) {
  statusEl.className = 'status'; statusEl.textContent = '✓ 已保存，同步部署中…（约2-3分钟）';
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 20_000));
    try {
      const res = await fetch(MIRROR_API);
      const data = await res.json();
      if (data.sha === commitSha) {
        statusEl.className = 'status ok';
        statusEl.textContent = '✓ 已上线（如未见变化，等约1分钟后刷新网站）';
        return;
      }
    } catch { /* 网络抖动，继续轮询 */ }
  }
  statusEl.textContent = '已保存；上线状态未确认，稍后可直接查看网站';
}
```

`save()` 收集覆盖对象的逻辑保留，把 `ghPut` 一段替换为：

```js
    const { commitSha } = await api('PUT', '/content', { content: ov });
    currentOverrides = ov;
    waitForDeploy(commitSha, statusEl);
```

`onAuthStateChanged` 中 `tryAutoPat()` 替换为 `loadContent().catch(e => { document.getElementById('fb-err').textContent = e.message; })`；并加：

```js
window.fbLogout = () => signOut(auth).then(() => location.reload());
// import 行补充 signOut：
// import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from '…/firebase-auth.js';
```

- [ ] **Step 4: 静态检查**

Run: `npm run check`
Expected: 全绿（qa 扫描器会扫这个页面的链接，`/solutions/demo/admin.html` 是真实路径）

- [ ] **Step 5: Commit**

```bash
git add admin/index.html
git commit -m "feat(admin): replace browser-PAT channel with sdf-admin worker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 🧑【用户操作】本地验证全链路

CI 测不了浏览器登录（项目已知约束），必须人工过一遍。

- [ ] **Step 1: 起本地服务器**

Run: `npx serve "c:\Users\sherl\Desktop\Claude Code\senridoufuu-web" -l 3000`（或任意静态服务器，端口任意——Worker 的 CORS 放行所有 localhost 端口）

- [ ] **Step 2: 🧑 浏览器验证**

1. 打开 `http://localhost:3000/admin/` → 出现 Firebase 登录卡片
2. 用管理员账号登录 → 直接进入编辑器（**不再有** GitHub Token 输入框）
3. 在「首页 · Hero → 主标语」中文栏填一个测试值（如"测试123"）→ 点 **保存并发布**
4. 状态显示"已保存，同步部署中…" → 2-3 分钟内变为"已上线"
5. 打开 www.senridf.com 切中文 → 首页主标语显示"测试123"
6. 回编辑器清空该字段 → 再次保存 → 网站恢复原文案

- [ ] **Step 3: 负面用例**

用非管理员账号（或未登录状态直接 curl /content）确认拿到 401/403。

---

### Task 7: 上线 + 文档

- [ ] **Step 1: push 全部提交**

Run: `git push`
Expected: 触发自动镜像；用 `curl -s https://api.github.com/repos/Eveysnow5/senridf-web/commits/main` 对比本地 HEAD 确认镜像完成。

- [ ] **Step 2: 🧑 线上复验**

打开 `https://www.senridf.com/admin/` 登录 → 编辑器正常载入（正式域走 CORS 白名单的另一分支，必须单独验一次）。

- [ ] **Step 3: 更新 docs/TOOLS.md**

新增「管理后台（内容编辑）」条目：架构图（浏览器→sdf-admin Worker→GitHub→镜像→上线）、Worker 地址、密钥清单（GITHUB_TOKEN 细粒度 PAT，2027-07 到期）、ADMINS 变更需 wrangler 重部署的提醒、限流参数（30 次/分钟）。

- [ ] **Step 4: Commit + push**

```bash
git add docs/TOOLS.md
git commit -m "docs: record sdf-admin worker in TOOLS.md

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## 自查记录（写计划时已核）

- spec §3（通道架构）→ Task 2/4；§6（内容编辑）→ Task 5；§8（安全：双重验证/CORS/限流/令牌服务端）→ Task 1/2；§9（发布进度/冲突重试/服务不可达提示）→ Task 2 putFile 重试 + Task 5 waitForDeploy/api 错误提示；§12（纯逻辑进 node --test）→ Task 1。
- spec §5 Blog、§7 图片、§10 之 Firestore 规则（blog_drafts）不在本计划——二期。
- 类型一致性：`validateContentPayload` 返回 `{ok,error}`、`putFile` 返回 `{commitSha}`、Worker PUT 响应 `{ok,commitSha}`、前端读 `commitSha`——已对齐。
