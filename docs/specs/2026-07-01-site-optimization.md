# 网站整体优化方案（senridoufuu-web）

> 设计文档 · 2026-07-01
> 目标读者：非专业维护者（可理解性优先）+ 后续实施者（AI/人）
> 状态：已与业主确认设计方向，待写实施计划

---

## 1. 背景与现状体检

senridoufuu-web 是千里同風株式会社官网，纯静态站（HTML+CSS+JS，无构建），部署在 Cloudflare Pages（Pages Functions 提供 `/api/*` 后端），域名 senridf.com。网站已能运行，但从"能跑"到"规范、可维护、有流程"还有差距。

**实地体检结论（均为实测）：**

已经做对的（地基不差）：
- 后端 `/api/*` 有 Firebase ID token 鉴权中间件、Deepgram 临时凭证、限流器（`functions/api/_lib/rateLimiter.js`）
- i18n 三语机制在运行；文档习惯（TOOLS.md / WORKLOG.md / CLAUDE.md）；自动部署链路已打通（push → 镜像 → Cloudflare 构建）

结构性问题（按危害排序）：

| 问题 | 实测 | 后果 |
|---|---|---|
| 配置/逻辑到处复制 | Firebase 配置硬编码在 **9** 个 HTML；`ADMINS` 名单复制 **8** 处；i18n `T` 词典各页各写共 **9** 份；登录门控逻辑重复 **9** 处 | 改一处漏一处，是"注册空白页""日文页残留中文""门控不一致"的根源；同一个 `display:''` 坑短期内犯过两次 |
| 缺自动化质量闸门 | 根目录无 `package.json`、无 ESLint/Prettier；CI 仅有爬虫+镜像两个 workflow；`tests/` 仅 1 个测试且无 runner、跑不起来 | 所有 bug 只能靠肉眼+线上发现，无"push 前自动拦一道"——即"loop 未成型" |
| 迁移遗留死文件 | `netlify/`、`netlify.toml` 仍在（实际早用 Cloudflare） | 误导后来人与 AI |
| 仓库游离文档 | `FINAL_VERIFICATION.md`、`docs/TASK_*`、`docs/plans|specs` 旧文件未纳管，`.gitignore` 未覆盖 | 仓库变脏、易误提交 |

**性能与成本隐患（追加体检，已定位）：**
- **性能（流畅）**：`bids` / `solutions/demo/admin` / `japanese_learner` / `proofreader` 共 4 页用 **Tailwind CDN 运行时编译器**（浏览器即时编译 CSS，官方明确不建议生产），拖慢首屏。
- **成本 + 稳定**：`js/tracking.js` 每次访问 `addDoc` 写一条 `visits`，**只增不减、无限膨胀**；管理后台每次又读 500 条。Firestore 按读写计费，长期是成本与变慢的来源。

---

## 2. 目标 / 非目标

**目标（对应业主关注的六个维度）：**
1. **安全**：不易被外部攻击——Firestore 规则最小化、`/api` 入参校验、安全响应头、无密钥入仓、Firebase App Check 防盗刷。
2. **稳定**：不轻易崩溃——CI/lint/测试防回归、前端错误边界（单个 JS 错误不致整页白屏）、`/api` 超时与异常兜底。
3. **流畅**：加载快不卡——替换 Tailwind CDN 运行时编译器、Firebase SDK 按需加载、字体/图片优化。
4. **友好**：界面清晰一致——i18n 三语一致、错误提示统一、无障碍、移动端自适应。
5. **成本可控**：见下方"成本控制原则"。
6. **可维护**：消除重复（配置/i18n/门控/管理员名单收敛为单一事实来源）+ 质量闸门（loop）+ 仓库干净。

全程渐进、可独立验收，非专业者能看懂每一步。

> **成本控制原则（业主定调）：功能优先于省钱。** 中日翻译、数据分析两个工具**上下文长、对延迟敏感**，必须优先保证可用（足够的上下文长度 + 及时响应），**不得为省钱削减其 context 或收紧超时导致不可用**。成本控制集中在**不损害这两个核心工具体验**的地方：防盗刷/限流、`visits` 集合膨胀与读取量、结果缓存、以及非核心工具（如日语学习、校对）的参数优化。

**非目标（YAGNI）：**
- 不引入打包器/编译步骤（保持零构建、纯静态直接部署）。
- 不做全量单元测试（只测三处最关键逻辑）。
- 不做与优化无关的功能重写或视觉改版。

---

## 3. 约束

