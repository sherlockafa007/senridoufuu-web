# 第一期：安全网 + 清理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为纯静态站 senridoufuu-web 建立开发期质量闸门（ESLint + Prettier + node --test + 静态扫描 + CI），并清理死文件；网站部署产物与链路完全不变。

**Architecture:** 根目录新增 `package.json`（仅 devDependencies，不进部署产物）。工具只在开发机与 GitHub Actions 上运行。爬虫的纯解析逻辑拆到独立模块以便测试。CI 每次 push 跑 `npm run check`（lint + 格式检查 + 测试 + 静态扫描）。

**Tech Stack:** Node.js v24（自带 `node --test`）、ESLint 9（flat config）、Prettier 3、cheerio（测试与扫描解析 HTML）、GitHub Actions。

**上下文（实施者须知）：**
- 项目是纯静态站，无构建；部署走 `push → 自动镜像到 Eveysnow5/senridf-web → Cloudflare 构建`。**本期不碰任何部署逻辑**。
- 开发机是 Windows；命令用 Git Bash 语法可跑。CI 在 ubuntu-latest。
- 现有独立 JS 分三类模块系统：`scripts/**` 与 `tests/**` 是 CommonJS（`require`）；`functions/api/**` 是 ESM（`import/export`，Cloudflare Pages Functions）；`js/**` 是浏览器经典脚本（无 import/export，用 `document`/`window` 等全局）。ESLint 配置需分别对待。
- 爬虫解析已在真实站点验证过（见 `docs/TOOLS.md` 第 6 节 2026-06-24 条目），本期只是把它固化成测试。

---

## File Structure

**新建：**
- `package.json` — 根 manifest；devDependencies + npm scripts（lint/format/test/qa/check）。
- `eslint.config.js` — ESLint 9 flat config，按三类文件设 sourceType 与 globals。
- `.prettierignore` — 让 Prettier 只碰 JS/JSON，跳过 HTML/CSS/MD（避免大规模重排）。
- `scripts/bid-scraper/parse.js` — 从 `index.js` 抽出的**纯解析函数**（只依赖 cheerio）。
- `scripts/qa/scan.js` — 静态扫描：站内死链 + `<img>` 缺 alt。
- `tests/bid-scraper.parse.test.js` — 爬虫解析单元测试（`node --test`）。
- `tests/fixtures/suita-sample.html`、`tests/fixtures/toyonaka-sample.html` — 手写的最小确定性样本。
- `.github/workflows/ci.yml` — CI，跑 `npm run check`。

**修改：**
- `scripts/bid-scraper/index.js` — 改为 `require('./parse')`，并用 `require.main === module` 守卫 `main()`。
- `.gitignore` — 补 `docs/WORKLOG.md` 及游离文档。

**删除：**
- `netlify/`、`netlify.toml`（迁移前死文件）。
- `FINAL_VERIFICATION.md`、`docs/TASK_2_4_2_5_COMPLETION.md`（游离文档）。
- `tests/integration/summary.test.js`（依赖已删除的 `netlify/functions/summary`，测的是废弃架构）。

**本期不做（延后到第二期计划）：** i18n 三语缺键检查——它依赖第二期抽出的可导入词典模块，届时是一个精准的 `node --test` 断言；现在页面词典内联在 HTML，做不干净，故延后。

---

## Task 1: 根 package.json 与 npm scripts

**Files:**
- Create: `package.json`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "senridoufuu-web",
  "version": "1.0.0",
  "private": true,
  "description": "千里同風 官网 —— 纯静态站（开发期工具，不进部署产物）",
  "type": "commonjs",
  "scripts": {
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "node --test",
    "qa": "node scripts/qa/scan.js",
    "check": "npm run lint && npm run format:check && npm run test && npm run qa"
  },
  "devDependencies": {
    "@eslint/js": "^9.13.0",
    "cheerio": "^1.0.0",
    "eslint": "^9.13.0",
    "globals": "^15.11.0",
    "prettier": "^3.3.3"
  }
}
```

- [ ] **Step 2: 安装依赖**

Run: `npm install`
Expected: 生成 `node_modules/` 与 `package-lock.json`，无 error。

- [ ] **Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: add root package.json with dev tooling scripts"
```

（注：`node_modules/` 已被现有 `.gitignore` 忽略，不会提交。`npm run check` 此刻还不会通过——后续任务逐个补齐；这是预期的。）

---

## Task 2: 清理死文件、游离文档、废弃测试；更新 .gitignore

**Files:**
- Delete: `netlify/`, `netlify.toml`, `FINAL_VERIFICATION.md`, `docs/TASK_2_4_2_5_COMPLETION.md`, `tests/integration/summary.test.js`
- Modify: `.gitignore`

- [ ] **Step 1: 删除死文件与废弃测试**

