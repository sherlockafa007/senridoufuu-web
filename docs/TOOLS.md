# 工具档案（参数 + 修改记录）

> 本文件记录 senridf.com 上各工具的**部署方式、架构、所需设置、用了谁家的 API**，以及每个工具的**修改记录**。
> 每次改动工具时，请同步更新对应小节的「修改记录」。API 只记**提供商**，不记密钥值。

---

## 0. 全站部署与架构总览

- **类型**：纯静态站（HTML + 单一 CSS + 单一 JS），无构建步骤、无框架。
- **部署链路（重要，易踩坑）**：
  1. 我（sherlockafa007）`git push` 到 **我的 GitHub：`sherlockafa007/senridoufuu-web`**
  2. 同事的仓库 **`Eveysnow5/senridf-web`** 从我的仓库**自动同步**（同步在同事侧，我这边无 sync workflow）
  3. **同事的 Cloudflare 账号**从他的仓库构建 → 上线 `senridf.com`
  - ⚠️ 后果：我 push 后**不会立刻上线**，要等同事仓库同步 + 他的 Cloudflare 构建。常见故障：同事只 retry 旧部署吃环境变量、没同步我最新 commit → 线上落后一个提交。
  - ✅ 验证线上到底是哪个版本：直接拉线上 HTML 比对，或让同事在 Cloudflare Deployments 看最新部署的 Source commit 哈希。
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
  - 存储：Firestore `bids` 集合（url_hash 去重，Admin SDK 写入）
  - 前端：`bids/index.html`，Firebase 登录，城市/类别双筛选
- **用谁的 API**：**通义千问 Qwen**（qwen-plus，生成中文摘要）。数据源：各市政府网站。
- **所需设置**：GitHub Secrets（Qwen key、Firebase Admin 凭证）；Firestore 规则。
- **维护注意**：
  - 吹田市 URL（`1042102`/`1042103`）是令和8年度专属，每年 4 月新年度需更新。
  - 爬虫**只新增、从不删除**——过期标的会一直留在 Firestore。**决定保留不清理**（数据量小，作为后续分析素材；删除也有误删风险，2026-06-21 决定）。
  - GitHub Secrets（`FIREBASE_SERVICE_ACCOUNT`/`QWEN_API_KEY`）**不跨仓库同步**：定时任务靠 workflow 里的 `if: github.repository == 'sherlockafa007/senridoufuu-web'` 护栏，只在源仓库跑。
- **修改记录**：
  - 2026-06-16：上线（前端 + 爬虫 + 定时任务）。
  - 2026-06-20：bids 前端表格收紧——容器 `max-w-7xl`→`max-w-6xl`、摘要列设 `w-full`（吸收多余宽度、消除列间空隙、降低行高）、单元格内边距 `px-4 py-3`→`px-3 py-2.5`。原因：表格过宽、列间空隙大、行偏高。
  - 2026-06-20：给 workflow 加仓库护栏 `if: github.repository == ...`——同步到同事仓库 `Eveysnow5/senridf-web` 的副本因缺 secret 每天定时失败、给同事发失败邮件；加护栏后那边的任务直接跳过（不算失败、不发邮件），只在源仓库运行。（排查确认：爬虫本身健康，5 站共解析 138 条，"0 new" 仅因源站无新公告。）

---

## 后端 Functions 一览（`functions/api/`）

| 文件 | 作用 | 用谁的 API |
|------|------|-----------|
| `_middleware.js` | **拦截所有 `/api/*`**，校验 Firebase ID token，匿名返回 401 | — |
| `_lib/verifyFirebaseToken.js` | 纯 Web Crypto 验证 Firebase ID token（RS256 + aud/iss/exp） | Google 公钥端点 |
| `translate.js` / `translate-stream.js` | 翻译（普通 / 流式） | Qwen qwen-plus |
| `summary.js` | 会议纪要（结构化 JSON） | Qwen qwen-plus |
| `proofread.js` | 中文校对 | Qwen qwen-plus |
| `lifestory.js` | 人生故事（analyze/bridge/story） | Qwen qwen-plus |
| `analyze-stream.js` | 文书分析（流式） | Qwen qwen-plus |
| `deepgram-token.js` | 签发 Deepgram 临时 token（`/v1/auth/grant`，TTL 300s） | Deepgram |

**后端修改记录**：
- 2026-06-19：新增 `_middleware.js` + `_lib/verifyFirebaseToken.js`，给所有 `/api/*` 加 Firebase 鉴权（此前全部裸奔，任何人可 curl 白嫖）；`deepgram-token.js` 从"直接返回主密钥"改为"签发临时 token"（此前主密钥对任何 GET 请求泄露）。commit 6e8c9e2。
