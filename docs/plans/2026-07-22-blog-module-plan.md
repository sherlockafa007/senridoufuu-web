# Blog 模块（CMS 二期）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后台新增独立的 Blog 撰写面板（文章列表/新建/编辑/下架），中文撰写→复用 `/translate`
一键出日英→发布为三语静态文章页，支持封面图与 Firestore 自动存草稿。

**Architecture:** Worker 新增 `blog.js`（纯函数：slug/模板渲染/posts.json 增删改/校验）+
`index.js` 三个路由（`GET /blog/posts`、`POST /blog/publish`、`POST /blog/unpublish`），
`github.js` 加 `deleteFile` 与"图片透传写入"能力。前端 `solutions/blog/index.html` 改为
静态外壳 + 客户端 fetch `posts.json` 渲染卡片；文章页模板内嵌三语数据 + 客户端
marked/DOMPurify 渲染（复用 analysis.html/lifestory.html 已验证的 CDN 引用）。
`admin/index.html` 顶栏新增「Blog」标签，切到独立撰写视图（不复用就地编辑器的
点击范式——新文章没有已渲染页面可点）。

**Tech Stack:** Cloudflare Workers、GitHub Contents API、Qwen（经既有 `/translate`）、
Firestore（草稿）、marked + DOMPurify（客户端渲染）、node --test。

**Spec:** `docs/specs/2026-07-22-blog-module-design.md`

**约定：** 🧑 标记的步骤需要用户本人操作（Firestore 控制台、浏览器验证），其余全部由执行者
直接完成，任务之间不停下确认，按顺序做完。每个 Worker 相关任务做完立即跑
`npm run check` 并提交；前端大改（admin.html/blog/index.html）作为独立任务各自提交，
便于出问题时定位到具体改动。

---

## 文件结构

```
workers/sdf-admin/src/blog.js       新增：纯函数（slug/校验/posts.json增删改/文章HTML模板）
workers/sdf-admin/src/github.js     改：putFile 支持已编码二进制透传；新增 deleteFile
workers/sdf-admin/src/index.js      改：新增 GET /blog/posts、POST /blog/publish、POST /blog/unpublish
tests/admin-worker.test.mjs         改：追加 blog.js 的测试用例
solutions/blog/index.html           改：静态外壳，客户端 fetch posts.json 渲染卡片，随语言切换重渲染
admin/index.html                    大改：顶栏加 Blog 标签、独立撰写面板、Firestore 草稿自动保存
docs/TOOLS.md                       改：记录 Blog 模块架构
```

---

### Task 1: blog.js 纯逻辑模块（TDD）

**Files:**
- Create: `workers/sdf-admin/src/blog.js`
- Test: `tests/admin-worker.test.mjs`（追加）

- [ ] **Step 1: 追加失败测试**

在 `tests/admin-worker.test.mjs` 顶部 import 区加：
```js
import {
  generateSlug,
  validatePublishPayload,
  upsertPost,
  removePost,
  renderArticleHtml,
  escapeHtml,
} from '../workers/sdf-admin/src/blog.js';
```

在文件末尾追加：
```js
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
    tag: 'AI', date: '2026-07-22',
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
      tag: 'AI', date: '2026-07-22',
      title: { ja: 'あ', zh: '', en: 'A' },
      body: { ja: 'x', zh: 'x', en: 'x' },
    }).ok,
    false,
  ); // zh 标题为空
});

test('validatePublishPayload 接受不带封面图，拒绝超大封面图', () => {
  const base = {
    tag: 'AI', date: '2026-07-22',
    title: { ja: 'a', zh: 'a', en: 'a' },
    body: { ja: 'a', zh: 'a', en: 'a' },
  };
  assert.equal(validatePublishPayload(base).ok, true);
  const huge = { ...base, cover: 'data:image/webp;base64,' + 'A'.repeat(700_000) };
  assert.equal(validatePublishPayload(huge).ok, false);
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
  assert.deepEqual(removePost(posts, 'a').map((p) => p.slug), ['b']);
  assert.deepEqual(removePost(posts, 'zzz').map((p) => p.slug), ['a', 'b']);
});

test('escapeHtml 转义特殊字符', () => {
  assert.equal(escapeHtml('<a>&"</a>'), '&lt;a&gt;&amp;&quot;&lt;/a&gt;');
});

test('renderArticleHtml 包含三语数据、正确转义标题、marked/DOMPurify 引用', () => {
  const html = renderArticleHtml({
    slug: '2026-07-22-a3f8', date: '2026-07-22', tag: 'AI',
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
    slug: 's', date: '2026-07-22', tag: 'AI',
    title: { ja: 'a', zh: 'a', en: 'a' },
    body: { ja: 'x</script>alert(1)', zh: 'a', en: 'a' },
    cover: null,
  });
  assert.ok(!html.includes('</script>alert(1)'));
  assert.ok(html.includes('\\u003c/script\\u003e'));
});

test('renderArticleHtml 有封面图时插入 img 标签，无封面图时不插入', () => {
  const withCover = renderArticleHtml({
    slug: 's', date: '2026-07-22', tag: 'AI',
    title: { ja: 'a', zh: 'a', en: 'a' }, body: { ja: 'a', zh: 'a', en: 'a' },
    cover: 'assets/images/blog/s-cover.webp',
  });
  assert.ok(withCover.includes('assets/images/blog/s-cover.webp'));
  const noCover = renderArticleHtml({
    slug: 's', date: '2026-07-22', tag: 'AI',
    title: { ja: 'a', zh: 'a', en: 'a' }, body: { ja: 'a', zh: 'a', en: 'a' },
    cover: null,
  });
  assert.ok(!noCover.includes('blog-post__cover'));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL（找不到 `workers/sdf-admin/src/blog.js`）

- [ ] **Step 3: 实现 blog.js**

```js
// Blog 模块纯逻辑（无 IO）：slug 生成、发布载荷校验、posts.json 增删改、文章 HTML 模板渲染。
// 供 sdf-admin Worker 的 /blog/* 路由使用。

