# 内容编辑器：就地编辑 + 中日英同步 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `admin/index.html` 的表单式内容编辑器，改造成"嵌入真实页面、点文字就地改、写中文一键出日英"的就地编辑器；字段从页面 `data-i18n` 属性自动发现，不再手工维护清单。

**Architecture:** 后台与被编辑页面同源（`www.senridf.com`），后台 JS 直接操作 `iframe.contentDocument`，无需 postMessage。新增 Worker 路由 `POST /translate`（批量 Qwen 中→日英），供本次编辑器与未来 Blog 复用。发布仍走已建好的 `PUT /content` + 镜像轮询链路，不改动。

**Tech Stack:** 原生 iframe + contentEditable（无框架）、Cloudflare Workers、Qwen(qwen-plus)、node --test。

**Spec:** `docs/specs/2026-07-21-inplace-editor-design.md`（取代 `2026-07-14-admin-cms-design.md` 第 6 节）

**约定：** 🧑 标记的步骤需要用户本人在浏览器/Cloudflare 面板操作，其余由执行者完成。

---

## 文件结构

```
workers/sdf-admin/src/translate.js     新增：中→日英翻译的纯逻辑（校验/建提示词/解析响应）
workers/sdf-admin/src/index.js         改：新增 POST /translate 路由
tests/admin-worker.test.mjs            改：追加 translate.js 的测试用例
css/main.css                           改：8 处多行字段类名补 white-space: pre-line
js/main.js                             改：语言初始化优先读 URL ?lang= 参数
admin/index.html                       大改：表单编辑器 → 就地编辑器（CSS/HTML/两处 script 全部重写）
docs/TOOLS.md                          改：记录新架构，标注旧表单方案已废弃
```

---

### Task 1: translate.js 纯逻辑模块（TDD）

**Files:**
- Create: `workers/sdf-admin/src/translate.js`
- Test: `tests/admin-worker.test.mjs`（在现有文件里追加，import 新模块）

- [ ] **Step 1: 追加失败测试**

在 `tests/admin-worker.test.mjs` 顶部的 import 区加一行：

```js
import {
  validateTranslateFields,
  buildTranslatePrompt,
  parseTranslateResponse,
} from '../workers/sdf-admin/src/translate.js';
```

在文件末尾追加：

```js
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

test('parseTranslateResponse 非法输入返回 null（表示翻译异常）', () => {
  assert.equal(parseTranslateResponse(''), null);
  assert.equal(parseTranslateResponse(null), null);
  assert.equal(parseTranslateResponse('抱歉我无法完成'), null);
  assert.equal(parseTranslateResponse('[1,2,3]'), null);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL（Cannot find module `../workers/sdf-admin/src/translate.js`）

- [ ] **Step 3: 实现 translate.js**

```js
// 批量中文→日英翻译的纯逻辑（校验/建提示词/解析响应）。
// 供 sdf-admin Worker 的 /translate 路由使用，未来 Blog 模块直接复用同一模块。
// 真正调用 Qwen 的网络请求在 index.js，这里不含任何 IO。

const MAX_FIELDS = 200; // 单次批量上限，防误传超大请求
const MAX_TOTAL_CHARS = 20000; // 参照 functions/api/proofread.js 的量级

export function validateTranslateFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return { ok: false, error: '没有需要翻译的字段' };
  }
  if (fields.length > MAX_FIELDS) {
    return { ok: false, error: '一次翻译的字段过多，请分批同步' };
  }
  let totalChars = 0;
  for (const f of fields) {
    if (!f || typeof f.key !== 'string' || !f.key || typeof f.zh !== 'string' || !f.zh) {
      return { ok: false, error: '字段格式错误' };
    }
    totalChars += f.zh.length;
  }
  if (totalChars > MAX_TOTAL_CHARS) {
    return { ok: false, error: '待翻译内容过长，请分批同步' };
  }
  return { ok: true };
}