```bash
git rm -r netlify netlify.toml FINAL_VERIFICATION.md docs/TASK_2_4_2_5_COMPLETION.md tests/integration/summary.test.js
```

Expected: git 显示这些文件被删除（staged）。

- [ ] **Step 2: 更新 .gitignore**

在 `.gitignore` 末尾追加：

```gitignore

# 本地工作交接文档（不同步到部署仓库）
docs/WORKLOG.md

# 历史游离文档（勿再提交）
FINAL_VERIFICATION.md
docs/TASK_*.md
```

- [ ] **Step 3: 确认工作区无意外残留**

Run: `git status --short`
Expected: 只看到上面这些删除（`D`）与 `.gitignore` 修改（`M`）；不应再看到 `docs/WORKLOG.md` 出现在未跟踪列表（已被忽略）。

- [ ] **Step 4: 提交**

```bash
git add .gitignore
git commit -m "chore: remove dead Netlify files, stray docs, obsolete test; ignore WORKLOG"
```

---

## Task 3: Prettier 配置（只碰 JS/JSON）

**Files:**
- Create: `.prettierignore`

- [ ] **Step 1: 创建 .prettierignore**

```gitignore
node_modules
package-lock.json
# 跳过标记语言与样式，避免大规模重排既有手工排版
**/*.html
**/*.css
**/*.md
**/*.yml
**/*.yaml
```

- [ ] **Step 2: 用 Prettier 规范化现有 JS/JSON（一次性）**

Run: `npm run format`
Expected: 打印被格式化的 `.js`/`.json` 文件列表；无 error。

- [ ] **Step 3: 确认格式检查通过**

Run: `npm run format:check`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "style: add prettier config and normalize JS/JSON formatting"
```

---

## Task 4: ESLint flat config（分三类文件）

**Files:**
- Create: `eslint.config.js`

- [ ] **Step 1: 创建 eslint.config.js**

```js
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'assets/**', 'tools/**'] },

  // 浏览器经典脚本
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'warn',
      'no-undef': 'error',
    },
  },

  // Node CommonJS：爬虫、脚本、测试
  {
    files: ['scripts/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'warn',
    },
  },

  // Cloudflare Pages Functions：ESM + Worker/浏览器全局
  {
    files: ['functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'warn',
    },
  },
];
```

- [ ] **Step 2: 运行 lint**

Run: `npm run lint`
Expected: 可能出现若干 `warning`（如未使用变量）——允许存在。**不允许有 `error`**。若出现 `no-undef` error，多半是某全局（如 Cloudflare 的 `Response`/`crypto`）未纳入——把它加进对应分组的 `globals`，例如 functions 分组加 `globals: { ...globals.browser, ...globals.node }` 已覆盖 `Response`/`fetch`/`crypto`；如仍缺，显式补 `{ Response: 'readonly', crypto: 'readonly' }`。反复运行直到 0 error。

- [ ] **Step 3: 提交**

```bash
git add eslint.config.js
git commit -m "chore: add ESLint flat config for browser/CJS/ESM sources"
```

---

## Task 5: 拆分爬虫的纯解析逻辑到 parse.js

**Files:**
- Create: `scripts/bid-scraper/parse.js`
- Modify: `scripts/bid-scraper/index.js`

- [ ] **Step 1: 创建 parse.js（把纯函数搬过来，只依赖 cheerio）**

把 `index.js` 中这些函数原样迁入 `scripts/bid-scraper/parse.js` 并导出：`parseJpDate`、`isClosed`、`detectToyonakaCategory`、`parseOsakaBids`、`parseSuitaBids`、`parseToyonakaLinks`。文件头部：

```js
const cheerio = require('cheerio');
```

文件尾部导出：

```js
module.exports = {
  parseJpDate,
  isClosed,
  detectToyonakaCategory,
  parseOsakaBids,
  parseSuitaBids,
  parseToyonakaLinks,
};
```

（这些函数的函数体保持与当前 `index.js` 中完全一致，不改逻辑。）

- [ ] **Step 2: 改 index.js —— 引用 parse.js，删除已迁走的定义，守卫 main**

在 `index.js` 顶部依赖区加入：

```js
const {
  parseJpDate,
  isClosed,
  detectToyonakaCategory,
  parseOsakaBids,
  parseSuitaBids,
  parseToyonakaLinks,
} = require('./parse');
```

删除 `index.js` 里这些函数的原定义（已移到 parse.js）。保留 `fetchToyonakaDetail`、`translate`、`writeRunReport`、`main`、`urlHash`、`sleep`、`initFirebase`、`TARGETS`。

把文件末尾的：

```js
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

改为：