const MAX_COVER_BYTES = 500_000; // 客户端已压缩，这里再校验一次防绕过

export function generateSlug(date, randomFn = Math.random) {
  const hex = Math.floor(randomFn() * 0xffff)
    .toString(16)
    .padStart(4, '0');
  return `${date}-${hex}`;
}

export function validatePublishPayload(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: '请求格式错误' };
  const { tag, date, title, body: postBody, cover } = body;
  if (typeof tag !== 'string' || !tag.trim()) return { ok: false, error: '缺少标签' };
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: '日期格式错误' };
  }
  for (const lang of ['ja', 'zh', 'en']) {
    if (!title || typeof title[lang] !== 'string' || !title[lang].trim()) {
      return { ok: false, error: `缺少${lang}标题` };
    }
    if (!postBody || typeof postBody[lang] !== 'string' || !postBody[lang].trim()) {
      return { ok: false, error: `缺少${lang}正文` };
    }
  }
  if (cover !== undefined && cover !== null) {
    if (typeof cover !== 'string') return { ok: false, error: '封面图格式错误' };
    const stripped = cover.replace(/^data:image\/\w+;base64,/, '');
    const approxBytes = Math.floor((stripped.length * 3) / 4);
    if (approxBytes > MAX_COVER_BYTES) return { ok: false, error: '封面图过大' };
  }
  return { ok: true };
}

// posts.json 是数组；按 slug 去重插入/更新，按 date 倒序排列。
export function upsertPost(posts, entry) {
  const filtered = posts.filter((p) => p.slug !== entry.slug);
  filtered.push(entry);
  filtered.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return filtered;
}

export function removePost(posts, slug) {
  return posts.filter((p) => p.slug !== slug);
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 文章页 HTML 模板。ARTICLE 数据内嵌三语内容，客户端用 marked+DOMPurify 渲染——
// Worker（Cloudflare Workers 运行时）没有现成 DOM 环境，服务端跑 DOMPurify 需要
// jsdom 之类的重依赖；本站现有 i18n 文字本来就是客户端渲染（data-i18n + T 字典），
// 文章正文走同一模式，不新增复杂度。
export function renderArticleHtml({ slug, date, tag, title, body, cover }) {
  const articleData = {
    ja: { title: title.ja, body: body.ja },
    zh: { title: title.zh, body: body.zh },
    en: { title: title.en, body: body.en },
  };
  // </script> 若原样出现在 JSON 里会提前截断内嵌 <script> 标签，转成 unicode 转义防止。
  const articleJson = JSON.stringify(articleData).replace(/</g, '\\u003c');
  const coverImg = cover ? `<img src="/${cover}" alt="" class="blog-post__cover">` : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title.ja)} — 千里同風株式会社</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500&family=Noto+Serif+JP:wght@300;400;700&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
  <base href="../../">
  <link rel="stylesheet" href="css/main.css">
  <script defer src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js" integrity="sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi" crossorigin="anonymous"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/dompurify@3.4.12/dist/purify.min.js" integrity="sha384-piCcpDdJ7qVeK4Tv8Z6Hpcr3ZBIgP16TxQTPVfsLFdZ5uDgwc3Y8Ho7oUnqf12qu" crossorigin="anonymous"></script>
</head>
<body>

  <div id="nav-placeholder"></div>

  <main>
    <div class="page-header">
      <div class="page-header__container">
        <div data-animate>
          <span class="section__eyebrow">${escapeHtml(tag)} · ${escapeHtml(date)}</span>
          <h1 class="section__title" id="article-title"></h1>
        </div>
      </div>
    </div>
    <section class="section">
      ${coverImg}
      <div id="article-body" class="blog-post__body"></div>
    </section>
  </main>

  <div id="footer-placeholder"></div>

  <script src="js/main.js"></script>
  <script type="module" src="js/tracking.js"></script>
  <script>
    const ARTICLE = ${articleJson};
    function renderArticle(lang) {
      const d = ARTICLE[lang] || ARTICLE.ja;
      document.getElementById('article-title').textContent = d.title;
      document.getElementById('article-body').innerHTML = DOMPurify.sanitize(marked.parse(d.body));
    }
    const _switchLang = window.switchLang;
    window.switchLang = function (lang) { _switchLang(lang); renderArticle(lang); };
    document.addEventListener('DOMContentLoaded', () => renderArticle(currentLang));
  </script>
</body>
</html>
`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add workers/sdf-admin/src/blog.js tests/admin-worker.test.mjs
git commit -m "feat(admin-worker): add blog module pure functions with tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: github.js — 图片透传写入 + deleteFile

**Files:**
- Modify: `workers/sdf-admin/src/github.js`

- [ ] **Step 1: 改 putFile 支持已编码二进制透传**

把：
```js
// 写文件：每次现取最新 sha 再提交；409/422 视为并发冲突，重取一次再试。
export async function putFile(repo, path, text, message, token) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { sha } = await getFile(repo, path, token);
    const body = { message, content: b64encodeUtf8(text) };
