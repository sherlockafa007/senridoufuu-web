# 管理后台（内容编辑 + Blog + 图片）设计

日期：2026-07-14
状态：已与用户确认方向，待实施

## 1. 目标

管理员登录后台后，不接触代码就能：
1. 编辑网站关键文字（约 40 个字段，中/日/英三语）
2. 上传/更换网站图片（团队照片、分享图、blog 插图）
3. 写 blog：一种语言撰写 → Qwen 自动翻译成三语 → 可人工修改 → 发布为三语静态页

## 2. 使用者与权限

- 现阶段管理员**只有 sherlockafa@gmail.com 一人**（`js/shared/admins.js` 的 `ADMINS`）。
- 同事（yuki.minami@senridf.com）约 2026-08 回归后，在 `ADMINS` 加一行即可开通。
- 界面语言：中文为主（同事回归后如需日语再加）。
- 设计标准：非技术人员可独立操作，全程不暴露 git/GitHub 概念。

## 3. 架构（关键决策）

**决策一：内容走 git 构建，不走 Firestore 实时读。**
用户确认可接受 2-3 分钟上线延迟。收益：网站保持纯静态、blog 对搜索引擎友好（SEO）、
所有改动有 git 历史可回滚、零新增运行成本。草稿是例外（见 §5）。

**决策二：写入通道放在用户自己的 Cloudflare 账号（Worker），不放同事的 Pages 项目。**
原因：网站 Pages Functions 跑在同事的 Cloudflare 账号下，用户无法登录其面板设置密钥
（已实地验证：用户的 CF 账号 sherlockafa@gmail.com 为空账号）。
收益：不依赖同事、GitHub 令牌由仓库所有者本人保管、密钥可自助轮换。

```
浏览器 /admin/*（部署在 senridf.com，与网站同仓库）
   │ Firebase 登录（现有账号体系）
   ▼
sdf-admin Worker（用户自己的 CF 账号，独立域 *.workers.dev，需 CORS 白名单 senridf.com）
   │ 服务端双重验证：Firebase ID token 有效 + email ∈ ADMINS
   │ 持有密钥：GITHUB_TOKEN（细粒度 PAT）、QWEN_API_KEY
   ▼
GitHub Contents API 提交到 sherlockafa007/senridoufuu-web (main)
   → 现有自动镜像（MIRROR_PAT workflow）→ 同事 Cloudflare 构建 → 上线（约 2-3 分钟）
```

废弃的旧通道（管理员在浏览器粘贴 GitHub PAT，存 localStorage）**必须移除**：
不安全（令牌等于整仓写权限）、对非技术用户不可用。

## 4. 后台结构

入口 `/admin/`（合并现有两处后台）：

```
/admin/            Firebase 登录门 + 管理员校验（复用 js/shared/firebase-init + admins）
├─ 📝 网站内容      复活现有编辑器（admin/index.html 的 SECTIONS 框架，含三语标签 + 图片字段）
├─ ✍️ Blog         文章列表 / 新建 / 编辑 / 下架
└─ 📊 运行监控      先放链接跳转 solutions/demo/admin.html（抓取监控），后续再整合
```

- 左上角 logo 链接回网站主页。
- 非管理员登录后显示"无权限"提示，不渲染任何编辑界面。

## 5. Blog 模块

**数据流：**
1. 撰写：标题 + 标签 + 正文（Markdown 子集：小标题/加粗/列表/图片，编辑器提供按钮，不要求会 Markdown）
2. 「AI 翻译」按钮 → Worker 调 Qwen（qwen-plus）补齐另两语 → 三语标签页内可逐处修改
3. 「发布」→ Worker 依模板生成：
   - `solutions/blog/<slug>.html`（单页三语切换，套用全站样式 + data-i18n 机制，`<base href="../../">`）
   - 重新生成 `solutions/blog/index.html` 的文章列表区（新文章在前，含日期/标签/摘要；替换现有 empty-state）
   - 一次 commit 提交上述文件（含插图）
