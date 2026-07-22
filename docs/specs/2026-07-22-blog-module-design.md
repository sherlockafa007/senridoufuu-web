# Blog 模块（CMS 二期）设计

日期：2026-07-22
状态：已与用户确认方向，待实施
关系：细化并部分修订 `docs/specs/2026-07-14-admin-cms-design.md` 第 5 节（Blog）。
架构决策（git 发布、Firestore 草稿、slug、安全模型）沿用原 spec；本文档记录随后两处
架构变化带来的调整：① 复用已建好的 Worker `POST /translate` 路由（原 spec 写作时这条路由
还不存在）；② 后台整体已从表单编辑器改为就地可视化编辑器（`docs/specs/2026-07-21-inplace-editor-design.md`），
Blog 撰写沿用独立面板范式，与就地编辑互不影响。

## 1. 范围（本轮）

**做**：
- 后台新增「Blog」面板（独立撰写视图，非点击式编辑）：文章列表、写新文章、编辑已发布文章、下架
- 中文撰写 → 复用 `/translate` 一键出日英 → 三语可分别微调 → 发布
- 支持每篇文章一张**封面图**（客户端压缩转 WebP，Worker 侧提交）
- 草稿自动存 Firestore，防止长文写一半丢失

**不做（YAGNI，留后续）**：
- 文章正文内插图（只做封面图；正文内配图留给通用图片功能一起做）
- 评论、RSS、分页（原 spec 已排除，文章量上来再说）
- 富文本所见即所得编辑器（用简单 Markdown 子集 + 工具栏按钮，不做真 WYSIWYG）

## 2. 后台交互

`/admin/` 顶栏原有的「Blog（即将上线）」变为可点击的「Blog」标签，与「网站内容」平级切换：
- 点「网站内容」→ 现有就地编辑器（iframe 内嵌页面，点文字改）
- 点「Blog」→ 切换成独立的撰写/管理视图（不再显示 iframe）

**Blog 视图结构**：
```
┌─ 文章列表（发布时间倒序）──────────────┐
│ [+ 写新文章]                          │
│ 2026-07-22  AI市场观察      [编辑][下架]│
│ 2026-07-10  产品发布         [编辑][下架]│
└────────────────────────────────────┘

┌─ 撰写面板（点"写新文章"或"编辑"后展开）──┐
│ 标题：[___________________]           │
│ 标签：[___________________]           │
│ 封面图：[选择文件] [预览缩略图]         │
│ 正文（中文）：                         │
│ ┌───────────────────────────────┐   │
│ │ 工具栏：B（加粗）H（小标题）• （列表）│   │
│ │ [大段文本框，支持 Markdown 子集]   │   │
│ └───────────────────────────────┘   │
│ [✨ 一键同步日英]                      │
│ 中/日/英 三个标签（同步后可查看/微调）   │
│ [保存草稿]  [发布]                    │
└────────────────────────────────────┘
```

工具栏按钮只是往文本框光标处插入 Markdown 语法（如选中文字后点 B 包成 `**文字**`），
不要求作者会 Markdown 语法本身。

## 3. Markdown 子集与渲染

- 支持：`#`/`##` 小标题、`**加粗**`、`- 列表项`、空行分段、`![alt](图片url)` 图片语法（仅用于**未来**
  正文插图预留兼容，本轮工具栏不提供插入正文图片的按钮）。
- 渲染方式：**复用已修复的 marked + DOMPurify 客户端渲染管线**（与 `analysis.html`/`lifestory.html`
  同款，SRI 锁版本）。Worker **不**做服务端 Markdown 渲染——存的是原始 Markdown 文本，浏览器加载
  文章页时才转换+消毒。原因：Cloudflare Workers 运行时没有现成的 DOM 环境，服务端跑 DOMPurify
  需要引入 jsdom 等重依赖；本站现有 i18n 文字本来就是客户端渲染（`data-i18n` + `T` 字典），文章
  正文走同一模式一致、不新增复杂度。

## 4. 多语言展示机制（不改 `js/main.js`）

