# CMS 三期：图片上传通用化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让站长能在后台上传/替换团队照片（网站图片），并在 Blog 正文中间插入配图。

**Architecture:** Worker 新增纯逻辑模块 `images.js`（大小校验 1MB + 路径生成），`PUT /content` 扩展支持批量上传网站图片、新增 `POST /blog/image` 支持立即上传单张插图；前端两处编辑器（就地内容编辑器 / Blog 撰写面板）各自加上传交互；`js/main.js` 新增渲染 `content.images` 的逻辑。

**Tech Stack:** Cloudflare Workers（ESM）、原生 Canvas API 压缩图片、`node --test`。

---

## 背景（写代码前必读）

- 设计文档：`docs/specs/2026-07-23-cms-image-upload-design.md`（本计划的每个任务都对应其中的章节，任务里会标注）。
- 项目是纯静态零构建站点，Windows 环境，部署链路：本地 `git commit` → 手动 `git push`（已在本会话确认过要先总结再推）→ 自动镜像 workflow → 同事 Cloudflare Pages 构建上线（约 2-3 分钟）。
- `workers/sdf-admin/` 是独立部署的 Cloudflare Worker（管理后台的唯一写入通道），源码是 ESM，改完要 `npx wrangler deploy` 才生效（这一步仍需向用户确认，不在自动批准范围内）。
- 现有纯逻辑模块都不含 IO，方便用 `node --test` 直接测：`validate.js`、`translate.js`、`blog.js`、`rateLimit.js`，都在 `workers/sdf-admin/src/`，测试统一写在仓库根的 `tests/admin-worker.test.mjs`。
- `content.json`（仓库根目录）当前长这样，`images` 字段是从一期设计遗留、从未被读取过的空对象：
  ```json
  {
    "zh": { "...": "..." },
    "ja": { "...": "..." },
    "en": { "...": "..." },
    "images": {}
  }
  ```
- 就地可视化编辑器 `admin/index.html`：点击页面里 `[data-i18n]` 元素会变成可编辑文字，改动暂存在 `pendingZh/Ja/En`，点"保存并发布"时打包成一次 `PUT /content` 请求。本计划要新增 `pendingImages`，走同一套暂存-确认-提交模型。
- Blog 撰写面板 `admin/blog/index.html`：已有封面图上传（`handleCoverFile`，canvas 压缩转 WebP），本计划要复用同一套压缩逻辑给"正文插图"用。

---

### Task 1: Worker 图片校验/路径生成纯逻辑模块

对应设计文档 §3（图片处理统一规则）。

**Files:**
- Create: `workers/sdf-admin/src/images.js`
- Test: `tests/admin-worker.test.mjs`（追加，不新建文件）

- [ ] **Step 1: 在 `tests/admin-worker.test.mjs` 顶部的 import 区追加一行**

在现有的
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
后面新增：
```js
import {
  MAX_IMAGE_BYTES,
  validateImageKey,
  validateImageDataUrl,
  siteImagePath,
  blogInlineImagePath,
} from '../workers/sdf-admin/src/images.js';
```

- [ ] **Step 2: 在文件末尾追加失败的测试**

```js
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
```

- [ ] **Step 3: 运行测试，确认因模块不存在而失败**

Run: `npm test`
Expected: FAIL，报错类似 `Cannot find module '../workers/sdf-admin/src/images.js'`

- [ ] **Step 4: 创建 `workers/sdf-admin/src/images.js`**

```js
// 图片上传纯逻辑（无 IO）：大小/格式校验、存储路径生成。
// 供 sdf-admin Worker 的 PUT /content（网站图片）、POST /blog/publish（封面图，见 blog.js）、
// POST /blog/image（正文插图）复用同一套规则，避免三处各写一份还不一致。

export const MAX_IMAGE_BYTES = 1_000_000; // 客户端已压缩，这里再校验一次防绕过

// 图片位的 key 会拼进 GitHub 文件路径，必须限制字符集防止路径穿越（如 ../../xxx）。
export function validateImageKey(key) {
  return typeof key === 'string' && /^[a-zA-Z0-9_]{1,64}$/.test(key);
}

// 校验并拆出 base64 内容。返回 { ok:true, base64 } 或 { ok:false, error }。
export function validateImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return { ok: false, error: '图片格式错误' };
  }
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  if (base64 === dataUrl) return { ok: false, error: '图片格式错误' };
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) return { ok: false, error: '图片过大' };
  return { ok: true, base64 };
}

// 网站内容图片（团队照片等）：按 key 覆盖，重新上传会生成新文件名（旧文件不删，见设计文档范围外）。
export function siteImagePath(key, now = Date.now()) {
  return `assets/images/site/${key}-${now}.webp`;
}

// Blog 正文插图：每次插入都是新文件，不与任何 key 关联。
export function blogInlineImagePath(now = Date.now(), randomFn = Math.random) {
  const rand = Math.floor(randomFn() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
  return `assets/images/blog/inline-${now}-${rand}.webp`;
}
```