4. 已发布文章可再编辑（重新生成+提交）、可下架（删除文章页 + 从列表移除）

**草稿：** 存 Firestore `blog_drafts` 集合（仅管理员可读写，需在控制台加一条规则），
自动保存，防止写一半丢失。发布成功后草稿标记为已发布。

**slug 规则：** 日期 + 拉丁化短标题（如 `2026-07-14-ai-market`），Worker 生成，避免中文/日文路径。

**功能优先原则：** blog 翻译走 Qwen 长上下文，不为省钱截断正文。

## 6. 网站内容编辑

- 沿用 `content.json` 覆盖机制（js/main.js 已在每页加载时 fetch `/content.json` 合并进 T，管道已通、无需改前端）。
- 编辑器 UI 沿用现有 `admin/index.html` 的 SECTIONS/IMAGE_FIELDS 定义，仅替换保存通道：
  旧 `ghGet/ghPut(浏览器PAT)` → 新 `Worker /content` 接口。
- 保存 = Worker 提交新的 content.json。字段留空 = 使用页面内置原文（覆盖语义，非必填）。

## 7. 图片

- 上传时**浏览器端**压缩转 WebP，单张上限 500KB（超限自动缩到限内），文件名规范化（时间戳+短名）。
- 存仓库 `assets/images/`（blog 插图存 `assets/images/blog/`），随站点一起部署，git 有版本。
- Worker 侧再校验一次大小上限（防绕过前端）。

## 8. 安全

- 所有写操作仅经 Worker；Worker 每次请求都验证 Firebase ID token（Web Crypto 验签，
  参照 functions/api/_middleware.js 现有实现）+ email 在 ADMINS 名单（名单在 Worker 侧硬编码或环境变量，
  与 js/shared/admins.js 保持同步）。
- GITHUB_TOKEN：细粒度 PAT，仅 `sherlockafa007/senridoufuu-web` 一个仓库，仅 Contents:Read/Write，
  有效期 1 年（到期 2027-07，届时 Regenerate 并更新 Worker secret）。浏览器永不接触。
- CORS：Worker 只允许 `https://www.senridf.com` / `https://senridf.com` 来源（本地开发另加 localhost）。
- 限流：Worker 侧简单限流（管理员写操作频率极低，防的是脚本滥用）。
- commit message 固定格式（如 `content: update via admin panel`），便于在 git 历史里辨认后台操作。

## 9. 错误处理与体验

- 发布后界面显示「发布中，约 2-3 分钟生效」，并轮询 GitHub commits API 比对两仓库 HEAD
  确认镜像完成（复用 TOOLS.md 记录的验证法），完成后提示「已上线」。
- GitHub API 冲突（sha 过期）：Worker 自动重取最新 sha 重试一次；再失败则明确报错。
- Qwen 翻译失败：可重试，不阻塞人工直接填写。
- Worker 不可达：界面提示「保存服务暂不可用」，草稿仍在 Firestore 不丢。

## 10. 一次性人工设置（用户操作，实施时逐步引导）

1. 创建 GitHub 细粒度 PAT（仅本仓库、Contents:R/W、1 年）。
2. 在用户 CF 账号部署 sdf-admin Worker（wrangler CLI 引导），并存入
   `GITHUB_TOKEN`、`QWEN_API_KEY` 两个 secret。
3. Firebase 控制台加 `blog_drafts` 集合规则。

## 11. 范围外（YAGNI）

- 所见即所得的全页可视化编辑（改坏版式风险大、开发量翻倍）
- 权限分级（现阶段管理员全权，人少不需要）
- 评论、RSS、blog 分页（文章多了再说）
- 监控面板深度整合（先放链接）

## 12. 测试

- Worker 的纯逻辑（slug 生成、文章 HTML 模板渲染、列表页重生成、Markdown 子集转换）拆为可测模块，
  进现有 `node --test` + CI。
- 鉴权/发布链路 CI 测不了（浏览器登录 + 真实 GitHub 写入），上线时人工验证：
  先用一篇测试文章走全流程（发布→确认上线→下架）。