export function buildTranslatePrompt(fields) {
  const list = fields.map((f) => `- ${f.key}: ${f.zh}`).join('\n');
  return `你是专业的中文-日语-英语翻译。下面是网站上若干段中文文字，每条前面是它的字段名（不要翻译字段名本身，只翻译冒号后的内容）。

请把每一条分别翻译成日语和英语，严格只输出一个 JSON 对象，不要输出任何解释或 Markdown 代码块，格式如下：
{"ja": {"字段名": "日语翻译", ...}, "en": {"字段名": "English translation", ...}}

要求：保持原文语气和信息完整，不要增删内容，不要输出与原文无关的解释；如果字段名有明显语境提示
（如包含 title 表示标题、desc/body 表示正文），据此把握合适的正式程度。

待翻译内容：
${list}`;
}

export function parseTranslateResponse(responseText) {
  if (!responseText || typeof responseText !== 'string') return null;
  let s = responseText.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  let obj;
  try {
    obj = JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const ja = obj.ja && typeof obj.ja === 'object' ? obj.ja : {};
  const en = obj.en && typeof obj.en === 'object' ? obj.en : {};
  const cleanJa = {};
  const cleanEn = {};
  for (const [k, v] of Object.entries(ja)) if (typeof v === 'string' && v) cleanJa[k] = v;
  for (const [k, v] of Object.entries(en)) if (typeof v === 'string' && v) cleanEn[k] = v;
  return { ja: cleanJa, en: cleanEn };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: 全部 PASS（原有 18 个 + 新增 10 个 = 28 个）

- [ ] **Step 5: Commit**

```bash
git add workers/sdf-admin/src/translate.js tests/admin-worker.test.mjs
git commit -m "feat(admin-worker): add zh-to-ja/en translation module with tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Worker 新增 POST /translate 路由

**Files:**
- Modify: `workers/sdf-admin/src/index.js`

- [ ] **Step 1: 加 import**

```js
import { validateTranslateFields, buildTranslatePrompt, parseTranslateResponse } from './translate.js';
```
加在现有 `import { getFile, putFile } from './github.js';` 下一行。

- [ ] **Step 2: CORS 允许的方法加上 POST**

把：
```js
          'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
```
改成：
```js
          'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
```

- [ ] **Step 3: 加路由处理**

在现有 `if (url.pathname === '/content' && request.method === 'PUT') { ... }` 这个 if 块**之后**、
`} catch (e) {` **之前**插入：

```js
      if (url.pathname === '/translate' && request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: '请求格式错误' }, cors);
        }
        const check = validateTranslateFields(body.fields);
        if (!check.ok) return json(400, { error: check.error }, cors);

        const qwenRes = await fetch(
          'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.QWEN_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'qwen-plus',
              messages: [{ role: 'user', content: buildTranslatePrompt(body.fields) }],
              max_tokens: 4000,
            }),
          },
        );
        if (!qwenRes.ok) return json(502, { error: '翻译服务暂时不可用，请稍后重试' }, cors);
        const data = await qwenRes.json();
        const parsed = parseTranslateResponse(data.choices?.[0]?.message?.content || '');
        if (!parsed) return json(502, { error: '翻译服务返回格式异常，可重试' }, cors);
        return json(200, parsed, cors);
      }
