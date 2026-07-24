# 3C 成本：visits 集合治理 设计

日期：2026-07-24
状态：已与用户确认方向，待实施

## 1. 背景

`docs/specs/2026-07-01-site-optimization.md` 第三期"成本"一项：`visits` 集合只增不减、管理后台每次读 500 条。用户在这次会话里选定优先做这一项。

实地排查发现：

- **5 个写入点**，字段结构一致 `{email, anonId, page, timestamp, device}`，每次访问/登录即写，无节流/去重：
  1. `js/tracking.js`（独立命名 Firebase app `'tracking'`，匿名登录写入，覆盖首页/about/blog/solutions 索引等 9 个无登录门控的公开页）
  2. `solutions/demo/{translation,lifestory,analysis,japanese_learner}.html` 四个登录工具页，各自内联复制了一份几乎相同的 `_track()`（用共享真实登录 `db`，每次会话首次登录成功写一条）
- **读取端**：`solutions/demo/admin.html` 用 `query(collection(db,'visits'), orderBy('timestamp','desc'), limit(500))` 一次性拉 500 条到前端做统计聚合（总量/独立用户/今日/近7日/按页面分布/按用户分布），超过 500 条的更早数据永远看不到。
- `js/tracking.js` 于 2026-06-16 上线，已运行约 5-6 周；`docs/TOOLS.md` 早已记录"2026-07 起改用 Cloudflare Web Analytics，手搓的 Firestore `visits` 统计暂并存，未来可退役"——这套统计从一开始就是过渡方案。
- 2026-07-23 已验证 Cloudflare Web Analytics 正常工作（21天累计40次访问），但它是隐私优先的匿名聚合，做不到"看到具体哪个登录用户用了什么工具"——这是现有 `admin.html`"按用户分布"功能提供、CF Web Analytics 替代不了的能力。

**关键决策（已与用户确认）**：用户明确需要保留"按用户看具体使用情况"的能力，因此这次是**优化现有 `visits` 系统**（去重 + 保留期 + 统一写入口），而不是退役切换到纯 CF Web Analytics。

## 2. 范围

1. 写入去重：同一身份（登录邮箱或匿名访客ID）同一天同一工具页，最多保留一条记录（后续访问更新该记录的时间戳，不新增文档）。
2. 数据保留：新增 `expireAt` 字段（写入时间 + 6 个月），配合 Firestore 原生 TTL 策略自动清理过期记录。
3. 收敛 5 个重复的写入点为统一共享模块。
4. `admin.html` 的读取上限从 500 调大到 2000（数据量级判断：去重+TTL后不会真的逼近这个数，纯粹是顺手留余量，不做分页/服务端聚合）。

**范围外（YAGNI，本次不做）**：
- 服务端聚合/定期汇总报表（Cloud Function 之类）——当前数据量级用不上
- 退役 `visits`、完全切换到 CF Web Analytics——用户明确要保留按用户统计能力
- `admin.html` 聚合/展示逻辑改动——字段结构不变，读取端除 limit 数值外不用改

## 3. 去重机制：确定性文档 ID

放弃 `addDoc`（自动生成 ID，每次调用必产生新文档），改用 `setDoc(doc(db,'visits', 确定性ID), data, {merge:true})`。

**ID 规则**：`${identity}_${page}_${day}`
- `identity`：`email || anonId`（登录用户用邮箱，匿名访客用 `sdf_anon_id`，与现有字段语义一致，也是 `admin.html` 现有"按用户分布"逻辑已经在用的判定顺序）
- `page`：现有的页面标识字符串（`translation`/`lifestory`/`analysis`/`japanese_learner`/`home`/`about`/`blog` 等，与现状一致）
- `day`：`new Date().toISOString().slice(0,10)`（UTC 日期，简单确定，不依赖访客本地时区设置）

同一天内重复访问会命中同一个文档 ID，`{merge:true}` 让 `setDoc` 自动变成"更新已有文档"而不是报错或产生重复；`timestamp` 每次都刷新为最新一次访问时间。

## 4. 共享模块

