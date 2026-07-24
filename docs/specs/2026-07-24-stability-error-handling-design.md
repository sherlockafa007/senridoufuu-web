# 3D 稳定性：前端错误边界 + API 超时兜底 设计

日期：2026-07-24
状态：已与用户确认方向，待实施

## 1. 背景

`docs/specs/2026-07-01-site-optimization.md` 第三期（安全·稳定·流畅·成本·友好）里的"稳定"一项：前端单个 JS 错误不致整页白屏、`/api` 统一超时与异常兜底。用户在这次会话里选定优先做这一项。

实地排查发现两个具体问题：

1. **前端登录门控零容错**：全站 14 个用户页面里 10 个含 `onAuthStateChanged` 登录门控逻辑（`admin/index.html`、`admin/blog/index.html`、`solutions/demo/admin.html`、`bids/index.html`、`solutions/demo/{translation,japanese_learner,proofreader,lifestory,analysis}.html`、`account.html`），每页各自内联复制同一段代码（未登录跳转、查 `users/{uid}.status`、`approved`/`pending`/`disabled` 分支渲染）。除了 Firestore `getDoc` 那一步有 try/catch，**其余任何地方抛错都会让整个回调崩掉，`#auth-gate` 遮罩永远卡在初始状态（转圈/空白）**——这正是"注册空白页"一类历史 bug 的病根。
2. **`/api` 端点无超时/兜底**：`functions/api/` 下 7 个端点（`analyze-stream`/`deepgram-token`/`lifestory`/`proofread`/`summary`/`translate-stream`/`translate`）里，只有 `lifestory.js` 有外层 try/catch；其余 6 个对外部 Qwen/Deepgram 的 `fetch` 调用既无超时也无异常兜底，网络异常会抛未捕获异常，前端拿到的是 Cloudflare 通用 500 页面而非可解析的错误 JSON。

**重要关联**：`docs/specs/2026-07-01-site-optimization.md` 第二期"去重重构"原计划建 `js/shared/` 四件套（`firebase-init.js`/`admins.js`/`auth-gate.js`/`i18n.js`），实际只建了前两个。`auth-gate.js` 从未建成，`i18n.js` 因 `js/main.js` 已承担该角色而确认不需要补建。这次補建 `auth-gate.js`，同时完成了二期遗留项和三期稳定性需求。

## 2. 范围

1. 新建 `js/shared/auth-gate.js`，统一登录门控 + 状态渲染 + 异常兜底。
2. `js/main.js` 的共享初始化逻辑（`injectShared`/`content.json` 合并与 `applyTranslations`/`initScrollAnimations`）之间加防御性隔离（分区 try/catch），互不连累。
3. 新建 `functions/api/_lib/fetchWithTimeout.js`，6 个缺兜底的端点接入，统一超时判定 + 统一错误 JSON 响应。
4. 试点迁移 `solutions/demo/translation.html` 到新 `auth-gate.js`，线上验证后批量迁其余 9 页。

**范围外（YAGNI，本次不做）**：
- `i18n.js` 共享模块（已确认不需要）
- `visits` 集合治理、后台读取量优化（属于"3C 成本"，另一项）
- 按错误场景定制不同用户提示文案（先统一成"出错了，请刷新重试"一种）
- CSP、Firebase App Check（属于其他独立项）

## 3. `js/shared/auth-gate.js`

**接口：**
```js
mountAuthGate({ auth, db, onApproved, onAdmin })
```

**行为：**
- 未登录 → `window.location.replace('/account.html')`（内置默认行为，页面无需再写）
- 管理员（`ADMINS.includes(user.email)`）或 Firestore `users/{uid}.status === 'approved'` → 移除 `#auth-gate` 遮罩元素，调用 `onAdmin(user)`（管理员优先）或 `onApproved(user)`；页面只需要在回调里写"通过后要做什么"（比如启用按钮、开始追踪访问）
- `status` 为 `pending`/`disabled`/其他 → 在 `#auth-gate` 遮罩内渲染统一提示文案（⏳ 审核中 / 🚫 已停用，带"← 返回"链接回 `/account.html`），文案内置在模块里，不再每页复制 HTML 字符串
- **任何异常**（Firestore 读失败、意外报错等，用 try/catch 包住整个回调体）→ 渲染统一的"⚠️ 出错了，请刷新页面重试"提示，同时 `console.error` 留痕；不再让页面永远卡在转圈/空白状态