```js
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 3: 语法自检**

Run: `node --check scripts/bid-scraper/parse.js && node --check scripts/bid-scraper/index.js`
Expected: 无输出（即两文件语法 OK）。

- [ ] **Step 4: 确认 lint 与格式仍通过**

Run: `npm run lint && npm run format:check`
Expected: 0 error；格式检查通过（若 parse.js 需格式化，先 `npm run format` 再提交）。

- [ ] **Step 5: 提交**

```bash
git add scripts/bid-scraper/parse.js scripts/bid-scraper/index.js
git commit -m "refactor(scraper): split pure parsing into parse.js, guard main()"
```

---

## Task 6: 爬虫解析单元测试 + 确定性样本

**Files:**
- Create: `tests/fixtures/suita-sample.html`
- Create: `tests/fixtures/toyonaka-sample.html`
- Create: `tests/bid-scraper.parse.test.js`

- [ ] **Step 1: 创建吹田样本（含一条过期、一条未来）**

`tests/fixtures/suita-sample.html`：

```html
<!doctype html>
<html><body>
<table>
  <tr><th>案件名</th><th>公告～締切</th><th>担当</th></tr>
  <tr>
    <td><a href="/sangyo/1042102/future.html">未来案件に係る一般競争入札</a></td>
    <td>2099年1月10日～2099年2月20日</td>
    <td>契約課</td>
  </tr>
  <tr>
    <td><a href="/sangyo/1042102/expired.html">過去案件に係る一般競争入札</a></td>
    <td>2020年1月10日～2020年2月20日</td>
    <td>契約課</td>
  </tr>
</table>
</body></html>
```

- [ ] **Step 2: 创建豊中样本（正文 ul.norcor + 独立页脚）**

`tests/fixtures/toyonaka-sample.html`：

```html
<!doctype html>
<html><body>
<div id="main-nosub"><div class="wysiwyg_wp">
  <ul class="norcor">
    <li><a href="/jigyosya/keiyaku/kokokutanto/real1.html">実在の業務委託に係る一般競争入札について</a></li>
    <li><a href="/jigyosya/keiyaku/kokokutanto/ended.html">終わった委託に係る一般競争入札について(終了しました)</a></li>
    <li><a href="/kosodate/kyo_iin/koukokuitaku.html">公告（委託）</a></li>
  </ul>
</div></div>
<div class="footer"><ul class="footer_link_list1">
  <li><a href="/sitemap.html">サイトマップ</a></li>
  <li><a href="/aboutweb/link.html">著作権・リンクについて</a></li>
</ul></div>
</body></html>
```

- [ ] **Step 3: 写测试**

`tests/bid-scraper.parse.test.js`：

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseJpDate,
  isClosed,
  parseSuitaBids,
  parseToyonakaLinks,
} = require('../scripts/bid-scraper/parse');

const fixture = (name) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

test('parseJpDate 支持年月日与斜杠两种格式', () => {
  const a = parseJpDate('2026年6月24日');
  assert.equal(a.getFullYear(), 2026);
  assert.equal(a.getMonth(), 5); // 0-based：6 月
  assert.equal(a.getDate(), 24);
  const b = parseJpDate('2026/6/24');
  assert.equal(b.getMonth(), 5);
  assert.equal(parseJpDate('情報未提供'), null);
});

test('isClosed：过截标日或标题含終了 判为已结束', () => {
  assert.equal(isClosed({ deadline: '2020年1月1日' }), true);
  assert.equal(isClosed({ deadline: '2099年1月1日' }), false);
  assert.equal(isClosed({ title: '……(終了しました)' }), true);
});

test('parseSuitaBids：解析年月日截标，过滤>7天过期', () => {
  const target = {
    url: 'https://www.city.suita.osaka.jp/sangyo/1017983/1017993/1042102/index.html',
    city: '吹田市',
    category: 'gyomuitaku',
    categoryLabel: '業務委託',
  };
  const bids = parseSuitaBids(fixture('suita-sample.html'), target);
  // 未来案件保留，过期(2020)被 7 天宽限过滤掉
  assert.equal(bids.length, 1);
  assert.match(bids[0].title, /未来案件/);
  assert.equal(bids[0].deadline, '2099年2月20日');
});

test('parseToyonakaLinks：只取正文招标，隔离页脚 junk 与索引页', () => {
  const target = {
    url: 'https://www.city.toyonaka.osaka.jp/jigyosya/keiyaku/kokokutanto/index.html',
    city: '豊中市',
  };
  const links = parseToyonakaLinks(fixture('toyonaka-sample.html'), target);
  const titles = links.map((l) => l.title).join(' | ');
  assert.match(titles, /実在の業務委託/);       // 真招标在
  assert.doesNotMatch(titles, /サイトマップ/);   // 页脚被隔离
  assert.doesNotMatch(titles, /著作権/);
  assert.doesNotMatch(titles, /^公告（委託）$/); // 索引页被排除
});
```

- [ ] **Step 4: 运行测试**