- [ ] **Step 5: 运行测试确认全部通过**

Run: `npm test`
Expected: PASS，新增的 8 个测试全绿

- [ ] **Step 6: Commit**

```bash
git add workers/sdf-admin/src/images.js tests/admin-worker.test.mjs
git commit -m "feat(admin-worker): add images pure module (size/key validation, path generation)"
```

---

### Task 2: Blog 封面图上限改为复用 images.js 的 1MB

对应设计文档 §3 最后一条（"顺带统一"）。

**Files:**
- Modify: `workers/sdf-admin/src/blog.js:1-4`
- Modify: `tests/admin-worker.test.mjs`（"validatePublishPayload 接受不带封面图，拒绝超大封面图"这个测试）

- [ ] **Step 1: 修改 `tests/admin-worker.test.mjs` 里的超大封面图测试，让阈值对应 1MB**

把现有的：
```js
test('validatePublishPayload 接受不带封面图，拒绝超大封面图', () => {
  const base = {
    tag: 'AI',
    date: '2026-07-22',
    title: { ja: 'a', zh: 'a', en: 'a' },
    body: { ja: 'a', zh: 'a', en: 'a' },
  };
  assert.equal(validatePublishPayload(base).ok, true);
  const huge = { ...base, cover: 'data:image/webp;base64,' + 'A'.repeat(700_000) };
  assert.equal(validatePublishPayload(huge).ok, false);
});
```
改成：
```js
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
  const okSize = { ...base, cover: 'data:image/webp;base64,' + 'A'.repeat(500_000) };
  assert.equal(validatePublishPayload(okSize).ok, true); // 500KB 在旧上限之外、新上限之内
});
```

- [ ] **Step 2: 运行测试，确认新断言（500KB 应通过）因旧的 500_000 上限而失败**

Run: `npm test`
Expected: FAIL，`okSize` 那一条断言不通过（旧代码里 500KB 卡在上限边缘会被拒绝）

- [ ] **Step 3: 修改 `workers/sdf-admin/src/blog.js`**

把文件顶部的：
```js
// Blog 模块纯逻辑（无 IO）：slug 生成、发布载荷校验、posts.json 增删改、文章 HTML 模板渲染。
// 供 sdf-admin Worker 的 /blog/* 路由使用。

const MAX_COVER_BYTES = 500_000; // 客户端已压缩，这里再校验一次防绕过
```
改成：
```js
// Blog 模块纯逻辑（无 IO）：slug 生成、发布载荷校验、posts.json 增删改、文章 HTML 模板渲染。
// 供 sdf-admin Worker 的 /blog/* 路由使用。

import { MAX_IMAGE_BYTES } from './images.js'; // 封面图大小上限与网站图片/Blog插图统一，避免三处限制不一致
```

然后把 `validatePublishPayload` 里的：
```js
    const approxBytes = Math.floor((stripped.length * 3) / 4);
    if (approxBytes > MAX_COVER_BYTES) return { ok: false, error: '封面图过大' };
```
改成：
```js
    const approxBytes = Math.floor((stripped.length * 3) / 4);
    if (approxBytes > MAX_IMAGE_BYTES) return { ok: false, error: '封面图过大' };
```