**不做的事**：不接管 `visits` 访问统计逻辑（`_track`/`_anonId` 等）——这部分保留在各页面自己的 `onApproved`/`onAdmin` 回调里，`auth-gate.js` 只负责登录态判定与状态渲染，职责单一。

**内部拆分（为了可测试）**：模块内部把"判定该进入哪个状态"拆成一个不碰 DOM/Firebase 的纯函数：

```js
resolveGateState({ user, isAdminUser, status }) // 返回 'guest'|'admin'|'approved'|'pending'|'disabled'
```

`mountAuthGate` 只做"调 Firebase API 拿到 user/status → 调 `resolveGateState` → 根据返回值操作 DOM / 调回调"这层薄胶水，本身不含判定逻辑。这跟项目里 `blog.js`/`validate.js`/`images.js` 的既有分层习惯一致（纯逻辑可测、IO/DOM 胶水不测，留人工验证）。

## 4. `js/main.js` 防御性隔离

`DOMContentLoaded` 里 `injectShared()`、`content.json` 抓取合并、`applyTranslations(currentLang)`、`initScrollAnimations()` 目前顺序执行、没有互相隔离。给每一块单独包一层 try/catch（`console.error` 留痕），确保某一块报错不阻断其余几块继续执行——例如导航注入失败不应该连累语言切换或滚动动画。不引入新的用户可见 UI，纯防御性加固。

## 5. `functions/api/_lib/fetchWithTimeout.js`

**接口：**
```js
fetchWithTimeout(url, options, timeoutMs = 30000)
```

用 `AbortController` 实现，**只对"发出请求到收到首个响应"计时**：一旦对方开始返回内容（含流式响应的第一个字节），视为连接已建立，不再受此超时限制——长文档翻译/分析的处理时间不受影响；真正卡死无响应的连接会在 30 秒内被 abort 并抛出可识别的超时错误。

**接入范围**：`analyze-stream.js`、`deepgram-token.js`、`proofread.js`、`summary.js`、`translate-stream.js`、`translate.js` 六个端点，把现有对 Qwen/Deepgram 的 `fetch(...)` 调用换成 `fetchWithTimeout(...)`，并在各端点最外层补 try/catch，统一返回 `{error: '...'}` 格式的 JSON（参照 `lifestory.js` 已有的、`workers/sdf-admin/src/index.js` 的 `json()` 范式），不再让未捕获异常变成 Cloudflare 通用 500 页面。

## 6. 迁移范围与顺序

参照二期"先迁 1 页试点、线上验证后再批量"的既有做法：

1. 先迁 `solutions/demo/translation.html`（用户选定的试点页，也是最复杂的一类：多个子工具标签页 + `approved` 门控 + 访问统计）
2. 线上验证通过后，批量迁其余 9 页：`admin/index.html`、`admin/blog/index.html`、`solutions/demo/admin.html`、`bids/index.html`、`solutions/demo/{japanese_learner,proofreader,lifestory,analysis}.html`、`account.html`
3. 每页迁移为独立提交，迁完跑 `npm run check`

## 7. 测试

- `auth-gate.js` 里拆出的纯函数 `resolveGateState` 用 `node --test` 直接覆盖（guest/admin/approved/pending/disabled 各分支），不需要 DOM、不需要新增测试框架；`mountAuthGate` 本身（碰 DOM、调 Firebase）不写单元测试，留给第 6 节的人工验证
- `fetchWithTimeout` 可测：mock 一个"永不返回"的 fetch 确认按时 abort、mock 一个"立即返回"的 fetch 确认不受超时影响
- 鉴权 + 真实 Firestore 读取这条链路 CI 测不了，人工验证时机：试点页（`translation.html`）迁移完成后，线上走一遍未登录/pending/approved/管理员四种状态

## 8. 错误处理

- 前端 `auth-gate.js` 异常 → 统一"⚠️ 出错了，请刷新页面重试"提示（见第 3 节）
- `/api` 超时或异常 → 统一 `{error: '...'}` JSON，HTTP 状态码沿用各端点现有约定（如 502/500），前端已有的错误提示逻辑无需改动（只是现在能收到可解析的 JSON 而不是通用 500 页面）