Run: `npm test`
Expected: 4 个测试全部 `pass`（`# pass 4`，`# fail 0`）。

- [ ] **Step 5: 确认 lint/格式通过**

Run: `npm run lint && npm run format:check`
Expected: 0 error；格式通过（必要时先 `npm run format`）。

- [ ] **Step 6: 提交**

```bash
git add tests/bid-scraper.parse.test.js tests/fixtures/
git commit -m "test(scraper): deterministic parse tests with fixtures"
```

---

## Task 7: 静态扫描脚本（死链 + 缺 alt）

**Files:**
- Create: `scripts/qa/scan.js`

- [ ] **Step 1: 写扫描脚本**

`scripts/qa/scan.js`：

```js
// 静态站质量扫描：站内死链 + <img> 缺 alt。
// 用法：node scripts/qa/scan.js  （有问题时退出码非 0）
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');

const ROOT = path.resolve(__dirname, '..', '..');
const IGNORE_DIRS = new Set(['node_modules', '.git', 'assets', 'tools', 'netlify']);

function listHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) listHtml(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith('.html')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// 只检查站内相对链接；跳过外链/锚点/mailto/js/协议相对
function isLocalLink(href) {
  if (!href) return false;
  if (/^(https?:)?\/\//.test(href)) return false;
  if (/^(#|mailto:|tel:|javascript:|data:)/.test(href)) return false;
  return true;
}

function resolveTarget(htmlFile, href) {
  let rel = href.split('#')[0].split('?')[0];
  if (!rel) return null;
  const base = rel.startsWith('/') ? ROOT : path.dirname(htmlFile);
  let target = path.resolve(base, rel.replace(/^\//, ''));
  // 目录链接 → index.html
  if (rel.endsWith('/')) target = path.join(target, 'index.html');
  return target;
}

const problems = [];

for (const file of listHtml(ROOT)) {
  const rel = path.relative(ROOT, file);
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!isLocalLink(href)) return;
    const target = resolveTarget(file, href);
    if (target && !fs.existsSync(target)) {
      problems.push(`${rel}: 死链 -> ${href}`);
    }
  });

  $('img').each((_, el) => {
    if ($(el).attr('alt') === undefined) {
      const src = $(el).attr('src') || '(无 src)';
      problems.push(`${rel}: <img> 缺 alt -> ${src}`);
    }
  });
}

if (problems.length) {
  console.error(`静态扫描发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('静态扫描通过：无死链、无缺 alt。');
```

- [ ] **Step 2: 运行扫描**

Run: `npm run qa`
Expected: 两种结果之一——
  1. `静态扫描通过：无死链、无缺 alt。`（退出 0）；或
  2. 列出真实问题。**若列出问题，逐条修复对应 HTML**（补 `alt`、改正链接），再重跑至通过。不要为了通过而放宽脚本；这些是真实缺陷。

- [ ] **Step 3: 确认 lint/格式通过**

Run: `npm run lint && npm run format:check`
Expected: 0 error；格式通过（必要时先 `npm run format`）。

- [ ] **Step 4: 提交**

```bash
git add scripts/qa/scan.js
# 如为通过扫描修了 HTML，一并加入：
git add -A
git commit -m "chore(qa): add static scan for dead links and missing alt"
```

---

## Task 8: 汇总闸门 `npm run check` 全绿

**Files:**（无新增，验证聚合）

- [ ] **Step 1: 跑完整闸门**

Run: `npm run check`
Expected: 依次跑 lint → format:check → test → qa，**全部通过、退出码 0**。若某步失败，回到对应任务修复。

- [ ] **Step 2: 无需提交**（本任务只验证）

---

## Task 9: CI 工作流

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: 写 CI**

`.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run check
```

- [ ] **Step 2: 提交并推送**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run lint, format, tests and static scan on push"
git push origin main
```

- [ ] **Step 3: 确认 CI 通过**

在 GitHub → Actions → 「CI」查看本次 push 的运行，应为绿色 success。
（注意：这次 push 也会触发既有的镜像 workflow；两者互不影响。）
Expected: CI 绿灯。若红，点开失败步骤，按日志修复后再推。

---

## 完成标准（本期验收）

- [ ] `npm run check` 本地全绿（lint + 格式 + 测试 + 扫描）。
- [ ] GitHub Actions「CI」在 push 时自动跑并绿灯。
- [ ] 爬虫解析有 4 个确定性测试护航；`node --test` 可用。
- [ ] 死文件（`netlify/`、`netlify.toml`）与游离文档（`FINAL_VERIFICATION.md`、`docs/TASK_*`）清零；`docs/WORKLOG.md` 被忽略。
- [ ] 静态扫描无死链、无缺 alt。
- [ ] 网站部署产物与链路未受影响（`functions/`、`js/`、各 HTML 的运行逻辑未改；仅新增开发期文件与爬虫内部拆分）。