- [ ] **Step 4: 运行测试确认全部通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add workers/sdf-admin/src/blog.js tests/admin-worker.test.mjs
git commit -m "fix(admin-worker): raise cover image cap to 1MB, share limit with images.js"
```

---

### Task 3: Worker `PUT /content` 支持上传网站图片

对应设计文档 §4（网站图片-数据流）。

**Files:**
- Modify: `workers/sdf-admin/src/index.js`

- [ ] **Step 1: 顶部 import 区，把**

```js
import {
  generateSlug,
  validatePublishPayload,
  upsertPost,
  removePost,
  renderArticleHtml,
} from './blog.js';
```

改成（新增一行 images.js 的 import——这一步先只导入 Task 3 会用到的三个，`blogInlineImagePath` 留到 Task 4 再加，避免中间提交出现"导入了但没用到"的 lint 报错）：

```js
import {
  generateSlug,
  validatePublishPayload,
  upsertPost,
  removePost,
  renderArticleHtml,
} from './blog.js';
import { validateImageKey, validateImageDataUrl, siteImagePath } from './images.js';
```

- [ ] **Step 2: 把现有的 `PUT /content` 路由整段替换**

现有代码（`workers/sdf-admin/src/index.js` 约第 78-95 行）：

```js
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
```

替换为：

```js
      if (url.pathname === '/content' && request.method === 'PUT') {
        let body;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: '请求格式错误' }, cors);
        }

        // images 是本次新上传的图片（{key: dataURL}），与 content.images 里已有的路径分开传，
        // 避免把整段 base64 存进 content.json——这里先落库拿到路径，再写回 content.images。
        const images = body.images && typeof body.images === 'object' ? body.images : {};
        const content = {
          ...body.content,
          images: { ...(body.content && body.content.images) },
        };

        for (const [key, dataUrl] of Object.entries(images)) {
          if (!validateImageKey(key)) {
            return json(400, { error: `图片字段名非法：${key}` }, cors);
          }
          const imgCheck = validateImageDataUrl(dataUrl);
          if (!imgCheck.ok) return json(400, { error: imgCheck.error }, cors);
          const path = siteImagePath(key);
          await putFile(REPO, path, imgCheck.base64, `content: upload image ${key}`, env.GITHUB_TOKEN, {
            alreadyBase64: true,
          });
          content.images[key] = path;
        }

        const check = validateContentPayload(content);
        if (!check.ok) return json(400, { error: check.error }, cors);
        const { commitSha } = await putFile(
          REPO,
          CONTENT_PATH,
          JSON.stringify(content, null, 2) + '\n',
          'content: update via admin panel',
          env.GITHUB_TOKEN,
        );
        // 把最终解析出的图片路径带回前端，前端拿它更新本地的 currentOverrides.images，
        // 不然下次保存时（同一会话内没刷新页面）还是旧值，会把刚上传的图片路径覆盖掉。
        return json(200, { ok: true, commitSha, images: content.images }, cors);
      }
```

- [ ] **Step 3: 运行测试 + lint 确认没有破坏原有逻辑、没有未用到的导入**

Run: `npm test && npx eslint workers/sdf-admin/src/index.js`
Expected: 两个命令都无报错（`/content` 路由本身是 Worker fetch handler，走真实 GitHub API，现有测试套件从不测这一层，和 `/blog/publish` 等路由一致，人工验证见 Task 11）

- [ ] **Step 4: Commit**

```bash
git add workers/sdf-admin/src/index.js
git commit -m "feat(admin-worker): support image uploads in PUT /content"
```

---

### Task 4: Worker 新增 `POST /blog/image`（正文插图，立即上传）

对应设计文档 §5（Blog 正文插图，方案A）。

**Files:**
- Modify: `workers/sdf-admin/src/index.js`

- [ ] **Step 1: 把 Task 3 加的 import 行补上 `blogInlineImagePath`**

把：
```js
import { validateImageKey, validateImageDataUrl, siteImagePath } from './images.js';
```
改成：
```js
import {
  validateImageKey,
  validateImageDataUrl,
  siteImagePath,
  blogInlineImagePath,
} from './images.js';
```

- [ ] **Step 2: 在 `/blog/unpublish` 路由后面、外层 `catch` 之前新增路由**

找到现有代码里 `/blog/unpublish` 路由结尾（大约在 `return json(200, { ok: true, commitSha }, cors);` 之后、`}` 之后），紧接着的下一行是：

```js
    } catch (e) {
      return json(502, { error: e.message || '保存服务出错，请稍后重试' }, cors);
    }
```

在这一段 `catch` 之前插入新路由：

```js
      if (url.pathname === '/blog/image' && request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: '请求格式错误' }, cors);
        }
        const imgCheck = validateImageDataUrl(body.image);
        if (!imgCheck.ok) return json(400, { error: imgCheck.error }, cors);
        const path = blogInlineImagePath();
        await putFile(REPO, path, imgCheck.base64, 'blog: upload inline image', env.GITHUB_TOKEN, {
          alreadyBase64: true,
        });
        return json(200, { ok: true, path }, cors);
      }
    } catch (e) {
      return json(502, { error: e.message || '保存服务出错，请稍后重试' }, cors);
    }