```

- [ ] **Step 4: 静态检查**

Run: `npm run check`
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add workers/sdf-admin/src/index.js
git commit -m "feat(admin-worker): add POST /translate route (batched zh-to-ja/en via Qwen)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 修复多行字段换行显示 bug

**Files:**
- Modify: `css/main.css`（8 处）

对以下 8 个选择器，各在其规则块内加一行 `white-space: pre-line;`（放在 `color: var(--c-text-2);` 后面，
不影响其它属性顺序）：

- [ ] **Step 1: `.hero__tagline`**

```css
.hero__tagline {
  font-family: var(--f-serif);
  font-size: clamp(0.875rem, 1.8vw, 1.0625rem);
  font-weight: 300;
  line-height: 2.1;
  letter-spacing: 0.1em;
  color: var(--c-text-2);
  white-space: pre-line;
  max-width: 580px;
  opacity: 0;
  animation: fadeUp 1000ms var(--ease-out) 1.4s forwards;
}
```

- [ ] **Step 2: `.section__body`**

```css
.section__body {
  font-family: var(--f-sans);
  font-size: 1rem;
  font-weight: 300;
  line-height: 2;
  letter-spacing: 0.03em;
  color: var(--c-text-2);
  white-space: pre-line;
  max-width: 540px;
}
```

- [ ] **Step 3: `.section__lead`**

```css
.section__lead {
  font-family: var(--f-sans);
  font-size: 1.0625rem;
  font-weight: 300;
  line-height: 2;
  letter-spacing: 0.03em;
  color: var(--c-text-2);
  white-space: pre-line;
  max-width: 680px;
  margin-bottom: 64px;
}
```

- [ ] **Step 4: `.value-card__desc`**

```css
.value-card__desc {
  font-family: var(--f-sans);
  font-size: 0.9375rem;
  font-weight: 300;
  line-height: 1.95;
  letter-spacing: 0.02em;
  color: var(--c-text-2);
  white-space: pre-line;
}
```

- [ ] **Step 5: `.team-member__bio`**

```css
.team-member__bio {
  font-family: var(--f-sans);
  font-size: 0.9375rem;
  font-weight: 300;
  line-height: 2;
  letter-spacing: 0.02em;
  color: var(--c-text-2);
  white-space: pre-line;
}
```

- [ ] **Step 6: `.timeline__desc`**

```css
.timeline__desc {
  font-family: var(--f-sans);
  font-size: 0.9375rem;
  font-weight: 300;
  line-height: 2;
  color: var(--c-text-2);
  white-space: pre-line;
  max-width: 560px;
}
```

- [ ] **Step 7: `.product-card__desc`**

```css
.product-card__desc {
  font-family: var(--f-sans);
  font-size: 0.9375rem;
  font-weight: 300;
  line-height: 1.9;
  color: var(--c-text-2);
  white-space: pre-line;
}
```

- [ ] **Step 8: `.footer__tagline`**

```css
.footer__tagline {
  font-family: var(--f-serif);
  font-size: 0.875rem;
  font-weight: 300;
  line-height: 1.9;
  letter-spacing: 0.06em;
  color: var(--c-text-2);
  white-space: pre-line;
  max-width: 300px;
}
```

- [ ] **Step 9: 静态检查 + 视觉抽查**

Run: `npm run check`
Expected: 全绿（CSS 不进 lint/test，但 qa 扫描器仍会跑，应无影响）

用浏览器打开 `index.html`（本地静态服务器）确认首页视觉无变化（未改内容前，`white-space: pre-line`
对不含换行符的原文没有任何可见影响，只在未来出现 `\n` 时生效）。

- [ ] **Step 10: Commit**

```bash
git add css/main.css
git commit -m "fix(css): preserve line breaks in multiline i18n text fields

Content with embedded newlines (e.g. multi-paragraph mission/vision body)
was silently collapsed to one line on the live site — no white-space rule
existed to preserve them. Prerequisite for the in-place editor's WYSIWYG
guarantee.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: main.js 语言初始化支持 `?lang=` 覆盖

**Files:**
- Modify: `js/main.js:662`

- [ ] **Step 1: 改语言初始化逻辑**

把：
```js
let currentLang = localStorage.getItem('sdf_lang') || 'ja';
```
改成：
```js
// 后台就地编辑器用 ?lang= 强制页面语言（不写 localStorage，不影响站长本人正常浏览的语言偏好）
const LANG_PARAM = new URLSearchParams(location.search).get('lang');
const VALID_LANGS = ['ja', 'zh', 'en'];
let currentLang =
  (VALID_LANGS.includes(LANG_PARAM) && LANG_PARAM) || localStorage.getItem('sdf_lang') || 'ja';
```

- [ ] **Step 2: 静态检查**

Run: `npm run check`
Expected: 全绿

- [ ] **Step 3: 手动验证**（本地静态服务器）

打开 `index.html?lang=zh`，确认页面直接以中文渲染，且**不影响**去掉参数后正常访问时的语言记忆
（先用 `?lang=en` 访问一次，再去掉参数访问，语言应保持你在没有参数时上一次手动切换的选择，
不应被 `?lang=en` 污染）。

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "feat(i18n): support ?lang= URL param to force page language

