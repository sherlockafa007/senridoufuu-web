# 工具档案（参数 + 修改记录）

> 本文件记录 senridf.com 上各工具的**部署方式、架构、所需设置、用了谁家的 API**，以及每个工具的**修改记录**。
> 每次改动工具时，请同步更新对应小节的「修改记录」。API 只记**提供商**，不记密钥值。

---

## 0. 全站部署与架构总览

- **类型**：纯静态站（HTML + 单一 CSS + 单一 JS），无构建步骤、无框架。
- **部署链路（重要结构，易踩坑）**：
  1. 我（sherlockafa007）`git push` 到 **我的 GitHub：`sherlockafa007/senridoufuu-web`**
  2. **自动镜像**到同事仓库 **`Eveysnow5/senridf-web`** —— `.github/workflows/sync-upstream.yml`，`on: push` 在**我的仓库**触发，用 secret `MIRROR_PAT` 把 main `--force` 推到同事仓库（守卫 `if: github.repository == 'sherlockafa007/senridoufuu-web'`；没 secret 时自动跳过、不报错）。
  3. 同事仓库一更新 → **同事的 Cloudflare 账号**自动构建 → 上线 `senridf.com`
  - ✅ **2026-06-25 起 push 即自动上线，同事无需再手动 Sync fork。**
  - 🔑 `MIRROR_PAT`：同事建的 **fine-grained PAT**，仅 `Eveysnow5/senridf-web`，权限 **Contents: R/W + Workflows: R/W**，存我的仓库 Secrets。**有效期仅 30 天（2026-07-25 到期）**——创建时 Expiration 默认 30 天没改大；到期需 Regenerate 新值并更新 secret（fine-grained token 不能事后延期）。
  - ⚠️ 两个踩过的坑（已修，别再犯）：
    - `actions/checkout` 默认把 `GITHUB_TOKEN` 持久化成 github.com 的 `http.extraheader`，会**覆盖** URL 里的 PAT 导致 403 → 必须 `persist-credentials: false`。
    - fine-grained PAT 推送**含 `.github/workflows/` 改动**的提交需 **Workflows** 权限，否则整个 push 被拒。
  - ⚠️ 历史坑：2026-06-23 前靠手动 Sync fork，常卡住 → 线上落后好几个提交、"修了没生效"；曾试"定时在她 fork 跑"的镜像，但 **GitHub 默认禁用 fork 里的 scheduled workflow**，跑不起来，故改 push 触发在源仓库跑。
  - ⚠️ **2026-07-22 修的并发坑**：`actions/checkout` 默认签出**触发这次 workflow 的那个提交**（`github.sha`），不是 `main` 当时的最新状态。管理后台的一次"发布"操作会连续产生多个提交（如 Blog 发布：文章页 + `posts.json` 两次提交），每次都各自触发一次镜像 workflow；如果这几次并发执行、**完成顺序和提交顺序不一致**，"旧提交触发的那次"后完成会把镜像仓库强推回旧状态，**悄悄冲掉后面提交的内容**（实测症状：文章页上线了，但 `posts.json` 在镜像上 404）。修法：`actions/checkout` 加 `ref: main`，让每次运行都签出 `main` 分支**当时的最新状态**而非固定提交，不管几次并发谁先谁后完成，结果都一致。
  - ✅ 验证线上版本：`curl` 线上文件 grep 标志性改动比对（`.html` 会 308 跳无扩展名 URL，需 `-L`）；或 curl 两仓库 `commits/main` 的 sha 看是否一致。比看 Cloudflare 面板快准。
- **后端**：Cloudflare Pages Functions，目录 `functions/api/`，前端调 `/api/*`。
  - （`netlify.toml`、`netlify/` 是迁移前遗留的死文件，现已不用。CLAUDE.md 里"Netlify Functions"的描述也已过时。）
- **鉴权**：Firebase Auth（邮箱/密码）+ Firestore。
  - Firebase 项目：`senridfauthentication`（apiKey 在前端是公开标识符，非密钥）。
  - 用户审核状态存 Firestore `users/{uid}.status`：`pending` / `approved` / `disabled`。
  - 管理员（硬编码）：`sherlockafa@gmail.com`、`yuki.minami@senridf.com`。
  - **所有 `/api/*` 自 2026-06-19 起需携带 Firebase ID token**（见后端 `_middleware.js`）。