拆成"纯逻辑 + 装配层"两个文件，跟 `auth-gate-state.js`/`auth-gate.js` 的既有分层方式一致（纯函数可测，碰 Firebase 的部分人工验证）：

**`js/shared/track-visit-id.js`**（零依赖，可测）：
```js
export function visitDocId(identity, page, now = new Date())
```
拼出上面第 3 节的确定性 ID，用 `_` 分隔三段。

**`js/shared/track-visit.js`**（装配层，引用 Firebase CDN，不写自动化测试）：
```js
export function trackVisit({ db, email, anonId, page, device })
```
调用 `visitDocId` 算出 ID，`setDoc(..., {merge:true})` 写入 `{email, anonId, page, device, timestamp: serverTimestamp(), expireAt}`，返回该 ID 供调用方保存（用于后续更新时长）。

```js
export function updateVisitDuration({ db, docId, duration })
```
`updateDoc` 更新 `duration` 字段，同时把 `expireAt` 刷新为"现在+6个月"（保证只要用户还在活跃访问，记录不会意外提前过期；一旦某天的记录不再被写入，`expireAt` 就固定在最后一次写入时的值，6个月后自然被 TTL 清理）。

**5 个写入点迁移**（字段结构对外不变，`admin.html` 读取端不用跟着改）：
- `js/tracking.js`：`track()`/`finish()` 内部改调用 `trackVisit`/`updateVisitDuration`，保留 `getPageName()`/`getAnonId()`/`signInAnonymously` 等既有逻辑
- `solutions/demo/{translation,lifestory,analysis,japanese_learner}.html`：各自的内联 `_track()` 改调用 `trackVisit`，`visibilitychange` 监听里的 `updateDoc` 改调用 `updateVisitDuration`

## 5. Firestore TTL + 规则调整（一次性人工设置，用户操作）

- **TTL 策略**：Firebase 控制台 → Firestore → TTL → 新建策略 → 集合 `visits`，字段 `expireAt`。写入时该字段必须是 Firestore `Timestamp` 类型（用 SDK 的 `Timestamp.fromMillis(...)` 构造，不是裸 JS `Date` 或数字）。
- **规则调整**：`setDoc(...,{merge:true})` 在文档已存在时是 `update` 操作，不是 `create`。如果现有 `visits` 集合规则只放行 `create`，第二次同天写入会被拒绝。实施完成后会给出具体规则文本（届时把仓库里能确认的鉴权条件补齐，比如 `request.auth != null`），用户去控制台核对/调整，允许 `create, update`（或合并成 `write`）。

## 6. `admin.html` 读取端

只改一处：
```js
const q = query(collection(db, 'visits'), orderBy('timestamp', 'desc'), limit(500));
```
改成：
```js
const q = query(collection(db, 'visits'), orderBy('timestamp', 'desc'), limit(2000));
```
其余聚合/渲染逻辑（`renderDashboard` 及内部按 `email`/`anonId`/`page` 的统计）不变。

## 7. 测试

- `visitDocId`：`node --test` 覆盖——同一 identity+page+day 产出相同 ID；不同 day/identity/page 产出不同 ID；`now` 参数可注入，测试不依赖真实系统时间。
- `trackVisit`/`updateVisitDuration`（碰 Firebase）不写自动化测试。人工验证：同一账号同一天在同一工具页多次访问/刷新，确认 Firestore `visits` 集合里只产生一条文档、`timestamp` 随访问更新；跨天访问确认产生新文档。
- 镜像链路恢复前，这一步验证会被阻塞（跟之前"3D稳定性"人工验证一样的情况）。

## 8. 错误处理

- `trackVisit`/`updateVisitDuration` 内部沿用现状的 `.catch(() => {})` 静默失败——访问统计本身不是核心功能，不应该因为写入失败影响用户使用工具页（与现有 5 处写入点的既有容错策略一致，不引入新行为）。
- Firestore 规则调整前如果误漏掉 `update` 权限，同一天第二次写入会静默失败（被 `.catch(()=>{})` 吞掉），表现为"当天只有第一次访问被记录，之后的访问时长/次数更新不生效"——这是本次设计里需要在人工验证阶段特别检查的一点，已在第 5、7 节标注。