Used by the admin in-place editor to force Chinese in the preview iframe
without touching the visitor's own localStorage language preference.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: admin/index.html 改造为就地编辑器

**Files:**
- Modify: `admin/index.html`（CSS、body、两处 `<script>` 全部替换）

这是一次性改动（改到一半页面会不可用），全部步骤做完后**统一测试、统一提交**。

- [ ] **Step 1: 删除旧的 tab/section/field/图片 相关 CSS**

删除以下几段（在 `<style>` 内，`.top-bar__nav-link:hover` 规则之后到 `.empty` 规则为止的整段）：
`.tab-bar`、`.tab-btn`、`.tab-btn.active`、`.tab-btn:hover:not(.active)`、`.content-area`、`.tab-pane`、
`.tab-pane.active`、`.section-block`、`.section-hd` 及其子规则、`.field-row` 及其子规则、
`.img-field` 及其子规则、`.empty`。

即把原文件第 75–134 行（从 `/* ── Tabs ── */` 到 `.empty { text-align: center; padding: 48px 0; color: var(--text3); font-size: 14px; }`）整段删掉。

- [ ] **Step 2: 加入新 CSS**

在删除位置（`.btn-link:hover { color: var(--red); }` 之后、`</style>` 之前）插入：

```css
    /* ── Page switcher ── */
    .page-bar {
      display: flex; gap: 0; border-bottom: 1px solid var(--border);
      padding: 0 24px; background: var(--paper);
    }
    .page-btn {
      padding: 12px 18px; font-size: 13px; font-family: inherit; background: none; border: none;
      border-bottom: 2px solid transparent; cursor: pointer; color: var(--text3);
      transition: color .15s, border-color .15s;
    }
    .page-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
    .page-btn:hover:not(.active) { color: var(--text2); }

    /* ── Pending changes bar ── */
    .changes-bar {
      display: flex; align-items: center; gap: 14px;
      padding: 10px 24px; background: #eef2ff; border-bottom: 1px solid var(--border);
      font-size: 13px; color: var(--text2);
    }
    .btn-sync {
      padding: 6px 14px; background: var(--accent); color: #fff; border: none;
      border-radius: 7px; font-size: 12px; font-family: inherit; cursor: pointer;
      transition: opacity .15s;
    }
    .btn-sync:hover { opacity: .88; }
    .btn-sync:disabled { opacity: .5; cursor: default; }

    /* ── Preview iframe ── */
    #preview-frame {
      width: 100%; height: calc(100vh - 101px); border: none; display: block; background: #fff;
    }
```

- [ ] **Step 3: 替换 body（tab-bar + content-area → page-bar + changes-bar + iframe）**

把：
```html
  <div class="tab-bar">
    <button type="button" class="tab-btn active" onclick="setTab('zh')">中文</button>
    <button type="button" class="tab-btn" onclick="setTab('ja')">日本語</button>
    <button type="button" class="tab-btn" onclick="setTab('en')">English</button>
    <button type="button" class="tab-btn" onclick="setTab('images')">图片</button>
  </div>

  <div class="content-area">
    <div id="pane-zh" class="tab-pane active"></div>
    <div id="pane-ja" class="tab-pane"></div>
    <div id="pane-en" class="tab-pane"></div>
    <div id="pane-images" class="tab-pane"></div>
  </div>
</div>
```
改成：
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

- [ ] **Step 4: 替换第一个 `<script>`（classic，非 module）**

把从 `<script>\nconst SECTIONS = [` 到 `</script>`（紧接 `<script type="module">` 之前的那个）
整段替换为：