- **环境变量（配在同事的 Cloudflare Pages → Settings → Environment variables，Production）**：
  - `QWEN_API_KEY` — 阿里云通义千问（qwen-plus），文本类工具都用它。
  - `DEEPGRAM_API_KEY` — Deepgram 语音转文字，仅翻译工具语音模式用。**必须是 Member 或以上角色的 key**（`/v1/auth/grant` 签发临时 token 需要此权限）。
  - ⚠️ 改环境变量后**必须重新部署**才生效。
- **访问统计（2026-07 起）**：Cloudflare Web Analytics，beacon 由 `js/main.js` 的 `injectAnalytics()` 动态注入（token `8bcffe16...`，公开客户端标识非密钥）。仪表盘在**站长自己 CF 账号** → Web Analytics（hostname `www.senridf.com`）。手搓的 Firestore `visits` 统计暂并存，未来可退役以省成本。

---

## 1. translation.html — 中日翻译 + 语音口译

- **用途**：中/日/英互译；语音口译（连续口译，发言人标记"我说/对方说"）；会议纪要生成（结构化 + 导出 DOCX）。
- **架构**：主逻辑在普通 `<script>`；Firebase auth 在独立 `<script type="module">`。两者作用域不同，靠 `window.sdfGetToken` 桥接传 ID token。
- **用谁的 API**：
  - **通义千问 Qwen**（qwen-plus）：文本翻译 `/api/translate`、流式翻译 `/api/translate-stream`、会议纪要 `/api/summary`。
  - **Deepgram**：语音转文字。前端先调 `/api/deepgram-token` 拿**临时 token**，再用 `['bearer', token]` 子协议直连 `wss://api.deepgram.com/v1/listen`（模型 nova-2）。