- **零构建**：网站产物仍是纯静态 HTML/JS，Cloudflare 直接部署；所有工具（ESLint/测试/CI）只在开发与 GitHub 上运行，**不改变部署产物、不改变部署链路**。
- **原生 ES 模块**做代码共享（浏览器直接支持，无需打包）。
- **渐进迁移**：一次只改一个页面，新旧可共存，每步独立可验收、可回滚。
- **可理解性优先**：命名清晰、注释到位、每个共享模块职责单一。

---

## 4. 目标架构（去重后）

新增共享模块目录，全站引用同一份：

```
js/shared/
  firebase-init.js   唯一一份 Firebase 配置 + 初始化，导出 { app, auth, db }
  admins.js          唯一一份管理员邮箱名单，导出 { ADMINS, isAdmin(user) }
  auth-gate.js       唯一一份登录门控：未登录 / 待审核(pending) / 停用(disabled) /
                     已通过(approved) / 管理员 的判定与回调
  i18n.js            唯一一份 i18n 引擎：applyLang / 语言切换 / sdf_lang 读写；
                     各页只传入自己的三语文案表
```

页面从"复制 60 行初始化+门控"变为：
```js
import { auth, db } from '/js/shared/firebase-init.js';
import { mountAuthGate } from '/js/shared/auth-gate.js';
import { initI18n } from '/js/shared/i18n.js';
```

**模块边界（每个都能独立理解/测试）：**
- `firebase-init.js`：输入无，输出已初始化的 app/auth/db。改配置只改这里。
- `admins.js`：输入 user，输出是否管理员。加减管理员只改这里。
- `auth-gate.js`：输入 auth 实例 + 各状态回调（onApproved/onPending/onDisabled/onGuest/onAdmin），负责监听登录态并分发。页面只写"各状态下显示什么"。
- `i18n.js`：输入三语文案表 + 语言按钮选择器，负责应用文案、占位符、动态消息重译、切换与持久化。

**迁移策略**：9 个页面（account / bids / admin/index / solutions/demo/{admin,analysis,japanese_learner,lifestory,proofreader,translation}）**逐个**迁移，每迁一个跑 `npm run check` + 线上验证，再迁下一个。

---

## 5. 三期路线图

### 第一期：安全网 + 清理（低风险，优先）

目的：先把机器兜底与干净地基建好，后续重构才有保障。

交付物：
- 根目录 `package.json`（仅 devDependencies：ESLint、Prettier；测试用 Node 自带 `node --test`，零额外框架）。
- ESLint + Prettier 配置，覆盖 `js/`、`functions/`、`scripts/` 的独立 JS 文件。
- `npm run check` 脚本：一键跑 lint + 测试 + 静态扫描。
- 静态扫描脚本 `scripts/qa/scan.js`（Node，覆盖 HTML，弥补 ESLint 管不到内嵌 JS）：
  - 站内死链（href 指向不存在的本地文件）
  - `<img>` 缺 `alt`
  - 该翻译却硬编码的中文（在应走 i18n 的位置出现 CJK 文本）
  - i18n 三语缺键（某 `data-i18n` 键在 ja/zh/en 之一缺失）
- CI 工作流 `.github/workflows/ci.yml`：`on: push`/`pull_request` 跑 `npm run check`，失败标红。
- 清理：删除 `netlify/` 与 `netlify.toml`；移除游离文档 `FINAL_VERIFICATION.md`、`docs/TASK_*`；`.gitignore` 补 `WORKLOG.md` 及游离文档模式。
- 修复 `tests/integration/summary.test.js` 使其可运行并纳入 CI（或按现状调整为可跑）。

验收：CI 首次绿灯；`npm run check` 本地可跑；死文件与游离文档清零。

### 第二期：去重重构（中风险，已有 CI 兜底）

交付物：
- 实现 `js/shared/` 四件套（firebase-init / admins / auth-gate / i18n）。
- 9 个页面逐个迁移到共享模块；每个迁移为独立提交，逐个 `npm run check` + 线上验证。

验收：Firebase 配置 9→1、ADMINS 8→1、i18n 词典按页拆分但引擎单一；静态扫描无"残留中文/缺 i18n 键"。

### 第三期：安全 · 稳定 · 流畅 · 成本 · 友好（可与二期并行）