站内现有 `T` 字典是全站共享的翻译表，不适合塞入每篇文章的独立内容。文章页/列表页改用
「页面自带数据 + 包一层语言切换」的自包含模式：

**文章页**（`solutions/blog/<slug>.html`）：
```html
<script>
  const ARTICLE = {
    ja: { title: '...', body: '# 見出し\n\n本文…' },
    zh: { title: '...', body: '...' },
    en: { title: '...', body: '...' },
  };
  function renderArticle(lang) {
    const d = ARTICLE[lang] || ARTICLE.ja;
    document.getElementById('article-title').textContent = d.title;
    document.getElementById('article-body').innerHTML = DOMPurify.sanitize(marked.parse(d.body));
  }
  // main.js 的语言按钮通过 addEventListener(() => switchLang(...)) 在点击时才查找
  // window.switchLang，可以安全包一层而不改 main.js。
  const _switchLang = window.switchLang;
  window.switchLang = function (lang) { _switchLang(lang); renderArticle(lang); };
  document.addEventListener('DOMContentLoaded', () => renderArticle(currentLang));
</script>
```
`currentLang` 是 `main.js` 已声明的全局变量（同一 classic script 作用域下 bare 引用可读，
现有 `admin/index.html` 已验证过这个跨脚本读取模式可行）。

**列表页**（`solutions/blog/index.html`）：改为静态外壳 + 客户端 fetch 一份清单渲染卡片
（见下节），机制与站内 `content.json` 覆盖层完全一致，不新增模式。

## 5. 数据与发布流程

**清单文件 `solutions/blog/posts.json`**（新增，取代原 spec"直接拼装 index.html 的 HTML 片段"
的做法——拼字符串脆弱、难测试；改成清单 JSON + 客户端渲染，和 `content.json` 同一套路，
Worker 侧只需整体读写一个 JSON 数组，逻辑简单可测）。**存完整标题+正文（不只是摘要）**——
这是"编辑已发布文章"时后台读回内容的唯一数据源，避免另外反解析生成好的文章页 HTML：
```json
[
  { "slug": "2026-07-22-a3f8", "date": "2026-07-22", "tag": "AI・ハードウェア",
    "ja": { "title": "...", "body": "# 見出し\n\n本文…" },
    "zh": { "title": "...", "body": "..." },
    "en": { "title": "...", "body": "..." },
    "cover": "assets/images/blog/2026-07-22-a3f8-cover.webp" }
]
```
列表卡片的摘要文字由**列表页客户端**从 `body` 截取前 80 字左右显示（去 Markdown 语法符号），
不单独存储、不需要 Worker 预处理。`posts.json` 会随文章增多而变大，参考 `content.json` 同样
全量读写的先例，量级上可接受（YAGNI，不做分页/拆分）。

**slug 规则**：`日期 + 4 位随机短码`（如 `2026-07-22-a3f8`），Worker 生成。原 spec 设想的
"拉丁化标题"需要中日文转写库，本轮简化为随机短码，避免引入额外依赖。

**发布流程**（Worker `POST /blog/publish`）：
1. 校验 payload（标题/正文三语字符串、可选封面图 base64、tag、可选已有 slug 表示编辑）
2. 若带封面图 → 转发布用文件名 → commit 到 `assets/images/blog/<slug>-cover.webp`
3. 渲染文章页 HTML（纯函数，含 §4 的内嵌 `ARTICLE` 数据）→ commit 到 `solutions/blog/<slug>.html`
4. 读取现有 `posts.json` → 插入/更新该 slug 条目（按 date 倒序）→ commit 覆盖
5. 三次 commit 依次进行（Contents API 不支持多文件原子提交；发布频率低，串行提交足够，
   中途失败可重新点发布重试，幂等）
6. 返回最后一次 commit 的 sha，前端复用现有 `waitForDeploy` 轮询逻辑

**下架**（Worker `POST /blog/unpublish`，body `{slug}`）：
1. 删除 `solutions/blog/<slug>.html`（`github.js` 新增 `deleteFile`，用 GitHub Contents API
   的 DELETE 方法，需要文件当前 sha）