```

（也就是说：新路由的 `if` 块加在原本的 `try { ... } catch` 的 `try` 块内部末尾，紧挨着原来的 `catch` 之前——鉴权、CORS、限流都在这个 `try` 之前已经统一处理过，新路由自动继承，不用重复写。）

- [ ] **Step 3: 运行测试 + lint 确认没有破坏原有逻辑**

Run: `npm test && npx eslint workers/sdf-admin/src/index.js`
Expected: 两个命令都无报错

- [ ] **Step 4: Commit**

```bash
git add workers/sdf-admin/src/index.js
git commit -m "feat(admin-worker): add POST /blog/image for inline post images"
```

---

### Task 5: 团队页加图片位标记

对应设计文档 §4（标记方式）。

**Files:**
- Modify: `about/index.html:37-41,52-56`

- [ ] **Step 1: 修改南雪的照片容器**

把：
```html
        <div class="team-member" data-animate data-animate-delay="1">
          <div class="team-member__photo">
            <div class="team-member__photo-inner">
              <span class="team-member__photo-monogram">南</span>
            </div>
          </div>
```
改成：
```html
        <div class="team-member" data-animate data-animate-delay="1">
          <div class="team-member__photo">
            <div class="team-member__photo-inner" data-image-key="team1_photo">
              <span class="team-member__photo-monogram">南</span>
            </div>
          </div>
```

- [ ] **Step 2: 修改謝怡然的照片容器**

把：
```html
        <div class="team-member" data-animate data-animate-delay="2">
          <div class="team-member__photo">
            <div class="team-member__photo-inner">
              <span class="team-member__photo-monogram">謝</span>
            </div>
          </div>
```
改成：
```html
        <div class="team-member" data-animate data-animate-delay="2">
          <div class="team-member__photo">
            <div class="team-member__photo-inner" data-image-key="team2_photo">
              <span class="team-member__photo-monogram">謝</span>
            </div>
          </div>
```

- [ ] **Step 3: Commit**

```bash
git add about/index.html
git commit -m "feat(about): mark team photo slots with data-image-key"
```

---

### Task 6: CSS：上传后的照片如何覆盖 monogram

对应设计文档 §3（保持比例不拉伸）。

**Files:**
- Modify: `css/main.css`（紧接在 `.team-member__photo-monogram` 规则之后，约第 582-589 行之后）

- [ ] **Step 1: 在 `.team-member__photo-monogram` 规则后追加**

在：
```css
.team-member__photo-monogram {
  font-family: var(--f-serif);
  font-size: 3rem;
  font-weight: 300;
  letter-spacing: 0.1em;
  color: var(--c-accent);
  opacity: 0.4;
}
```
后面新增：
```css
/* 上传真实照片后插入的 <img>，盖住 monogram；object-fit:cover 保持原始比例不拉伸 */
.content-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

- [ ] **Step 2: 运行 qa 扫描确认没有破坏静态检查**

Run: `npm run qa`
Expected: PASS（这条规则只是新增 CSS class，不引用任何图片文件，扫描器不会报缺图）

- [ ] **Step 3: Commit**

```bash
git add css/main.css
git commit -m "feat(css): add .content-image rule for uploaded site images"
```

---

### Task 7: `js/main.js` 渲染 `content.images`

对应设计文档 §4（前端渲染）。

**Files:**
- Modify: `js/main.js:794-810`

- [ ] **Step 1: 在 `initScrollAnimations` 函数后面新增 `applyImages` 函数**

在：
```js
/* === SCROLL ANIMATIONS === */
function initScrollAnimations() {
  ...
  document.querySelectorAll('[data-animate]').forEach((el) => observer.observe(el));
}
```
后面新增：
```js
/* === CONTENT IMAGES ===
   content.json 的 images 字段：{key: 仓库内路径}。key 对应页面里 data-image-key 元素，
   找不到对应 key 时保持页面原有内容（monogram 等占位符）不变，两种状态自然共存。 */
function applyImages(images) {
  Object.entries(images).forEach(([key, path]) => {
    if (!path) return;
    const el = document.querySelector(`[data-image-key="${key}"]`);
    if (!el) return;
    let img = el.querySelector('.content-image');
    if (!img) {
      img = document.createElement('img');
      img.className = 'content-image';
      img.alt = '';
      el.style.position = 'relative';
      el.appendChild(img);
    }
    img.src = path.startsWith('/') ? path : '/' + path;
  });
}
```