交付物：
- 安全：Firestore 规则复审（visits/users/bids/meta 权限最小化）；`/api` 各函数入参校验（类型/长度/必填）；Cloudflare `_headers` 安全响应头（CSP、X-Content-Type-Options、Referrer-Policy 等）；确认无密钥进仓库；接入 Firebase App Check 防 API 盗刷（同时护成本）。
- 稳定：前端错误边界——每页脚本包 try/catch 或分区隔离，单个 JS 错误不致整页白屏（如"注册空白"类）；`/api` 统一超时与异常兜底，返回友好错误；Firestore 读失败降级提示。
- 流畅：4 页的 Tailwind CDN 运行时编译器换成预生成静态 CSS（一次性用 Tailwind CLI 生成并提交成品，部署仍零构建；或手写所需样式）；Firebase SDK 按需加载、只引用用到的模块；Google Fonts 字体精简/子集；较大图片压缩。
- 成本：`visits` 集合治理——写入端节流/去重、设保留上限或定期归档；管理后台读取从一次 500 降为分页或服务端聚合；Qwen/Deepgram 在既有限流上加简单用量观测。严守"功能优先"原则：翻译/数据分析的 context 与响应不缩水。
- 友好：错误提示文案统一（复用 i18n）；无障碍（JS 生成的按钮/输入补 title/alt）；各页移动端自适应过一遍。

验收：安全响应头生效（curl 可见）；`/api` 对畸形入参有防御；单页 JS 报错不再整页白屏；4 页不再依赖 Tailwind 运行时编译器、首屏更快；`visits` 增长可控、admin 读取量下降；各页移动端无溢出；翻译/数据分析功能与响应不受成本改动影响。

---

## 6. 精准测试策略（node --test，零依赖）

只测最容易错、最关键的三处：
1. **爬虫解析**：用存好的样本 HTML（吹田/豊中）为 fixture，测 `parseSuitaBids` / `parseToyonakaLinks` / `parseJpDate` / `isClosed`——覆盖日期格式、过期过滤、页脚 junk 隔离、已结束识别。
2. **鉴权 token 校验**：`verifyFirebaseToken` 的 aud/iss/exp 判定与拒绝路径（mock JWK/token）。
3. **i18n 完整性**：断言每个 `data-i18n` / `data-i18n-ph` 键在 ja/zh/en 三语词典都存在（防"某语言漏翻"）。

测试文件放 `tests/`，由 `node --test` 统一运行，纳入 `npm run check` 与 CI。

---

## 7. 质量闸门 / Loop

`npm run check` = ESLint + Prettier(--check) + `node --test` + `scripts/qa/scan.js`。

日常闭环：
```
改动 → 本地 npm run check（lint + 测试 + 静态扫描）
     → push 前用中文讲清每处风险（pre-push-review）
     → push（自动镜像 → Cloudflare 构建，已通）
     → 线上验证 → 收工写 WORKLOG
              ↑ GitHub CI 在 push 时再跑一遍同样的 check 兜底
```

价值：`注册空白`、`残留中文`、`爬虫解析错`、`i18n 漏翻` 这类问题在 push 时被机器拦下，不依赖人记忆、不必等线上截图复现。

注意：当前工作流是直接 push 到 main（无 PR 门禁），故 CI 是"push 后立即跑并标红/失败通知"，配合 push 前的本地 check 形成双保险；未来若改用 PR，可将 CI 设为合并前必过。

---

## 8. 成功标准（验收清单）

- [ ] Firebase 配置、ADMINS 名单、i18n 引擎、登录门控各只剩 1 份来源。
- [ ] `npm run check` 本地可跑；CI 在每次 push 自动跑并可标红。
- [ ] 至少一类历史 bug（如 `display:''`、残留中文、i18n 缺键）能被某项 check 主动抓到。
- [ ] 死文件（netlify）与游离文档清零，`.gitignore` 覆盖到位。
- [ ] 三处关键逻辑（爬虫解析 / token 校验 / i18n 完整性）有测试护航。
- [ ] 安全响应头生效、`/api` 有入参校验、Firestore 规则最小化。
- [ ] 各页移动端自适应、无障碍无明显缺失。

---

## 9. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 去重重构改崩现有页面 | 第一期先建 CI 兜底；第二期逐页迁移、每页独立提交与验收、可回滚 |
| 静态扫描误报（如正文本就该有中文） | 扫描脚本按"应走 i18n 的位置"限定范围（如带 data-i18n 的元素、JS 里的用户可见字符串），并支持白名单注释 |
| 非专业者看不懂改动 | 每次 push 前用中文讲清风险；spec/TOOLS/WORKLOG 同步维护 |
| 引入工具反而增加复杂度 | 严守零构建：工具只在开发/CI 跑，不进部署产物；测试用 Node 自带 runner，无额外框架 |

---

## 10. 落地顺序建议

按第一期 → 第二期 → 第三期推进；三期可与二期并行。每期结束在 WORKLOG 记录成果与验收。实施计划（分任务、含具体文件与步骤）将由后续 writing-plans 产出。