2. 从 `posts.json` 移除该条目并 commit
3. 封面图**不删除**（避免误删导致其它引用悬空；孤儿文件影响可忽略，YAGNI 不做垃圾回收）

**编辑已发布文章**：传入已有 `slug`，走和发布一样的三步 commit（覆盖同名文件 + 更新
`posts.json` 里那条），沿用 `putFile` 现有的"取最新 sha 再提交、409 冲突重试一次"逻辑。

## 6. 封面图

- 选择文件后**浏览器端**用 `<canvas>` 缩放 + 转 WebP（最长边 ≤ 1600px，质量取一个经验值），
  上限 500KB（超限自动降质量重试，和原 spec §7 图片设计一致）。
- 转好后以 base64 形式随 `/blog/publish` 请求一起发送（不单独开图片上传接口，一次请求搞定，
  避免"文章发布成功但封面图上传失败"的中间态）。
- Worker 侧再校验一次 base64 解码后的大小上限（防绕过前端）。

## 7. 草稿（Firestore）

- 集合 `blog_drafts/{draftId}`，字段：`title/body/tag/coverThumbDataUrl?/updatedAt`（草稿里
  封面图只存一个小预览用的 dataURL，不占大空间；真正的压缩+提交在发布时才做）。
- 前端撰写面板输入停顿 2 秒后自动写一次（debounce），面板打开时若存在草稿则询问是否恢复。
- 发布成功后该草稿标记 `published: true`（不物理删除，留痕方便排查）。
- **需要一次性 Firestore 规则**：仅 `ADMINS` 邮箱可读写 `blog_drafts` 集合（在 Firebase 控制台加，
  和之前 `rate_limits`/`meta` 规则一样的手法）。

## 8. Worker 代码结构

```
workers/sdf-admin/src/blog.js     新增：纯函数（slug 生成、文章 HTML 模板渲染、
                                  posts.json 条目增删改的纯数据操作、封面图 base64 大小校验）
workers/sdf-admin/src/index.js    改：新增 GET /blog/posts、POST /blog/publish、POST /blog/unpublish 路由
workers/sdf-admin/src/github.js   改：新增 deleteFile（DELETE Contents API）
```

`GET /blog/posts` 返回完整 `posts.json`（供撰写面板"编辑已发布文章"时读回标题+正文预填表单），
经 Worker 鉴权走一遍——虽然 `posts.json` 本身是公开静态文件，但为和 `/content` 保持同一访问
方式、后台不必区分"这个读走 Worker、那个读直连"，统一走 Worker。

安全模型（鉴权/CORS/限流/GITHUB_TOKEN 权限范围）与现有 `/content`、`/translate` 路由完全一致，
不新增机制。

## 9. 错误处理

- 发布分三步 commit，若第 2/3 步失败（如封面图 commit 成功但文章页 commit 失败），前端提示
  「发布未完成，请重新点击发布」，因每步都是覆盖式提交，重试安全（幂等）。
- `/translate` 调用失败：沿用就地编辑器已有的处理——按钮显示"同步失败，点击重试"，不阻塞
  直接手填三语。
- Firestore 草稿写入失败：静默重试，不打断撰写（草稿只是保险，不是核心路径）。

## 10. 测试

- `blog.js` 纯函数（`generateSlug`、`extractExcerpt`、`renderArticleHtml`、posts.json 增删改的
  纯数据函数、封面图大小校验）拆开单测，进 `node --test` + CI。
- 发布/下架链路（浏览器登录 + 真实 GitHub 写入 + Firestore 草稿）CI 测不了，上线前人工过一遍：
  写一篇测试文章 → 同步日英 → 发布 → 确认三语文章页可访问且换行/加粗渲染正确 → 确认列表页
  出现该文章 → 下架 → 确认文章页 404、列表页移除。

## 11. 一次性人工设置

1. Firebase 控制台加 `blog_drafts` 集合规则（仅 ADMINS 可读写）。

（Worker 密钥、CORS、限流等基础设施已在一期/就地编辑器阶段配好，本轮无需新增。）