- [ ] **Step 2: 在 `DOMContentLoaded` 里的 content.json 合并逻辑里调用它**

把：
```js
  fetch('/content.json')
    .then((r) => (r.ok ? r.json() : {}))
    .then((ov) => {
      ['ja', 'zh', 'en'].forEach((l) => {
        if (ov[l]) Object.assign(T[l], ov[l]);
      });
    })
    .catch(() => {})
    .finally(() => {
      applyTranslations(currentLang);
      initScrollAnimations();
    });
```
改成：
```js
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
```

- [ ] **Step 3: Lint 确认没有语法问题**

Run: `npx eslint js/main.js`
Expected: 无报错输出

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "feat(main): render content.images onto data-image-key elements"
```

---

### Task 8: 就地编辑器（`admin/index.html`）支持图片上传

对应设计文档 §4（后台交互、数据流）。

**Files:**
- Modify: `admin/index.html`

- [ ] **Step 1: 状态变量里新增 `pendingImages`**

把：
```js
let currentOverrides = {}; // 已发布的基线（GET /content 结果），module script 的 loadContent/save 读写
let pendingZh = {};
let pendingJa = {};
let pendingEn = {};
let editingEl = null;
let editingOriginal = '';
```
改成：
```js
let currentOverrides = {}; // 已发布的基线（GET /content 结果），module script 的 loadContent/save 读写
let pendingZh = {};
let pendingJa = {};
let pendingEn = {};
let pendingImages = {}; // {key: dataURL}，待上传的新图片
let editingEl = null;
let editingOriginal = '';
```

- [ ] **Step 2: `FRAME_STYLE` 里给图片位加悬浮提示**

把：
```js
const FRAME_STYLE = `
  [data-i18n]:hover { outline: 1px dashed #2563eb; outline-offset: 2px; cursor: text; }
  [data-i18n][contenteditable="true"] { outline: 2px solid #2563eb; outline-offset: 2px; cursor: text; background: #eef2ff; }
  .cms-pill {
```
改成：
```js
const FRAME_STYLE = `
  [data-i18n]:hover { outline: 1px dashed #2563eb; outline-offset: 2px; cursor: text; }
  [data-i18n][contenteditable="true"] { outline: 2px solid #2563eb; outline-offset: 2px; cursor: text; background: #eef2ff; }
  [data-image-key] { cursor: pointer; }
  [data-image-key]:hover { outline: 2px dashed #2563eb; outline-offset: 2px; }
  .cms-pill {
```

- [ ] **Step 3: `updateChangesBar` 把图片改动也计入数量**

把：
```js
function updateChangesBar() {
  const count = Object.keys(pendingZh).length;
  const bar = document.getElementById('changes-bar');
  bar.hidden = count === 0;
  document.getElementById('changes-count').textContent = `已改 ${count} 处`;
}
```
改成：
```js
function updateChangesBar() {
  const count = Object.keys(pendingZh).length + Object.keys(pendingImages).length;
  const bar = document.getElementById('changes-bar');
  bar.hidden = count === 0;
  document.getElementById('changes-count').textContent = `已改 ${count} 处`;
}
```

- [ ] **Step 4: `initEditableFrame` 里扫描图片位、重新应用本会话已暂存的图片、绑定点击**

把现有的：
```js
  // 把本次会话里已改但未发布的值，重新套到刚加载的页面上——
  // 否则切走标签再切回来，看到的是发布前的旧文字，像是改动丢了。
  doc.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (pendingZh[key] !== undefined) el.textContent = pendingZh[key];
  });

  editingEl = null;

  doc.addEventListener(
    'click',
    (e) => {
      const el = e.target.closest('[data-i18n]');
      if (el && el.isContentEditable) return; // 已在编辑中，交给浏览器处理光标定位
      e.preventDefault(); // 预览态下不允许真的跳转
      if (el) startEdit(doc, el);
    },
    true,
  );
}
```
改成：
```js
  // 把本次会话里已改但未发布的值，重新套到刚加载的页面上——
  // 否则切走标签再切回来，看到的是发布前的旧文字/旧图片，像是改动丢了。
  doc.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (pendingZh[key] !== undefined) el.textContent = pendingZh[key];
  });
  doc.querySelectorAll('[data-image-key]').forEach((el) => {
    const key = el.dataset.imageKey;
    if (pendingImages[key]) applyImagePreview(el, pendingImages[key]);
  });

  editingEl = null;

  doc.addEventListener(
    'click',
    (e) => {
      const textEl = e.target.closest('[data-i18n]');
      if (textEl && textEl.isContentEditable) return; // 已在编辑中，交给浏览器处理光标定位
      const imageEl = e.target.closest('[data-image-key]');
      e.preventDefault(); // 预览态下不允许真的跳转
      if (imageEl) {
        startImageEdit(imageEl);
      } else if (textEl) {
        startEdit(doc, textEl);
      }
    },
    true,
  );
}