```html
<script>
/* ── 可编辑页面清单：字段本身不再手工维护，改由 data-i18n 属性自动发现 ── */
const PAGES = {
  home:       { label: '首页',     url: '/' },
  about:      { label: '关于我们', url: '/about/' },
  milestones: { label: '大事记',   url: '/about/milestones.html' },
  solutions:  { label: '解决方案', url: '/solutions/' },
};

let currentOverrides = {}; // 已发布的基线（GET /content 结果），module script 的 loadContent/save 读写
let pendingZh = {};
let pendingJa = {};
let pendingEn = {};
let editingEl = null;
let editingOriginal = '';

const FRAME_STYLE = `
  [data-i18n]:hover { outline: 1px dashed #2563eb; outline-offset: 2px; cursor: text; }
  [data-i18n][contenteditable="true"] { outline: 2px solid #2563eb; outline-offset: 2px; cursor: text; background: #eef2ff; }
  .cms-pill {
    position: absolute; z-index: 999999; display: flex; gap: 6px;
    background: #1f1c17; border-radius: 8px; padding: 5px 7px; box-shadow: 0 4px 14px rgba(0,0,0,.25);
  }
  .cms-pill button {
    border: none; border-radius: 5px; font-size: 12px; font-family: system-ui, sans-serif;
    padding: 4px 9px; cursor: pointer;
  }
  .cms-pill .cms-ok { background: #10b981; color: #fff; }
  .cms-pill .cms-cancel { background: #4b5563; color: #fff; }
`;

function updateChangesBar() {
  const count = Object.keys(pendingZh).length;
  const bar = document.getElementById('changes-bar');
  bar.hidden = count === 0;
  document.getElementById('changes-count').textContent = `已改 ${count} 处`;
}

/* ── 页面切换 ── */
function switchPage(key) {
  document.querySelectorAll('.page-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === key);
  });
  const frame = document.getElementById('preview-frame');
  frame.onload = () => initEditableFrame(frame);
  frame.src = PAGES[key].url + '?lang=zh';
}

/* ── 让 iframe 里的 [data-i18n] 元素可点击就地编辑（同源，直接操作 contentDocument） ── */
function initEditableFrame(frame) {
  const doc = frame.contentDocument;
  if (!doc) return;

  const style = doc.createElement('style');
  style.textContent = FRAME_STYLE;
  doc.head.appendChild(style);

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

/* ── 开始编辑一个字段 ── */
function startEdit(doc, el) {
  if (editingEl && editingEl !== el) finishEdit(true); // 切到新字段前，先确认上一个

  editingEl = el;
  editingOriginal = el.textContent;
  el.contentEditable = 'true';
  el.focus();

  el.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || doc.defaultView.clipboardData).getData('text/plain');
    doc.execCommand('insertText', false, text);
  });

  const range = doc.createRange();
  range.selectNodeContents(el);
  const sel = doc.defaultView.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const pill = doc.createElement('div');
  pill.className = 'cms-pill';
  pill.id = 'cms-active-pill';
  pill.innerHTML =
    '<button type="button" class="cms-ok">✓ 完成</button><button type="button" class="cms-cancel">✕ 取消</button>';
  doc.body.appendChild(pill);
  const rect = el.getBoundingClientRect();
  pill.style.top = `${Math.max(0, rect.top - 40)}px`;
  pill.style.left = `${rect.left}px`;
  pill.querySelector('.cms-ok').onclick = (e) => {
    e.preventDefault();
    finishEdit(true);
  };
  pill.querySelector('.cms-cancel').onclick = (e) => {
    e.preventDefault();
    finishEdit(false);
  };
}

/* ── 结束编辑：commit=true 确认保留，false 撤销还原 ── */
function finishEdit(commit) {
  if (!editingEl) return;
  const doc = editingEl.ownerDocument;
  const key = editingEl.dataset.i18n;

  if (commit) {
    const newVal = editingEl.innerText.trim();
    if (newVal && newVal !== editingOriginal.trim()) {
      pendingZh[key] = newVal;
      updateChangesBar();
    }
  } else {
    editingEl.textContent = editingOriginal;
  }

  editingEl.contentEditable = 'false';
  const pill = doc.getElementById('cms-active-pill');
  if (pill) pill.remove();
  editingEl = null;
}
</script>
```

- [ ] **Step 5: 替换第二个 `<script type="module">`**

在其中做三处改动（保留 import、`api()`、`waitForDeploy()`、`window.fbLogout`、`onAuthStateChanged`、
`window.fbLogin` 不变）：

把：
```js
async function loadContent() {
  const { content } = await api('GET', '/content');
  currentOverrides = content || {};
  buildEditor();
  document.getElementById('editor').style.display = 'block';
}
```
改成：
```js
async function loadContent() {
  const { content } = await api('GET', '/content');
  currentOverrides = content || {};
  document.getElementById('editor').style.display = 'block';
  switchPage('home');
}
```

把：
```js
window.save = async function() {
  const btn = document.getElementById('save-btn');
  const statusEl = document.getElementById('status');
  btn.disabled = true; btn.textContent = '保存中…';
  statusEl.className = 'status'; statusEl.textContent = '';
  try {
    const ov = collectOverrides();
    const { commitSha } = await api('PUT', '/content', { content: ov });
    currentOverrides = ov;
    waitForDeploy(commitSha, statusEl);
  } catch(e) {
    statusEl.className = 'status err'; statusEl.textContent = '✗ 保存失败：' + e.message;
  }
  btn.disabled = false; btn.textContent = '保存并发布';
};
```
改成：
```js
window.save = async function () {
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

window.syncTranslate = async function () {
  const fields = Object.entries(pendingZh).map(([key, zh]) => ({ key, zh }));
  if (fields.length === 0) return;
  const btn = document.getElementById('sync-btn');
  btn.disabled = true;
  btn.textContent = '同步中…';
  try {
    const result = await api('POST', '/translate', { fields });
    Object.assign(pendingJa, result.ja || {});
    Object.assign(pendingEn, result.en || {});
    const synced = Object.keys(result.ja || {}).length;
    btn.textContent =
      synced >= fields.length ? '✓ 已同步日英' : `已同步 ${synced}/${fields.length} 处，可重试补齐`;
  } catch (e) {
    btn.textContent = '同步失败，点击重试';
  }
  btn.disabled = false;
};
```

- [ ] **Step 6: 静态检查**

Run: `npm run check`
Expected: 全绿（admin/index.html 的内联 script 不进 ESLint 覆盖范围，`qa` 死链扫描器仍会检查页面内的
`href`——本次改动没有新增 `href`，应无影响）

- [ ] **Step 7: Commit**

```bash
git add admin/index.html
git commit -m "feat(admin): replace form-based content editor with in-place visual editor

Embeds the real site pages (same-origin iframe), auto-discovers editable
fields from data-i18n attributes instead of a hand-maintained field list
(fixes fields that existed on pages but were never in the old form), and
adds a batch zh-to-ja/en sync button before publish. Removes the dead
'图片' tab that never actually wrote to any rendered <img>.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 🧑 加 QWEN_API_KEY 密钥 + 部署 Worker

前置：Task 1、2 已完成（/translate 路由代码已写好）。

- [ ] **Step 1: 🧑 在 Cloudflare 面板加密钥**

引导用户：dash.cloudflare.com → **Workers & Pages** → **sdf-admin** → **Settings** →
**Variables and Secrets** → **Add** → Type 选 **Secret** → Name 填 **`QWEN_API_KEY`** →
Value 粘贴你现有的通义千问密钥（和网站其它 AI 工具用的是同一个，不是新申请）→ **Deploy**。

- [ ] **Step 2: 部署最新 Worker 代码**（执行者操作，本机已有 wrangler 登录态）

Run: `cd workers/sdf-admin && npx wrangler deploy`
Expected: 输出显示部署成功，Worker 地址仍是 `https://sdf-admin.sherlockafa.workers.dev`

- [ ] **Step 3: 冒烟测试 /translate 鉴权**

Run: `curl -s https://sdf-admin.sherlockafa.workers.dev/translate -X POST`
Expected: `{"error":"未登录"}`（401，说明新路由已生效且鉴权闸门在工作）

---

### Task 7: 🧑 本地浏览器验证全流程

前置：Task 1–6 全部完成。CI 测不了浏览器 DOM 交互，此步骤必须人工过一遍。

- [ ] **Step 1: 起本地静态服务器**（覆盖整个仓库根目录，保证 admin 和四个页面同源）

Run: `npx serve "c:\Users\sherl\Desktop\Claude Code\senridoufuu-web" -l 3000`

- [ ] **Step 2: 🧑 走一遍编辑流程**

1. 打开 `http://localhost:3000/admin/` → 登录 → 默认显示"首页"标签，下方 iframe 显示中文版首页
2. 鼠标移到"主标语"文字上 → 出现虚线框
3. 点击切到"关于我们" → iframe 换成关于我们页；再点回"首页" → 确认还是首页（标签切换正确）
4. 点"主标语" → 文字变可编辑，出现浮动「✓ 完成」「✕ 取消」→ 改几个字 → 点「✓ 完成」→
   顶部出现"已改 1 处"
5. 点"大事记"标签 → 编辑一条里程碑描述里带多行的文字（换行输入）→ 完成
6. 点「✨ 一键同步日英」→ 等待 → 按钮变"✓ 已同步日英"（若失败会提示"同步失败，点击重试"，
   可重新点击）
7. 点「保存并发布」→ 状态显示"同步部署中…"，2-3 分钟后变"已上线"
8. 刷新真实页面（去掉 `?lang=` 参数，正常访问）→ 确认中文改动生效，且多行文字换行正确显示
9. 切到日文/英文版（导航栏语言切换）→ 确认对应文字也已更新（非机翻痕迹明显的话可回后台微调后
   重新发布）
10. 点"✕ 取消"验证：编辑一个字段后点取消，确认文字还原、不计入"已改"计数

- [ ] **Step 3: 验证不会误跳转**

在 iframe 内点击导航栏的"关于我们"链接（非 data-i18n 编辑目标，是普通导航点击）→ 确认**不会**
真的跳转（因为 `e.preventDefault()` 对所有点击生效），只有点 data-i18n 文字才进入编辑态。

---

### Task 8: 推上线 + 文档

- [ ] **Step 1: push**

Run: `git push`
Expected: 触发自动镜像；curl 对比两仓库 HEAD 确认镜像完成。

- [ ] **Step 2: 🧑 线上复验**

打开 `https://www.senridf.com/admin/` → 走一遍 Task 7 的核心流程（改一个字段→发布→确认生效），
正式域名下的 CORS/iframe 同源行为需单独验一次。

- [ ] **Step 3: 更新 docs/TOOLS.md**

在"管理后台（内容编辑）"条目里，把架构描述从"表单编辑器"改为"就地可视化编辑器"，补充：
`/translate` 路由与 `QWEN_API_KEY` 密钥（sdf-admin Worker 侧，区别于网站主环境变量）、
字段自动发现机制（不再需要手工登记新字段）。

- [ ] **Step 4: Commit + push**

```bash
git add docs/TOOLS.md
git commit -m "docs: record in-place editor architecture in TOOLS.md

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## 自查记录（写计划时已核）

- spec §4.1（字段自动发现）→ Task 5 Step 4 的 `initEditableFrame`（遍历 `[data-i18n]`，不依赖任何清单）。
- spec §4.2（编辑交互：悬浮/点击/contenteditable/粘贴纯文本/浮动工具条/批量待发布）→ Task 5 Step 4
  的 `startEdit`/`finishEdit`/`updateChangesBar`。
- spec §4.3（语言强制，不污染 localStorage）→ Task 4。
- spec §4.4（翻译公用组件，批量、部分失败不阻塞）→ Task 1（纯逻辑）+ Task 2（路由）+ Task 5
  的 `syncTranslate`（`synced >= fields.length` 判断部分成功）。
- spec §4.5（换行修复）→ Task 3。
- spec §5（移除死图片标签页）→ Task 5 Step 1/3（CSS 与 HTML 中的图片相关代码整段删除）。
- spec §6（纯逻辑测试 + DOM 交互人工验证）→ Task 1 的 node --test；Task 7 的人工走查。
- spec 待发布变更表仅内存不持久化 → Task 5 未引入任何 localStorage/Firestore 草稿存储，符合。
- 类型一致性：`validateTranslateFields`/`buildTranslatePrompt`/`parseTranslateResponse` 的输入输出
  在 Task 1（定义）、Task 2（Worker 调用）、Task 5（前端调用 `/translate` 期望 `{ja,en}`）三处一致。
- 未发现遗漏的 spec 要求。