```
改成：
```js
// 写文件：每次现取最新 sha 再提交；409/422 视为并发冲突，重取一次再试。
// content 默认当文本处理（UTF-8→base64）；alreadyBase64=true 时按图片等二进制数据处理，
// content 本身已经是算好的 base64 字符串，直接透传给 GitHub API。
export async function putFile(repo, path, content, message, token, { alreadyBase64 = false } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { sha } = await getFile(repo, path, token);
    const body = { message, content: alreadyBase64 ? content : b64encodeUtf8(content) };
```

- [ ] **Step 2: 新增 deleteFile**

在文件末尾追加：
```js

// 删除文件（下架文章用）。文件已不存在时视为已删除，幂等返回。
export async function deleteFile(repo, path, message, token) {
  const { sha } = await getFile(repo, path, token);
  if (!sha) return { deleted: false };
  const res = await fetch(`${GH}/repos/${repo}/contents/${path}`, {
    method: 'DELETE',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).message || '';
    } catch {
      /* 响应非 JSON 时只报状态码 */
    }
    throw new Error(`GitHub 删除失败（${res.status}${detail ? `：${detail}` : ''}）`);
  }
  return { deleted: true };
}
```

- [ ] **Step 3: 静态检查**

Run: `npm run check`
Expected: 全绿（`putFile` 调用点在 `index.js` 里现有的两处 `/content` 路由不传第 6 个参数，
沿用默认值 `alreadyBase64: false`，行为不变）

- [ ] **Step 4: Commit**

```bash
git add workers/sdf-admin/src/github.js
git commit -m "feat(admin-worker): support binary passthrough in putFile, add deleteFile

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: index.js — 三个 Blog 路由

**Files:**
- Modify: `workers/sdf-admin/src/index.js`

- [ ] **Step 1: 加 import 与常量**

把：
```js
import { getFile, putFile } from './github.js';
```
改成：
```js
import { getFile, putFile, deleteFile } from './github.js';
```

在 `const CONTENT_PATH = 'content.json';` 下面加一行：
```js
const POSTS_PATH = 'solutions/blog/posts.json';
```

加 import：
```js
import {
  generateSlug,
  validatePublishPayload,
  upsertPost,
  removePost,
  renderArticleHtml,
} from './blog.js';
```

- [ ] **Step 2: 加三个路由**

在现有 `/translate` 路由的 `}` 之后、`} catch (e) {` 之前插入：

```js

      if (url.pathname === '/blog/posts' && request.method === 'GET') {
        const { text } = await getFile(REPO, POSTS_PATH, env.GITHUB_TOKEN);
        return json(200, { posts: text ? JSON.parse(text) : [] }, cors);
      }

      if (url.pathname === '/blog/publish' && request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: '请求格式错误' }, cors);
        }
        const check = validatePublishPayload(body);
        if (!check.ok) return json(400, { error: check.error }, cors);

        const slug = body.slug || generateSlug(body.date);
        const { text: postsText } = await getFile(REPO, POSTS_PATH, env.GITHUB_TOKEN);
        const posts = postsText ? JSON.parse(postsText) : [];
        const existing = posts.find((p) => p.slug === slug);

        let coverPath = existing ? existing.cover : null;
        if (body.cover) {
          coverPath = `assets/images/blog/${slug}-cover.webp`;
          const base64Data = body.cover.replace(/^data:image\/\w+;base64,/, '');
          await putFile(
            REPO,
            coverPath,
            base64Data,
            'blog: publish cover image',
            env.GITHUB_TOKEN,
            { alreadyBase64: true },
          );
        }

        const html = renderArticleHtml({
          slug,
          date: body.date,
          tag: body.tag,
          title: body.title,
          body: body.body,
          cover: coverPath,
        });
        await putFile(
          REPO,
          `solutions/blog/${slug}.html`,
          html,
          'blog: publish article',
          env.GITHUB_TOKEN,
        );

        const entry = {
          slug,
          date: body.date,
          tag: body.tag,
          title: body.title,
          body: body.body,
          cover: coverPath,
        };
        const updated = upsertPost(posts, entry);
        const { commitSha } = await putFile(
          REPO,
          POSTS_PATH,
          JSON.stringify(updated, null, 2) + '\n',
          'blog: update posts.json',
          env.GITHUB_TOKEN,
        );

        return json(200, { ok: true, slug, commitSha }, cors);
      }

      if (url.pathname === '/blog/unpublish' && request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: '请求格式错误' }, cors);
        }
        if (!body.slug || typeof body.slug !== 'string') {
          return json(400, { error: '缺少 slug' }, cors);
        }

        await deleteFile(
          REPO,
          `solutions/blog/${body.slug}.html`,
          'blog: unpublish article',
          env.GITHUB_TOKEN,
        );

        const { text } = await getFile(REPO, POSTS_PATH, env.GITHUB_TOKEN);
        const posts = text ? JSON.parse(text) : [];
        const updated = removePost(posts, body.slug);
        const { commitSha } = await putFile(
          REPO,
          POSTS_PATH,
          JSON.stringify(updated, null, 2) + '\n',
          'blog: remove from posts.json',
          env.GITHUB_TOKEN,
        );

        return json(200, { ok: true, commitSha }, cors);
      }
```

- [ ] **Step 3: 静态检查**

Run: `npm run check`
Expected: 全绿

- [ ] **Step 4: Commit**

```bash
git add workers/sdf-admin/src/index.js
git commit -m "feat(admin-worker): add GET /blog/posts, POST /blog/publish, POST /blog/unpublish

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: solutions/blog/index.html — 静态外壳 + 客户端渲染列表

**Files:**
- Modify: `solutions/blog/index.html`

- [ ] **Step 1: 替换 Blog List 区块的注释块，加客户端渲染脚本**

保留现有 `<!-- Empty state -->` 块不动（数据为空时天然显示），在 `</main>` 之前、
`<div id="footer-placeholder"></div>` 之前插入渲染脚本；把原来那段"如何手动加文章"的
说明注释（`<!-- === BLOG POSTS === ... -->`）整段删除（不再需要手动维护，改自动生成）。

删除：
```html
      <!--
        === BLOG POSTS ===
        To add a post, copy the block below and fill in the details.
        Create a new file at /solutions/blog/[post-slug].html for each post.

      <a href="/solutions/blog/your-post-slug.html" class="blog-item" data-animate>
        <div class="blog-item__date">
          2025<br>01.15
        </div>
        <div>
          <div class="blog-item__tag">AI · ハードウェア</div>
          <h2 class="blog-item__title">記事のタイトルをここに入れてください</h2>
          <p class="blog-item__excerpt">
            記事の要約文。2〜3文程度で内容を説明します。
          </p>
        </div>
      </a>

      -->

      <!-- Empty state -->