/* ── 图片位预览：在容器内插入/更新一张覆盖全区域的 <img>，object-fit:cover 不拉伸 ── */
function applyImagePreview(el, dataUrl) {
  let img = el.querySelector('.content-image');
  if (!img) {
    img = el.ownerDocument.createElement('img');
    img.className = 'content-image';
    el.style.position = 'relative';
    el.appendChild(img);
  }
  img.src = dataUrl;
}

/* ── 压缩图片：canvas 转 WebP，超限自动降质重试，保持原始宽高比不拉伸 ── */
function compressImageToWebp(file, maxBytes, callback) {
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
      while (Math.floor((dataUrl.length * 3) / 4) > maxBytes && quality > 0.4) {
        quality -= 0.15;
        dataUrl = canvas.toDataURL('image/webp', quality);
      }
      callback(dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

const MAX_IMAGE_BYTES = 1_000_000;

/* ── 点击图片位：弹文件选择框，选完压缩、预览、暂存 ── */
function startImageEdit(el) {
  const key = el.dataset.imageKey;
  const doc = el.ownerDocument;
  const input = doc.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    compressImageToWebp(file, MAX_IMAGE_BYTES, (dataUrl) => {
      pendingImages[key] = dataUrl;
      applyImagePreview(el, dataUrl);
      updateChangesBar();
    });
  };
  input.click();
}
```

- [ ] **Step 5: `window.save` 把 `pendingImages` 一起提交，并用返回值更新本地状态**

把：
```js
window.save = async function () {
  commitActiveEdit();
  const btn = document.getElementById('save-btn');
  const statusEl = document.getElementById('status');
  btn.disabled = true;
  btn.textContent = '保存中…';
  statusEl.className = 'status';
  statusEl.textContent = '';
  try {
    const ov = {
      zh: { ...currentOverrides.zh, ...pendingZh },
      ja: { ...currentOverrides.ja, ...pendingJa },
      en: { ...currentOverrides.en, ...pendingEn },
      images: { ...currentOverrides.images },
    };
    const { commitSha } = await api('PUT', '/content', { content: ov });
    currentOverrides = ov;
    pendingZh = {};
    pendingJa = {};
    pendingEn = {};
    updateChangesBar();
    waitForDeploy(commitSha, statusEl);
  } catch (e) {
    statusEl.className = 'status err';
    statusEl.textContent = '✗ 保存失败：' + e.message;
  }
  btn.disabled = false;
  btn.textContent = '保存并发布';
};
```
改成：
```js
window.save = async function () {
  commitActiveEdit();
  const btn = document.getElementById('save-btn');
  const statusEl = document.getElementById('status');
  btn.disabled = true;
  btn.textContent = '保存中…';
  statusEl.className = 'status';
  statusEl.textContent = '';
  try {
    const ov = {
      zh: { ...currentOverrides.zh, ...pendingZh },
      ja: { ...currentOverrides.ja, ...pendingJa },
      en: { ...currentOverrides.en, ...pendingEn },
      images: { ...currentOverrides.images },
    };
    const payload = { content: ov };
    if (Object.keys(pendingImages).length > 0) payload.images = { ...pendingImages };
    const { commitSha, images } = await api('PUT', '/content', payload);
    currentOverrides = { ...ov, images: images || ov.images };
    pendingZh = {};
    pendingJa = {};
    pendingEn = {};
    pendingImages = {};
    updateChangesBar();
    waitForDeploy(commitSha, statusEl);
  } catch (e) {
    statusEl.className = 'status err';
    statusEl.textContent = '✗ 保存失败：' + e.message;
  }
  btn.disabled = false;
  btn.textContent = '保存并发布';
};
```

- [ ] **Step 6: Commit**

```bash
git add admin/index.html
git commit -m "feat(admin): support uploading site images via in-place editor"
```

---

### Task 9: Blog 撰写面板支持正文插图

对应设计文档 §5（Blog 正文插图，方案A：插入时立即上传）。

**Files:**
- Modify: `admin/blog/index.html`

- [ ] **Step 1: HTML——工具栏加按钮 + 隐藏的文件选择框**

把：
```html
      <div class="compose-toolbar">
        <button type="button" onclick="wrapSelection('**','**')">B 加粗</button>
        <button type="button" onclick="insertLinePrefix('## ')">H 小标题</button>
        <button type="button" onclick="insertLinePrefix('- ')">• 列表</button>
      </div>
      <textarea id="compose-body-zh" class="compose-textarea" rows="14" oninput="onComposeInput()"></textarea>
```
改成：
```html
      <div class="compose-toolbar">
        <button type="button" onclick="wrapSelection('**','**')">B 加粗</button>
        <button type="button" onclick="insertLinePrefix('## ')">H 小标题</button>
        <button type="button" onclick="insertLinePrefix('- ')">• 列表</button>
        <button type="button" onclick="insertImage()">🖼 插图</button>
      </div>
      <input type="file" id="compose-inline-image-file" accept="image/*" style="display:none" onchange="handleInlineImageFile(this.files[0])">
      <textarea id="compose-body-zh" class="compose-textarea" rows="14" oninput="onComposeInput()"></textarea>
```

- [ ] **Step 2: 经典脚本——把 `handleCoverFile` 的压缩逻辑拆成共享函数，新增插图相关函数**

把：
```js
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
改成：
```js
const MAX_IMAGE_BYTES = 1_000_000;

/* ── 压缩图片：canvas 转 WebP，超限自动降质重试，保持原始宽高比不拉伸 ── */
function compressImageToWebp(file, maxBytes, callback) {
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
      while (Math.floor((dataUrl.length * 3) / 4) > maxBytes && quality > 0.4) {
        quality -= 0.15;
        dataUrl = canvas.toDataURL('image/webp', quality);
      }
      callback(dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ── 封面图：选完立即压缩预览，随发布一起提交（沿用既有行为） ── */
function handleCoverFile(file) {
  if (!file) return;
  compressImageToWebp(file, MAX_IMAGE_BYTES, (dataUrl) => {
    composeState.cover = dataUrl;
    composeState.coverChanged = true;
    const preview = document.getElementById('compose-cover-preview');
    preview.src = dataUrl;
    preview.style.display = 'block';
    scheduleDraftSave();
  });
}

/* ── 正文插图：选完立即压缩并上传（方案A），成功后把 markdown 图片语法插入光标位置 ── */
function insertImage() {
  document.getElementById('compose-inline-image-file').click();
}

function insertAtCursor(text) {
  const ta = document.getElementById('compose-body-zh');
  const { selectionStart: s, selectionEnd: e, value } = ta;
  ta.value = value.slice(0, s) + text + value.slice(e);
  ta.focus();
  onComposeInput();
}

function handleInlineImageFile(file) {
  if (!file) return;
  compressImageToWebp(file, MAX_IMAGE_BYTES, (dataUrl) => {
    window.uploadInlineImage(dataUrl);
  });
}
```

- [ ] **Step 3: 模块脚本——新增 `window.uploadInlineImage`**

在 `window.publishPost` 定义之前（`syncBlogTranslate` 之后）新增：
```js
window.uploadInlineImage = async function (dataUrl) {
  const statusEl = document.getElementById('compose-sync-status');
  statusEl.className = 'status';
  statusEl.textContent = '图片上传中…';
  try {
    const { path } = await api('POST', '/blog/image', { image: dataUrl });
    window.insertAtCursor(`![图片](/${path})`);
    statusEl.textContent = '✓ 图片已插入';
  } catch (e) {
    statusEl.className = 'status err';
    statusEl.textContent = '图片上传失败：' + e.message;
  }
};
```

（`window.insertAtCursor` 就是经典脚本里定义的 `insertAtCursor`——经典 `<script>` 顶层的函数声明会挂到 `window` 上，`type="module"` 脚本里显式用 `window.` 前缀去调用，跟这个项目里所有"模块脚本调经典脚本函数"的写法一致，不要省略这个前缀。）

- [ ] **Step 4: Commit**

```bash
git add admin/blog/index.html
git commit -m "feat(admin-blog): support inserting inline images into post body"
```

---

### Task 10: 更新 `docs/TOOLS.md`

对应项目既有约定（每个工具维护参数档案+修改记录）。

**Files:**
- Modify: `docs/TOOLS.md`（找到第 7 节"admin/"相关描述所在位置，追加本次改动）

- [ ] **Step 1: 在描述 sdf-admin Worker 路由的地方，补充两条**

在现有列出 `/content`、`/translate`、`/blog/posts`、`/blog/publish`、`/blog/unpublish` 路由的段落里，补充说明：
- `PUT /content` 现在额外接受可选的 `images: {key: dataURL}` 字段，用于上传/替换网站内容图片（团队照片等），响应体新增 `images`（本次保存后 `content.json` 里最终的图片路径表）
- 新增 `POST /blog/image`：Blog 正文插图，选图后立即上传（不等发布），返回 `{path}`

- [ ] **Step 2: 在"修改记录"里追加一条**

```markdown
### 2026-07-23：CMS 三期，图片上传通用化
- 新增 Worker 纯逻辑模块 `images.js`：大小校验（1MB 上限）、路径生成，供网站图片/Blog封面图/Blog插图三处复用
- `PUT /content` 支持上传网站图片（`data-image-key` 自动发现，本次用在团队页两个照片位）
- 新增 `POST /blog/image`：正文插图立即上传，markdown 语法直接引用
- Blog 封面图上限从 500KB 统一提到 1MB，三处图片上限保持一致
```

- [ ] **Step 3: Commit**

```bash
git add docs/TOOLS.md
git commit -m "docs: record CMS phase-3 image upload in TOOLS.md"
```

---

### Task 11: 人工验证（CI 覆盖不到，需要真实登录）

这一步不是代码改动，是上线后（`wrangler deploy` + `git push` 都需要向用户确认，见本文档开头"背景"）按顺序人工验证：

- [ ] 1. `cd workers/sdf-admin && npx wrangler deploy`（需要用户确认；Worker 代码变了必须重新部署才生效）
- [ ] 2. 把本次全部 commit `git push`（需要用户确认），等镜像同步、Cloudflare 构建上线
- [ ] 3. 打开 `https://www.senridf.com/admin/`，切到"关于我们"标签，点南雪的照片位，上传她的真实照片，点"保存并发布"，等上线后打开 `https://www.senridf.com/about/` 确认：南雪显示真实照片、謝怡然仍是 monogram、照片没有被拉伸变形
- [ ] 4. 打开 `https://www.senridf.com/admin/blog/`，写一篇测试文章，正文中间点"🖼 插图"上传一张图，确认插入的 `![图片](...)` 语法出现在光标位置；发布后打开文章页确认图片正常渲染、比例正常
- [ ] 5. 确认第 3、4 步产生的 GitHub commit 都在（`assets/images/site/team1_photo-*.webp`、`assets/images/blog/inline-*.webp`、`content.json`、对应文章 html），镜像仓库 `Eveysnow5/senridf-web` 的 `main` 与源仓库一致

---

## Spec 覆盖率自查

| 设计文档章节 | 对应任务 |
|---|---|
| §3 图片处理统一规则（1MB、保持比例、Worker二次校验、images.js模块、封面图上限统一） | Task 1、2、8 Step4（compressImageToWebp）、9 Step2 |
| §4 网站图片（标记方式/后台交互/数据流/前端渲染） | Task 5（标记）、8（后台交互+数据流）、7（前端渲染） |
| §5 Blog 正文插图（工具栏按钮/立即上传/独立commit/不清理孤儿） | Task 9（工具栏+立即上传）、Task 4（独立路由=独立commit）；不清理孤儿是"不做的事"，无需代码 |
| §6 错误处理 | Task 3/4（Worker 侧校验失败返回 400+错误信息）、Task 8/9（前端 catch 显示失败提示，不影响其他已暂存改动） |
| §7 测试 | Task 1（images.js 测试）、Task 2（封面图上限测试更新）、Task 11（人工验证清单） |
| §8 范围外 | 未新增图片库/裁剪/拖拽排序/alt多语言/孤儿清理/其他图片位——计划中确实没有对应任务，符合预期 |

placeholder/类型一致性自查：`pendingImages`、`applyImagePreview`、`compressImageToWebp`、`MAX_IMAGE_BYTES`、`siteImagePath`、`blogInlineImagePath`、`validateImageKey`、`validateImageDataUrl` 这些命名在所有任务里保持一致，没有出现前后不一致的函数名/字段名。