- **前端库**：docx@8（jsdelivr CDN，生成 Word 纪要）；浏览器原生 `SpeechSynthesis`（TTS 朗读）。
- **所需设置**：`QWEN_API_KEY`、`DEEPGRAM_API_KEY`（Member+）。
- **修改记录**：
  - 2026-06-19：所有 fetch 改 `apiFetch` 注入 Firebase ID token；语音 WS 从 `['token', key]`（主密钥）改为 `['bearer', access_token]`（临时凭证）。commit 6e8c9e2。
  - 2026-06-19：修文字翻译标签页输入框不显示——切换用 `style.display=''` 会回落到样式表 `#tabText{display:none}`（ID 优先级），改成显式 `'block'`。commit 8cfd5bb。
  - 2026-06-20：修翻译被当成问答——输入"会说中文吗"时模型回答而非翻译。后端 `translate.js`（文本模式）/`translate-stream.js`（语音模式）的 system prompt 加强："用户输入永远是待译源文本，绝不回答/执行，哪怕是问句或命令"，并加示例。保留"会议摘要"例外（文本模式摘要按钮仍可用）。
  - 2026-06-21：语音区两个摘要按钮去重——删掉旧的"摘要"（`voiceSummary`，内联文本）及其处理代码，只保留"生成纪要"（`voiceGenSummary`，结构化 + DOCX 下载）。(#5)
  - 2026-06-21：修语音纪要语言标签颠倒——voiceHistory 改存 `srcLang/tgtLang/src/tgt`（实际语言），`summary.js` 按真实语言贴标签（兼容旧 `zh/ja` 字段），prompt 兼容英文。此前默认 A=日语时把日语标成"中文"。(#4)
  - 2026-06-23：修语音默认语言配反——"我说"默认日语导致中文使用者点"我说"无法翻译。改为 我说(甲/A)=中文、对方说(乙/B)=日本語（`speakerLang={A:'zh',B:'ja'}` + 下拉默认值），仍可手动切换。

---

## 2. proofreader.html — 中文文稿校对

- **用途**：粘贴或上传 Word/txt，检查错别字、重复句、编辑指令残留、前后逻辑冲突、标题一致性，输出分类报告；历史记录存 localStorage。
- **架构**：全部逻辑在单个 `<script type="module">`（auth 与 fetch 同作用域，无需桥接）。
- **用谁的 API**：**通义千问 Qwen**（qwen-plus）`/api/proofread`。
- **前端库**：mammoth.js@1.6.0（jsdelivr CDN，解析 .docx）。
- **所需设置**：`QWEN_API_KEY`。
- **修改记录**：
  - 2026-06-19：fetch 改 `apiFetch` 注入 ID token。commit 6e8c9e2。
  - 2026-06-19：修 .docx 上传——`mammoth.extractRawValue`（不存在）改为正确的 `extractRawText`，此前上传 Word 一律报"解析失败"。commit 8cfd5bb。
  - 2026-06-21：加 Firestore `approved` 审核门控（管理员直通，pending/disabled 显示门控页），与 translation/lifestory 对齐——此前只查 `if(user)`，任何注册用户都能用。(#6)
  - 2026-06-21：mammoth CDN 统一到 cdnjs（与 analysis 一致），原 jsdelivr。(#10)

---

## 3. analysis.html — 文书分析

- **用途**：上传 PDF/Word/Excel（多文件），智能分节、按财务/风险关键词选段，AI 流式输出分析报告。
- **架构**：主逻辑普通 `<script>` + Firebase auth module，靠 `window.sdfGetToken` 桥接。
- **用谁的 API**：**通义千问 Qwen**（qwen-plus）`/api/analyze-stream`（流式 SSE）。
- **前端库**：pdf.js、mammoth.js、SheetJS(xlsx)（均 cloudflare CDN）解析三种文档。
- **所需设置**：`QWEN_API_KEY`。
- **修改记录**：
  - 2026-06-19：fetch 改 `apiFetch` 注入 ID token；firebase module 加 `window.sdfGetToken` 桥接。commit 6e8c9e2。

---

## 4. lifestory.html — 人生故事

- **用途**：问答式引导（锚点题 + 衍生题），AI 分析回答打标签，最终生成人生故事；状态存 localStorage。
- **架构**：主逻辑普通 `<script>` + Firebase auth module，靠 `window.sdfGetToken` 桥接。
- **用谁的 API**：**通义千问 Qwen**（qwen-plus）`/api/lifestory`，单端点按 `action` 分流：`analyze`（分析回答）/ `bridge`（过渡句）/ `story`（成文）。
- **前端库**：marked.js（Markdown 渲染）。
- **所需设置**：`QWEN_API_KEY`。生成故事有 90s 超时 + AbortController。
- **修改记录**：
  - 2026-06-19：3 处 fetch 改 `apiFetch` 注入 ID token；firebase module 加 `window.sdfGetToken` 桥接。commit 6e8c9e2。

---

## 5. japanese_learner.html — 日语学习

- **用途**：日语动词/形容词活用练习。
- **架构**：纯前端，活用引擎在 `japanese_learner.js`（五段/一段/不规则/形容词等变形规则）。
- **用谁的 API**：**无外部 API**（纯前端计算）。
- **所需设置**：仅 Firebase 登录 + Firestore approved 门控；无后端环境变量。
- **修改记录**：
  - （本轮鉴权改造未涉及——它不调 `/api/*`。）

---

## 6. bids/ — 大阪市招标信息监控（内部工具）

- **用途**：每日自动抓取大阪市/吹田市/豊中市政府招标公告，Qwen 生成中文摘要，前端筛选展示。
- **架构**：
  - 爬虫：`scripts/bid-scraper/index.js`（Node.js + Cheerio + axios）
  - 调度：GitHub Actions `.github/workflows/scrape-bids.yml`，cron `0 17 * * *` UTC（= JST 02:00）
  - 存储：Firestore `bids` 集合（url_hash 去重，Admin SDK 写入）；运行报告写 `meta/scrape_status`
  - 前端：`bids/index.html`，Firebase 登录，城市/类别双筛选，过期项灰显「已结束」
  - 监控：抓取运行报告显示在管理后台 `solutions/demo/admin.html`「招标抓取监控」卡片
- **用谁的 API**：**通义千问 Qwen**（qwen-plus，生成中文摘要 + 判断是否为招标）。数据源：各市政府网站。
- **所需设置**：GitHub Secrets（Qwen key、Firebase Admin 凭证）；Firestore 规则（**管理后台读 `meta/scrape_status` 需允许管理员读 `meta` 集合**）。
- **维护注意**：
  - 吹田市 URL（`1042102`/`1042103`）是令和8年度专属，每年 4 月新年度需更新。
  - 爬虫**只新增、从不删除**——过期标的会一直留在 Firestore。**决定保留不清理**（数据量小，作为后续分析素材；删除也有误删风险，2026-06-21 决定）。
  - GitHub Secrets（`FIREBASE_SERVICE_ACCOUNT`/`QWEN_API_KEY`）**不跨仓库同步**：定时任务靠 workflow 里的 `if: github.repository == 'sherlockafa007/senridoufuu-web'` 护栏，只在源仓库跑。
- **修改记录**：
  - 2026-06-16：上线（前端 + 爬虫 + 定时任务）。
  - 2026-06-20：bids 前端表格收紧——容器 `max-w-7xl`→`max-w-6xl`、摘要列设 `w-full`（吸收多余宽度、消除列间空隙、降低行高）、单元格内边距 `px-4 py-3`→`px-3 py-2.5`。原因：表格过宽、列间空隙大、行偏高。
  - 2026-06-20：给 workflow 加仓库护栏 `if: github.repository == ...`——同步到同事仓库 `Eveysnow5/senridf-web` 的副本因缺 secret 每天定时失败、给同事发失败邮件；加护栏后那边的任务直接跳过（不算失败、不发邮件），只在源仓库运行。（排查确认：爬虫本身健康，5 站共解析 138 条，"0 new" 仅因源站无新公告。）
  - 2026-06-23：前端表格重构自适应——桌面表精简为 6 列（#/摘要/城市/类别/截标日/原文），删几乎全空的"发标时间/预期报价"列、"发注局室"折入摘要格、"截标日"改可换行（长日期不再撑爆列致横向溢出），容器收到 `max-w-5xl`。手机端维持卡片布局。
  - 2026-06-24：抓取质量 + 可观测性大修（本地用线上 HTML 验证后再改）：
    - **豊中市垃圾页**：原从整页 `$('a')` 抓，把页脚（サイトマップ/著作権/個人情報/組織と業務/リンク集/市役所案内）也收进来。改为只取招标列表容器 `ul.norcor a`（页脚在独立 `div.footer`，天然隔离）；并加标题黑名单（`公告（委託）`等索引页）。注：该站 `#CONT`/`.wysiwyg_wp` 因 HTML 嵌套畸形被 cheerio 提前闭合，不可用。
    - **吹田市漏抓截标 + 没过滤过期**：原日期正则只认 `2026/6/24` 斜杠格式，但站点是 `2026年6月24日` 年月日格式 → 不匹配致截标空、过期项混入。新增 `parseJpDate()` 同时支持两种格式，恢复截标提取与 7 天过期过滤。
    - **已结束项**：新增 `isClosed()`（标题含「終了しました」等 / 详情页含「募集を終了しています」/ 截标已过），入库时写 `status:'open'|'closed'`；**不删，累积保留分析素材**；前端对 closed/截标已过项灰显「已结束」标签。
    - **非招标兜底**：Qwen prompt 增加判定，非招标内容返回 `NOT_A_BID` → 主流程跳过不入库。
    - **运行报告**：每次跑写 `meta/scrape_status`（完成时间 + 各源 found/inserted/closed/skipped/failed），管理后台新增「招标抓取监控」卡片展示，解决"不知抓没抓全/抓了啥"。

---

## 后端 Functions 一览（`functions/api/`）

| 文件 | 作用 | 用谁的 API |
|------|------|-----------|
| `_middleware.js` | **拦截所有 `/api/*`**：校验 Firebase ID token（匿名 401）+ 每用户 120 次/分钟限流（超限 429） | — |
| `_lib/verifyFirebaseToken.js` | 纯 Web Crypto 验证 Firebase ID token（RS256 + aud/iss/exp） | Google 公钥端点 |
| `_lib/rateLimiter.js` | 限流：Firestore 原子自增按 `rate_limits/{uid}_{分钟}` 计数，故障放行 | Firestore REST |
| `translate.js` / `translate-stream.js` | 翻译（普通 / 流式） | Qwen qwen-plus |
| `summary.js` | 会议纪要（结构化 JSON） | Qwen qwen-plus |
| `proofread.js` | 中文校对 | Qwen qwen-plus |
| `lifestory.js` | 人生故事（analyze/bridge/story） | Qwen qwen-plus |
| `analyze-stream.js` | 文书分析（流式） | Qwen qwen-plus |
| `deepgram-token.js` | 签发 Deepgram 临时 token（`/v1/auth/grant`，TTL 300s） | Deepgram |

**后端修改记录**：
- 2026-06-19：新增 `_middleware.js` + `_lib/verifyFirebaseToken.js`，给所有 `/api/*` 加 Firebase 鉴权（此前全部裸奔，任何人可 curl 白嫖）；`deepgram-token.js` 从"直接返回主密钥"改为"签发临时 token"（此前主密钥对任何 GET 请求泄露）。commit 6e8c9e2。
- 2026-07-01：`_middleware.js` 接入 `_lib/rateLimiter.js`，每用户 120 次/分钟限流（护成本+安全）。**依赖 Firestore `rate_limits` 规则**（允许用户写 `{uid}_{分钟}` 桶），已加；未加时故障放行（不生效但无害）。TODO：`rate_limits` 集合配 TTL。

---

## 7. admin/ — 管理后台（内容编辑一期 2026-07-14 → 就地编辑器 2026-07-21 → Blog 二期 2026-07-22 → 图片上传三期 2026-07-23）

- **入口**：`https://www.senridf.com/admin/`，Firebase 登录 + `ADMINS` 名单双重校验。顶栏：网站内容｜**Blog**（2026-07-22 起可用）｜运行监控（暂链去 `solutions/demo/admin.html`）。
- **功能（就地可视化编辑，2026-07-21 起）**：后台内嵌四个真实页面（首页/关于我们/大事记/解决方案，同源 iframe，`?lang=zh` 强制中文），鼠标悬浮虚线高亮、点文字直接改（`contentEditable`），改完顶部「已改 N 处」。**字段从页面 `data-i18n` 属性自动发现**，不再手工维护清单（修复了旧表单遗漏的约 27 处字段，如导航/页脚文案）。写中文 → 点「✨ 一键同步日英」（Qwen 批量翻译）→「保存并发布」自动 commit → 镜像 → Cloudflare 构建，约 2-3 分钟上线，轮询镜像 HEAD 显示「已上线」。旧的"图片 URL 表单标签"已删除（从未真正接到渲染逻辑，纯摆设）。
- **架构（写入通道，与网站主体分离）**：
  ```
  浏览器 /admin/（Firebase 登录，就地编辑真实页面）
    → sdf-admin Worker（站长自己的 CF 账号 sherlockafa@gmail.com，地址 https://sdf-admin.sherlockafa.workers.dev）
      服务端验 Firebase ID token + ADMINS + 内存限流 30 次/分钟；CORS 白名单 senridf.com/localhost
      /content  GET/PUT → GitHub Contents API 提交 content.json（PUT 现额外接受可选 `images:{key:dataURL}`，上传/替换网站内容图片如团队照片，图片位由页面元素 `data-image-key` 属性自动发现；响应体新增 `images`——本次保存后 content.json 里最终的图片路径表，前端用它更新本地状态，避免下次保存把刚传的图覆盖掉）
      /translate POST   → 批量中文→日英（Qwen qwen-plus），内容编辑器与 Blog 共用
      /blog/posts    GET  → 读 solutions/blog/posts.json（文章清单，含完整三语标题+正文）
      /blog/publish  POST → 发布/编辑文章：可选提交封面图 → 生成并提交文章页 → 更新 posts.json（最多 3 次提交）
      /blog/unpublish POST → 删除文章页 + 从 posts.json 移除（2 次提交）
      /blog/image    POST → Blog 正文插图，选图后立即上传（不等发布），返回 `{path}`
    → 现有镜像链自动上线
  ```
- **代码**：`workers/sdf-admin/`（`src/index.js` 入口、`validate.js`/`rateLimit.js`/`translate.js`/`blog.js` 纯函数有测试、`github.js` IO 含 sha 冲突重试 + `deleteFile`）。直接 import 主仓库的 `verifyFirebaseToken.js` 和 `js/shared/admins.js`——**改 ADMINS 名单后 Worker 要重新 `cd workers/sdf-admin && npx wrangler deploy`**（名单打包进部署产物）。
- **Blog 数据结构**：`solutions/blog/posts.json` 是数组，每篇文章 `{slug, date, tag, title:{ja,zh,en}, body:{ja,zh,en}, cover}`——**title/body 是"字段名在外、语言在内"**（`p.title.zh`），不是"语言在外"（不存在 `p.ja.title` 这种结构）。`solutions/blog/index.html`（列表页）和文章页模板都读这个清单；`admin/index.html` 的撰写面板独立于就地编辑器（新文章没有已渲染页面可点，走标题+正文的表单式撰写，写完中文一键调 `/translate` 出日英）。正文 Markdown 子集，客户端用 marked+DOMPurify 渲染（SRI 锁版本，同 analysis.html/lifestory.html 的写法），Worker 不做服务端渲染（Workers 运行时没有现成 DOM 环境）。封面图浏览器端 canvas 压缩转 WebP（≤1MB，2026-07-23 起从 500KB 统一提到 1MB，与网站图片/正文插图上限一致；超限自动降质重试，压缩后仍超限会给出明确提示而非静默失败），随发布请求一起提交，不开单独接口。草稿自动存 Firestore `blog_drafts/current`（仅存文字，不存图，2 秒防抖），仅一个"当前草稿"槽位。
- **所需设置**：Worker secret `GITHUB_TOKEN`（细粒度 PAT `sdf-admin-worker`，仅本仓库 Contents:RW，**2027-07 到期**）+ `QWEN_API_KEY`（和网站主环境变量用同一个通义千问密钥，2026-07-21 起单独在 sdf-admin 也配了一份）。两者都在 CF 面板 sdf-admin → Settings → Variables and Secrets，**必须选 Secret 类型**（不是 Text——Text 是明文可读，wrangler deploy 时还会把明文值打进对比日志里，2026-07-21 踩过一次）。wrangler 已在本机 OAuth 登录（账号 sherlockafa@gmail.com）。
- **换行显示**：多行字段（`.section__body`/`.section__lead`/`.value-card__desc`/`.team-member__bio`/`.timeline__desc`/`.product-card__desc`/`.hero__tagline`/`.footer__tagline`）的 CSS 都加了 `white-space: pre-line`，`content.json` 里的 `\n` 才会正确显示为换行（2026-07-21 前是死 bug，换行会被浏览器悄悄吃掉）。
- **修改记录**：
  - 2026-07-14：一期上线（Worker 通道 + 表单式内容编辑）。**废除旧"浏览器粘贴 GitHub PAT"通道**（令牌暴露 localStorage，非技术用户不可用）。踩坑：①CF 账号首次用 Workers 需注册 workers.dev 子域名（用了 `sherlockafa`）；②细粒度 PAT 创建时默认零权限，必须手动加 Repository access + Contents:RW，否则读公开仓库成功但写 403（极具迷惑性）；③报错要透传 GitHub 的 message，只报状态码没法排障。
  - 2026-07-21：**改造为就地可视化编辑器**（废弃表单/SECTIONS 清单，字段自动发现），新增 `/translate` 批量翻译路由，修换行 bug，删死图片标签页。踩坑：①**点"保存/同步"按钮时若还有字段处于编辑中（没点"✓完成"）会被无声漏掉**——`save()`/`syncTranslate()` 现在都先自动确认当前编辑（`commitActiveEdit()`），不强制用户手动点完成；②**Qwen 翻译多行字段时会把内容拆成多个字段、凭空发明新字段名**（如 `ms3_desc` 拆出 `ms3_desc2`），发明的字段没有对应页面元素、翻译内容悄悄丢失——修法是提示词讲清楚"不许拆字段/发明字段名"+ `parseTranslateResponse` 硬过滤：只认请求时给的字段名，模型返回的其它一律丢弃（双保险，不能只靠提示词管住模型）。
  - **2026-07-22：Blog 二期上线**（一语写作→Qwen 翻三语→发布静态文章页+更新列表，支持封面图，Firestore 自动存草稿）。spec 见 `docs/specs/2026-07-14-admin-cms-design.md`（一期架构）+ `docs/specs/2026-07-21-inplace-editor-design.md`（就地编辑器）+ `docs/specs/2026-07-22-blog-module-design.md`（Blog）。三期（图片上传通用化）见下方 2026-07-23 条目。
    - 踩坑①（并发/部署链）：见"§0 全站部署"里 2026-07-22 的镜像 workflow 并发坑——本模块的多提交发布正是**触发**那个坑的场景，修在 workflow 层，不是本模块代码。
    - 踩坑②（前端动画）：`solutions/blog/index.html` 最初给动态插入的文章卡片加了 `data-animate`（滚动淡入特效标记），但该特效的 `IntersectionObserver` 只在页面首次加载时注册一次现有元素——异步插入的卡片永远赶不上注册，停留在 `opacity:0` 永久不可见（数据和 DOM 都对，肉眼看是空的）。凡是**页面加载完之后才动态插入**的元素一律不要挂这类"仅初始化时扫描一次"的效果标记。
    - 踩坑③（数据结构对不齐，最隐蔽的一个）：`posts.json` 每条数据形如 `{title:{ja,zh,en}, body:{ja,zh,en}}`（字段名在外、语言在内），但列表页最初写成按语言取 `p[lang].title`（语言在外、字段名在内）——两种形状看着都合理，一次手误就写反。报错 `Cannot read properties of undefined (reading 'body')` 发生在 `fetch().then()` 内部，被链尾的 `.catch(() => {})` **静默吞掉**，导致页面一直空白但控制台看不到任何错误，直到用户手动点了语言切换按钮（走了另一条不经过该 catch 的调用路径）才暴露出真实报错。**教训：给公开页面的 fetch 链加兜底 catch 没错（不能让访客看到报错堆栈），但排障时不能只看"看起来空白"就瞎猜，一定要先要一份浏览器控制台的报错**——这次连猜两次（缓存、URL 格式）才想起来直接要控制台日志，其实应该一开始就要。
  - **2026-07-23：CMS 三期，图片上传通用化**：
    - 新增 Worker 纯逻辑模块 `images.js`：大小校验（1MB 上限）、key 格式校验（防路径穿越）、路径生成，供网站图片/Blog封面图/Blog插图三处复用。
    - `PUT /content` 支持上传网站图片（`data-image-key` 属性自动发现图片位，本次用在团队页两个照片位：南雪/謝怡然）。
    - 新增 `POST /blog/image`：正文插图立即上传（不等发布），markdown 语法 `![图片](路径)` 直接引用。
    - Blog 封面图上限从 500KB 统一提到 1MB，三处图片上限保持一致。
    - 图片压缩/上传失败、压缩后仍超限，前端都会给出明确提示（不再静默失败）。

## 前端共享模块（`js/shared/`，2026-07-02 Phase 2 去重）

- `firebase-init.js` — 唯一 Firebase 配置 + init，导出 `app/auth/db`（SDK 10.14.1）。9 个鉴权页面统一 import，不再各自 `initializeApp`。
- `admins.js` — 唯一 `ADMINS` 名单 + `isAdmin(user)`。
- **改 Firebase 配置 / 加管理员：只动这两个文件。**
- 例外：`js/tracking.js` 用命名 app `'tracking'`（匿名访问统计），与真实登录隔离，故意不并入。

## 开发期工具链（Phase 1，不进部署产物）

- `package.json` 的 `npm run check` = ESLint + Prettier(--check) + `node --test` + `scripts/qa/scan.js`（死链/缺alt，懂 `<base href>`）。
- CI：`.github/workflows/ci.yml` 每次 push 自动跑 `npm run check`。**但测不了浏览器登录**，鉴权改动仍需线上人工验证。
- 爬虫纯解析在 `scripts/bid-scraper/parse.js`（有 `tests/` 测试）；`index.js` 只在直接运行时执行 `main()`。