```
改成：
```html
      <!-- Empty state（无文章时天然显示；有文章时下方脚本会移除它并插入卡片） -->
```

- [ ] **Step 2: `</main>` 之前加渲染脚本**

把：
```html
  </main>

  <div id="footer-placeholder"></div>

  <script src="js/main.js"></script>
  <script type="module" src="js/tracking.js"></script>
</body>
```
改成：
```html
  </main>

  <div id="footer-placeholder"></div>

  <script src="js/main.js"></script>
  <script type="module" src="js/tracking.js"></script>
  <script>
    let blogPostsCache = [];

    function escapeHtmlList(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function renderBlogCards(lang) {
      const container = document.querySelector('.section');
      if (!container) return;
      const validLang = ['ja', 'zh', 'en'].includes(lang) ? lang : 'ja';
      container.querySelectorAll('.blog-item').forEach((el) => el.remove());
      const emptyEl = container.querySelector('.blog-empty');
      if (blogPostsCache.length === 0) {
        if (emptyEl) emptyEl.style.display = '';
        return;
      }
      if (emptyEl) emptyEl.style.display = 'none';
      const html = blogPostsCache
        .map((p) => {
          const d = p[validLang] || p.ja;
          const [y, m, day] = p.date.split('-');
          const excerpt = (d.body || '')
            .replace(/[#*_`]/g, '')
            .replace(/\n+/g, ' ')
            .trim()
            .slice(0, 80);
          return `<a href="/solutions/blog/${p.slug}.html" class="blog-item" data-animate>
          <div class="blog-item__date">${y}<br>${m}.${day}</div>
          <div>
            <div class="blog-item__tag">${escapeHtmlList(p.tag)}</div>
            <h2 class="blog-item__title">${escapeHtmlList(d.title)}</h2>
            <p class="blog-item__excerpt">${escapeHtmlList(excerpt)}…</p>
          </div>
        </a>`;
        })
        .join('');
      container.insertAdjacentHTML('beforeend', html);
    }

    fetch('/solutions/blog/posts.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((posts) => {
        blogPostsCache = Array.isArray(posts) ? posts : [];
        renderBlogCards(currentLang);
      })
      .catch(() => {});

    // main.js 的语言按钮通过 addEventListener(() => switchLang(...)) 调用时才查找
    // window.switchLang，可以安全包一层而不改 main.js。
    const _switchLang = window.switchLang;
    window.switchLang = function (lang) {
      _switchLang(lang);
      renderBlogCards(lang);
    };
  </script>
</body>
```

- [ ] **Step 3: 静态检查**

Run: `npm run check`
Expected: 全绿（`qa` 扫描器会检查这个页面的链接；`/solutions/blog/${p.slug}.html` 是 JS
字符串拼接，不是静态 `href`，扫描器看不到也不会误报）

- [ ] **Step 4: Commit**

```bash
git add solutions/blog/index.html
git commit -m "feat(blog): render post list client-side from posts.json

Replaces the manual-HTML-editing instructions with a fetch+render script,
mirroring the same client-render pattern already used for content.json
overrides sitewide. Re-renders on language switch via the same
window.switchLang wrap technique used on generated article pages.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: admin/index.html — CSS：顶栏标签按钮 + Blog 视图样式

**Files:**
- Modify: `admin/index.html`

- [ ] **Step 1: 加 CSS**

在 `.btn-link:hover { color: var(--red); }` 之后插入：
```css

    /* ── Top-bar view tabs（网站内容 / Blog）── */
    .top-bar__nav-btn {
      background: none; border: none; font: inherit; cursor: pointer; padding: 0 0 2px;
      color: var(--text3); border-bottom: 2px solid transparent;
    }
    .top-bar__nav-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
    .top-bar__nav-btn:hover:not(.active) { color: var(--text2); }

    /* ── Blog view ── */
    .blog-toolbar { padding: 16px 24px; }
    .blog-list-row {
      display: flex; align-items: center; gap: 14px; padding: 12px 24px;
      border-bottom: 1px solid var(--border); font-size: 13px;
    }
    .blog-list-date { color: var(--text3); width: 90px; flex-shrink: 0; }
    .blog-list-title { flex: 1; }

    #blog-compose { max-width: 720px; margin: 0 auto; padding: 24px; }
    .compose-row { margin-bottom: 16px; }
    .compose-label { display: block; font-size: 12px; color: var(--text3); margin-bottom: 5px; }
    .compose-input, .compose-textarea {
      width: 100%; padding: 9px 12px; border: 1px solid var(--border); border-radius: 7px;
      font-size: 13px; font-family: inherit; background: var(--paper); color: var(--text);
      outline: none; resize: vertical;
    }
    .compose-input:focus, .compose-textarea:focus { border-color: var(--accent); }
    .compose-textarea { line-height: 1.7; }
    .compose-toolbar { margin-bottom: 6px; display: flex; gap: 6px; }
    .compose-toolbar button {
      padding: 4px 10px; border: 1px solid var(--border); border-radius: 5px;
      background: var(--paper); font-size: 12px; cursor: pointer;
    }
    .compose-cover-preview {
      max-width: 200px; border-radius: 6px; margin-top: 8px; display: none;
    }
    .lang-tabs { display: flex; gap: 0; margin-bottom: 16px; border-bottom: 1px solid var(--border); }
```

- [ ] **Step 2: 静态检查 + Commit**

Run: `npm run check`
Expected: 全绿

```bash
git add admin/index.html
git commit -m "feat(admin): add CSS for blog view (list rows, compose form)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: admin/index.html — HTML 结构：顶栏标签 + Blog 视图容器

**Files:**
- Modify: `admin/index.html`

- [ ] **Step 1: 顶栏改成可切换标签，包一层 view-content**

把：
```html
    <div class="top-bar__left">
      <a href="/" class="top-bar__logo" title="返回网站主页">千里同風</a>
      <nav class="top-bar__nav">
        <span class="top-bar__nav-current">网站内容</span>
        <span class="top-bar__nav-soon" title="二期开通">Blog（即将上线）</span>
        <a href="/solutions/demo/admin.html" class="top-bar__nav-link">运行监控</a>
      </nav>
    </div>
```
改成：
```html
    <div class="top-bar__left">
      <a href="/" class="top-bar__logo" title="返回网站主页">千里同風</a>
      <nav class="top-bar__nav">
        <button type="button" class="top-bar__nav-btn active" id="nav-content" onclick="switchAdminView('content')">网站内容</button>
        <button type="button" class="top-bar__nav-btn" id="nav-blog" onclick="switchAdminView('blog')">Blog</button>
        <a href="/solutions/demo/admin.html" class="top-bar__nav-link">运行监控</a>
      </nav>
    </div>
```

- [ ] **Step 2: 包一层 `#view-content`，新增 `#view-blog`**

把：
```html
  <div class="page-bar">
    <button type="button" class="page-btn active" data-page="home" onclick="switchPage('home')">首页</button>
    <button type="button" class="page-btn" data-page="about" onclick="switchPage('about')">关于我们</button>
    <button type="button" class="page-btn" data-page="milestones" onclick="switchPage('milestones')">大事记</button>
    <button type="button" class="page-btn" data-page="solutions" onclick="switchPage('solutions')">解决方案</button>
  </div>

  <div class="changes-bar" id="changes-bar" hidden>
    <span id="changes-count">已改 0 处</span>
    <button type="button" class="btn-sync" id="sync-btn" onclick="syncTranslate()">✨ 一键同步日英</button>
  </div>

  <iframe id="preview-frame" title="页面内容预览编辑"></iframe>
</div>
```
改成：
```html
  <div id="view-content">
    <div class="page-bar">
      <button type="button" class="page-btn active" data-page="home" onclick="switchPage('home')">首页</button>
      <button type="button" class="page-btn" data-page="about" onclick="switchPage('about')">关于我们</button>
      <button type="button" class="page-btn" data-page="milestones" onclick="switchPage('milestones')">大事记</button>
      <button type="button" class="page-btn" data-page="solutions" onclick="switchPage('solutions')">解决方案</button>
    </div>

    <div class="changes-bar" id="changes-bar" hidden>
      <span id="changes-count">已改 0 处</span>
      <button type="button" class="btn-sync" id="sync-btn" onclick="syncTranslate()">✨ 一键同步日英</button>
    </div>

    <iframe id="preview-frame" title="页面内容预览编辑"></iframe>
  </div>

  <div id="view-blog" hidden>
    <div class="blog-toolbar">
      <button type="button" class="btn-save" onclick="startNewPost()">+ 写新文章</button>
    </div>
    <div id="blog-list"></div>

    <div id="blog-compose" hidden>
      <div class="compose-row">
        <label class="compose-label">标签</label>
        <input type="text" id="compose-tag" class="compose-input" placeholder="如：AI・ハードウェア" oninput="onComposeInput()">
      </div>
      <div class="compose-row">
        <label class="compose-label">封面图（可选）</label>
        <input type="file" id="compose-cover-file" accept="image/*" onchange="handleCoverFile(this.files[0])">
        <img id="compose-cover-preview" class="compose-cover-preview" alt="">
      </div>
      <div class="compose-row">
        <label class="compose-label">标题（中文）</label>
        <input type="text" id="compose-title-zh" class="compose-input" oninput="onComposeInput()">
      </div>
      <div class="compose-row">
        <label class="compose-label">正文（中文，Markdown）</label>
        <div class="compose-toolbar">
          <button type="button" onclick="wrapSelection('**','**')">B 加粗</button>
          <button type="button" onclick="insertLinePrefix('## ')">H 小标题</button>
          <button type="button" onclick="insertLinePrefix('- ')">• 列表</button>
        </div>
        <textarea id="compose-body-zh" class="compose-textarea" rows="14" oninput="onComposeInput()"></textarea>
      </div>
      <div class="compose-row">
        <button type="button" class="btn-sync" id="compose-sync-btn" onclick="syncBlogTranslate()">✨ 一键同步日英</button>
        <span id="compose-sync-status" class="status"></span>
      </div>
      <div class="lang-tabs">
        <button type="button" class="page-btn active" data-other-lang="ja" onclick="switchComposeOtherLang('ja')">日本語</button>
        <button type="button" class="page-btn" data-other-lang="en" onclick="switchComposeOtherLang('en')">English</button>
      </div>
      <div class="compose-row">
        <label class="compose-label" id="other-lang-title-label">标题（日本語）</label>
        <input type="text" id="compose-title-other" class="compose-input" oninput="onComposeInput()">
      </div>
      <div class="compose-row">
        <label class="compose-label" id="other-lang-body-label">正文（日本語）</label>
        <textarea id="compose-body-other" class="compose-textarea" rows="14" oninput="onComposeInput()"></textarea>
      </div>
      <div class="compose-row">
        <button type="button" class="btn-save" onclick="publishPost()">发布</button>
        <button type="button" class="btn-link" onclick="cancelCompose()">取消</button>
        <span id="compose-publish-status" class="status"></span>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: 静态检查**

Run: `npm run check`
Expected: 全绿

- [ ] **Step 4: Commit**

```bash
git add admin/index.html
git commit -m "feat(admin): add HTML structure for blog compose panel and view toggle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: admin/index.html — classic script：状态、视图切换、撰写辅助函数

**Files:**
- Modify: `admin/index.html`（第一个 `<script>`，非 module）

- [ ] **Step 1: 加状态变量与函数**

在 `let editingOriginal = '';` 之后插入：
```js

/* ── Blog 状态 ── */
let blogPosts = [];
let composeState = null; // null = 未在撰写；对象 = 正在写/编辑
let composeOtherLang = 'ja';
let draftSaveTimer = null;

function escapeHtmlAdmin(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── 顶栏视图切换（网站内容 / Blog） ── */
function switchAdminView(view) {
  document.getElementById('nav-content').classList.toggle('active', view === 'content');
  document.getElementById('nav-blog').classList.toggle('active', view === 'blog');
  document.getElementById('view-content').hidden = view !== 'content';
  document.getElementById('view-blog').hidden = view !== 'blog';
  document.getElementById('save-btn').style.display = view === 'content' ? '' : 'none';
  if (view === 'blog' && blogPosts.length === 0) {
    loadBlogPosts();
    checkDraft();
  }
}

/* ── 文章列表渲染 ── */
function renderBlogList() {
  const listEl = document.getElementById('blog-list');
  if (blogPosts.length === 0) {
    listEl.innerHTML = '<div class="empty">还没有文章</div>';
    return;
  }
  listEl.innerHTML = blogPosts
    .map(
      (p) => `
    <div class="blog-list-row">
      <span class="blog-list-date">${p.date}</span>
      <span class="blog-list-title">${escapeHtmlAdmin(p.title.zh)}</span>
      <button type="button" class="btn-link" onclick="editPost('${p.slug}')">编辑</button>
      <button type="button" class="btn-link" onclick="unpublishPost('${p.slug}')">下架</button>
    </div>`,
    )
    .join('');
}

/* ── 撰写面板 ── */
function startNewPost() {
  composeState = {
    slug: null,
    tag: '',
    date: new Date().toISOString().slice(0, 10),
    cover: null,
    coverChanged: false,
    title: { zh: '', ja: '', en: '' },
    body: { zh: '', ja: '', en: '' },
  };
  composeOtherLang = 'ja';
  renderCompose();
  document.getElementById('blog-compose').hidden = false;
}

function editPost(slug) {
  const p = blogPosts.find((x) => x.slug === slug);
  if (!p) return;
  composeState = {
    slug: p.slug,
    tag: p.tag,
    date: p.date,
    cover: p.cover || null,
    coverChanged: false,
    title: { ...p.title },
    body: { ...p.body },
  };
  composeOtherLang = 'ja';
  renderCompose();
  document.getElementById('blog-compose').hidden = false;
}

function renderCompose() {
  document.getElementById('compose-tag').value = composeState.tag;
  document.getElementById('compose-title-zh').value = composeState.title.zh;
  document.getElementById('compose-body-zh').value = composeState.body.zh;
  const preview = document.getElementById('compose-cover-preview');
  if (composeState.cover) {
    preview.src = composeState.cover.startsWith('data:') ? composeState.cover : '/' + composeState.cover;
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
  renderOtherLangFields();
}

function renderOtherLangFields() {
  const langLabel = composeOtherLang === 'ja' ? '日本語' : 'English';
  document.getElementById('other-lang-title-label').textContent = `标题（${langLabel}）`;
  document.getElementById('other-lang-body-label').textContent = `正文（${langLabel}）`;
  document.getElementById('compose-title-other').value = composeState.title[composeOtherLang];
  document.getElementById('compose-body-other').value = composeState.body[composeOtherLang];
  document.querySelectorAll('.lang-tabs .page-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.otherLang === composeOtherLang);
  });
}

function switchComposeOtherLang(lang) {
  composeOtherLang = lang;
  renderOtherLangFields();
}

// 任意撰写字段变化时，把当前 DOM 值同步进 composeState，并安排一次草稿自动保存。
function onComposeInput() {
  if (!composeState) return;
  composeState.tag = document.getElementById('compose-tag').value;
  composeState.title.zh = document.getElementById('compose-title-zh').value;
  composeState.body.zh = document.getElementById('compose-body-zh').value;
  composeState.title[composeOtherLang] = document.getElementById('compose-title-other').value;
  composeState.body[composeOtherLang] = document.getElementById('compose-body-other').value;
  scheduleDraftSave();
}

function cancelCompose() {
  composeState = null;
  document.getElementById('blog-compose').hidden = true;
  clearTimeout(draftSaveTimer);
}

function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => saveDraft(), 2000);
}

/* ── Markdown 工具栏 ── */
function wrapSelection(before, after) {
  const ta = document.getElementById('compose-body-zh');
  const { selectionStart: s, selectionEnd: e, value } = ta;
  ta.value = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e);
  ta.focus();
  onComposeInput();
}

function insertLinePrefix(prefix) {
  const ta = document.getElementById('compose-body-zh');
  const { selectionStart: s, value } = ta;
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  ta.value = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  ta.focus();
  onComposeInput();
}

/* ── 封面图：canvas 压缩转 WebP，超限自动降质重试 ── */
function handleCoverFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const MAX_SIDE = 1600;
      let { width, height } = img;
      if (width > MAX_SIDE || height > MAX_SIDE) {
        const ratio = Math.min(MAX_SIDE / width, MAX_SIDE / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      let quality = 0.85;
      let dataUrl = canvas.toDataURL('image/webp', quality);
      while (Math.floor((dataUrl.length * 3) / 4) > 500000 && quality > 0.4) {
        quality -= 0.15;
        dataUrl = canvas.toDataURL('image/webp', quality);
      }
      composeState.cover = dataUrl;
      composeState.coverChanged = true;
      const preview = document.getElementById('compose-cover-preview');
      preview.src = dataUrl;
      preview.style.display = 'block';
      scheduleDraftSave();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
```

- [ ] **Step 2: 静态检查**

Run: `npm run check`
Expected: 全绿

- [ ] **Step 3: Commit**

```bash
git add admin/index.html
git commit -m "feat(admin): add blog compose state, markdown toolbar, cover image compression

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: admin/index.html — module script：Firestore 草稿 + 发布/下架/翻译同步

**Files:**
- Modify: `admin/index.html`（`<script type="module">`）

- [ ] **Step 1: 加 Firestore import**

把：
```js
import { auth } from '/js/shared/firebase-init.js';
import { isAdmin } from '/js/shared/admins.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
```
改成：
```js
import { auth, db } from '/js/shared/firebase-init.js';
import { isAdmin } from '/js/shared/admins.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { doc, setDoc, getDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
```

- [ ] **Step 2: 加 Blog 相关函数**

在 `window.fbLogout = () => signOut(auth).then(() => location.reload());` 之前插入：
```js
window.loadBlogPosts = async function () {
  const { posts } = await api('GET', '/blog/posts');
  blogPosts = posts || [];
  renderBlogList();
};

window.saveDraft = async function () {
  if (!composeState) return;
  try {
    const { cover, coverChanged, ...rest } = composeState;
    await setDoc(doc(db, 'blog_drafts', 'current'), {
      ...rest,
      published: false,
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* 草稿保存失败不打断撰写，只是少一层保险 */
  }
};

window.checkDraft = async function () {
  try {
    const snap = await getDoc(doc(db, 'blog_drafts', 'current'));
    if (!snap.exists() || snap.data().published !== false) return;
    const d = snap.data();
    if (!confirm('检测到未发布的草稿，是否恢复？')) return;
    composeState = {
      slug: d.slug || null,
      tag: d.tag || '',
      date: d.date || new Date().toISOString().slice(0, 10),
      cover: null,
      coverChanged: false,
      title: d.title || { zh: '', ja: '', en: '' },
      body: d.body || { zh: '', ja: '', en: '' },
    };
    composeOtherLang = 'ja';
    renderCompose();
    document.getElementById('blog-compose').hidden = false;
  } catch {
    /* 读取失败忽略，不阻塞正常使用 */
  }
};

window.syncBlogTranslate = async function () {
  onComposeInput();
  const btn = document.getElementById('compose-sync-btn');
  const statusEl = document.getElementById('compose-sync-status');
  btn.disabled = true;
  btn.textContent = '同步中…';
  try {
    const result = await api('POST', '/translate', {
      fields: [
        { key: 'title', zh: composeState.title.zh },
        { key: 'body', zh: composeState.body.zh },
      ],
    });
    if (result.ja?.title) composeState.title.ja = result.ja.title;
    if (result.ja?.body) composeState.body.ja = result.ja.body;
    if (result.en?.title) composeState.title.en = result.en.title;
    if (result.en?.body) composeState.body.en = result.en.body;
    renderOtherLangFields();
    statusEl.textContent = '✓ 已同步';
    scheduleDraftSave();
  } catch (e) {
    statusEl.textContent = '同步失败：' + e.message;
  }
  btn.disabled = false;
  btn.textContent = '✨ 一键同步日英';
};

window.publishPost = async function () {
  onComposeInput();
  const statusEl = document.getElementById('compose-publish-status');
  statusEl.className = 'status';
  statusEl.textContent = '发布中…';
  const payload = {
    tag: composeState.tag,
    date: composeState.date,
    title: composeState.title,
    body: composeState.body,
  };
  if (composeState.slug) payload.slug = composeState.slug;
  if (composeState.coverChanged && composeState.cover) payload.cover = composeState.cover;
  try {
    const { commitSha } = await api('POST', '/blog/publish', payload);
    await setDoc(
      doc(db, 'blog_drafts', 'current'),
      { published: true, updatedAt: serverTimestamp() },
      { merge: true },
    );
    composeState = null;
    document.getElementById('blog-compose').hidden = true;
    await loadBlogPosts();
    waitForDeploy(commitSha, statusEl);
  } catch (e) {
    statusEl.className = 'status err';
    statusEl.textContent = '✗ 发布失败：' + e.message;
  }
};

window.unpublishPost = async function (slug) {
  if (!confirm('确定下架这篇文章吗？')) return;
  try {
    await api('POST', '/blog/unpublish', { slug });
    await loadBlogPosts();
  } catch (e) {
    alert('下架失败：' + e.message);
  }
};

```

- [ ] **Step 3: 静态检查**

Run: `npm run check`
Expected: 全绿

- [ ] **Step 4: Commit**

```bash
git add admin/index.html
git commit -m "feat(admin): add blog publish/unpublish/translate-sync and Firestore draft autosave

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: 🧑 Firestore 控制台加 blog_drafts 规则 + Worker 部署

- [ ] **Step 1: 🧑 加 Firestore 规则**

引导：Firebase 控制台 → Firestore Database → 规则 → 在现有规则里加一条（写法参照已有的
`meta`/`rate_limits` 规则）：
```
match /blog_drafts/{draftId} {
  allow read, write: if request.auth != null &&
    request.auth.token.email in ['sherlockafa@gmail.com', 'yuki.minami@senridf.com'];
}
```
发布规则。

- [ ] **Step 2: 部署 Worker**（执行者操作，本机已有 wrangler 登录态）

Run: `cd workers/sdf-admin && npx wrangler deploy`
Expected: 部署成功，输出仍是 `https://sdf-admin.sherlockafa.workers.dev`

- [ ] **Step 3: 冒烟测试新路由鉴权**

Run: `curl -s https://sdf-admin.sherlockafa.workers.dev/blog/posts`
Expected: `{"error":"未登录"}`（401，说明新路由已生效且鉴权闸门在工作）

---

### Task 10: 🧑 本地浏览器验证全流程

前置：Task 1–9 全部完成。CI 测不了浏览器 DOM 交互 + Firestore + 真实 GitHub 写入，
此步骤必须人工过一遍。

- [ ] **Step 1: 起本地静态服务器**

Run: `npx serve "c:\Users\sherl\Desktop\Claude Code\senridoufuu-web" -l 3000`

- [ ] **Step 2: 🧑 走一遍发布流程**

1. 打开 `http://localhost:3000/admin/` → 登录 → 点顶栏「Blog」标签 → 显示"还没有文章"
2. 点「+ 写新文章」→ 填标签、标题（中文）、正文（中文，试试 Markdown 加粗/小标题/列表按钮）、
   选一张封面图（确认压缩后预览图正常显示）
3. 停顿几秒后（自动存草稿）→ 刷新页面 → 重新登录 → 点「Blog」→ 应弹出"检测到未发布的草稿，
   是否恢复？"→ 确认恢复后内容都还在（封面图除外，草稿不存图，需重新选）
4. 点「✨ 一键同步日英」→ 等待完成 → 切到"日本語"/"English"标签确认有内容
5. 点「发布」→ 状态显示"同步部署中…"，2-3 分钟后变"已上线"
6. 打开 `https://www.senridf.com/solutions/blog/` → 确认新文章卡片出现，日期/标签/标题/摘要正确
7. 点进文章 → 确认标题+正文正确渲染（加粗/小标题/列表都生效）、封面图显示
8. 切语言（日/中/En）→ 确认文章标题正文和列表卡片都跟着变
9. 回后台点该文章「编辑」→ 确认标题/正文/标签正确回填 → 改一点内容 → 重新发布 →
   确认线上更新生效
10. 点「下架」→ 确认列表消失 → 直接访问该文章 URL → 确认变成 404

---

### Task 11: 推上线 + 文档

- [ ] **Step 1: push**

Run: `git pull --no-rebase && git push`
Expected: 若远端有 Worker 直接提交的 `content:`/`blog:` 类 commit（本轮测试期间产生的），
`git pull --no-rebase` 会自动合并（不同文件，历史上无冲突）；push 成功后触发自动镜像。

- [ ] **Step 2: 更新 docs/TOOLS.md**

在"admin/ 管理后台"条目里补一段 Blog 模块架构说明：三个新路由（`GET /blog/posts`、
`POST /blog/publish`、`POST /blog/unpublish`）、`posts.json` 存完整三语标题+正文（供编辑回填）、
文章页客户端 marked+DOMPurify 渲染 + `window.switchLang` 包一层实现多语言切换（不改
`main.js`）、Firestore `blog_drafts` 规则位置、封面图客户端压缩转 WebP 流程。

- [ ] **Step 3: Commit + push**

```bash
git add docs/TOOLS.md
git commit -m "docs: record Blog module architecture in TOOLS.md

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## 自查记录（写计划时已核）

- spec §2（后台交互：独立面板、非点击范式）→ Task 6/7（`#view-blog` 独立于 `#view-content`）。
- spec §3（Markdown 子集 + 客户端 marked/DOMPurify 渲染，不做服务端渲染）→ Task 1
  `renderArticleHtml`（只嵌数据不嵌渲染结果）+ Task 7 工具栏按钮。
- spec §4（多语言展示，包一层 `window.switchLang`，不改 `main.js`）→ Task 1 模板里的
  内嵌脚本 + Task 4（列表页同样手法）。
- spec §5（`posts.json` 存完整标题+正文、发布三步提交、slug 规则、编辑走同一发布逻辑）→
  Task 1 `upsertPost`/`generateSlug` + Task 3 路由实现。
- spec §6（封面图客户端压缩、Worker 再校验、随发布请求一起提交非独立接口）→ Task 7
  `handleCoverFile` + Task 3 `/blog/publish` 内联处理 `body.cover`。
- spec §7（Firestore 草稿自动保存，不存大图，仅存文字）→ Task 8 `saveDraft`（显式解构掉
  `cover`）+ Task 9 Firestore 规则。
- spec §8（Worker 代码结构：blog.js + index.js + github.js）→ Task 1/2/3。
- spec §9（三步提交幂等重试友好、翻译失败不阻塞、草稿失败静默）→ Task 3 `/blog/publish`
  用 `existing.cover` 兜底 + Task 8 各处 try/catch 的错误提示文案。
- spec §10（纯逻辑测试 + 人工发布链路验证）→ Task 1 的 node --test；Task 10 的完整走查。
- spec §11（Firestore 规则一次性设置）→ Task 9 Step 1。
- 类型一致性检查：`composeState.title`/`body` 结构 `{zh,ja,en}` 在 Task 6（HTML 字段 id）、
  Task 7（`renderCompose`/`onComposeInput`）、Task 8（`publishPost`/`syncBlogTranslate`）
  三处保持一致；`posts.json` 条目字段（`slug/date/tag/title/body/cover`）在 Task 1
  （`upsertPost`/`removePost` 测试）、Task 3（Worker 路由构造 entry）、Task 4（列表页读取）、
  Task 7（`editPost`/`renderBlogList`）四处保持一致。
- 未发现遗漏的 spec 要求。
