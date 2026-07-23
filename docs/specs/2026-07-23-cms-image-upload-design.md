# CMS 三期：图片上传通用化 设计

日期：2026-07-23
状态：已与用户确认方向，待实施

## 1. 背景

管理后台一期（内容编辑器）、二期（Blog 模块）已上线。`docs/specs/2026-07-14-admin-cms-design.md` 第7节曾规划过图片上传，但当时的"图片URL"表单标签页从未真正工作过，在 07-21 改造成就地可视化编辑器时被一并删除——目前网站**完全没有任何图片**（`assets/images/` 为空、`content.json` 里的 `images: {}` 字段从建立起就没被 `main.js` 读取过，是没接上的空壳）。

实地排查发现：`about/index.html` 的团队页已经有图片位——每位成员的 `.team-member__photo-inner` 目前用 CSS 画的"姓氏首字" monogram（南/謝）占位，正好是"网站图片"功能的落地点。同时用户已经有南雪的真实照片待上传。

Blog 封面图在二期已经用一套方案实现（浏览器端 canvas 压缩转 WebP + Worker 侧再校验 + `putFile` 的 `alreadyBase64` 直传选项），这次复用同一套底层逻辑，但要覆盖两个新场景：**网站内容图片**（团队照片等）和 **Blog 正文插图**。

## 2. 范围

1. **网站图片**：团队页两位成员的照片位（`team1_photo` = 南雪，`team2_photo` = 謝怡然）。南雪现在就传真实照片；謝怡然可以先留着 monogram，两种状态自然共存。
2. **Blog 正文插图**：撰写文章时，能在正文中间插入图片，区别于已有的封面图。

机制设计为通用/可扩展（`data-image-key` 自动发现，类似 `data-i18n`），但**这次只在团队页两个照片位加属性**——网站目前没有其他图片位（hero、产品图等都是纯文字/CSS），不为不存在的需求预先搭建，以后要加新图片位只需加属性，无需改后台代码。

## 3. 图片处理统一规则

- 浏览器端 canvas 压缩转 WebP，**单张上限 1MB**（超限自动降质量压缩到限内）。
- **保持原始宽高比，不拉伸变形**：只在超过合理最大边长时等比缩小；压缩仅转格式/降质量，不裁剪。显示时用 `object-fit: cover` 保证头像圆框等场景不拉伸照片。
- Worker 侧再校验一次大小上限，防止绕过前端直接调接口。
- 新增 Worker 端纯逻辑模块 `workers/sdf-admin/src/images.js`（大小/格式校验），与现有 `validate.js`/`translate.js`/`blog.js` 并列，进 `node --test` + CI。
- **顺带统一**：Blog 封面图现有的 500KB 上限一并调到 1MB，三处（团队图片/Blog封面/Blog插图）保持一致，避免限制不统一造成困惑。

## 4. 网站图片（团队照片）

**标记方式：**
- 给需要上传图片的元素加 `data-image-key`（本次：`about/index.html` 两个 `.team-member__photo-inner` 分别标 `team1_photo`、`team2_photo`）。

**后台交互（`admin/index.html` 就地编辑器扩展）：**
- 现有 `initEditableFrame()` 在扫描 `[data-i18n]` 之外，同时扫描 iframe 内的 `[data-image-key]` 元素，绑定点击事件（区别于文字的 `contentEditable`）。
- 点击 → 触发隐藏的 `<input type="file">` → 选完图片后浏览器端压缩（规则见第3节）→ 立即在 iframe 内预览（插入 `<img>` 盖住 monogram）→ 暂存进 `pendingImages[key] = dataURL`。
- 并入现有"待确认变更"模型：暂存后出现在浮动变更条里，和文字改动一样，走同一套"✓完成/取消"、`commitActiveEdit`、`switchPage`/`save`/`syncTranslate` 前自动确认的逻辑。

**数据流：**
- 点"保存并发布"时，`PUT /content` 的请求体新增 `images: {key: dataURL, ...}`（只包含本次改动的图片）。
- Worker 处理：对每个新图片 `putFile(REPO, 'assets/images/site/<key>-<时间戳>.webp', base64Data, ..., {alreadyBase64:true})`，拿到路径后写入 `content.images[key] = path`，与文字字段合并后按现有逻辑提交 `content.json`（每张新图 = 1 次 commit + 1 次 content.json commit，沿用已有的多提交模式，`ref: main` 的镜像修复已覆盖这类场景）。

**前端渲染（`js/main.js`）：**
- 页面加载 fetch `content.json` 后，新增一步：遍历 `content.images`，对每个 `[data-image-key="<key>"]` 元素，如果对应 key 存在就插入/替换为 `<img src="<path>" style="object-fit:cover">` 盖住 monogram；key 不存在则保持页面内置的 monogram 兜底（不需要改动）。

## 5. Blog 正文插图

- 撰写面板现有 Markdown 工具栏（加粗/列表等）旁新增"插入图片"按钮。
- 点击 → 选文件 → 浏览器端压缩（同第3节规则）→ **立即**（不等发布，方案A）`POST /blog/image` 上传 → Worker 返回 `{path}` → 在 textarea 光标位置插入 `![图片](<path>)`。
- Worker `/blog/image` 路由：校验（复用 `images.js`）→ 生成路径 `assets/images/blog/inline-<时间戳>-<随机串>.webp` → `putFile(...,{alreadyBase64:true})` → 返回 `{ok:true, path}`。单独一次 commit，独立于发布/下架流程。
- 不做孤儿图片清理：草稿写了图片但最终没发布，图片仍留在仓库——沿用招标数据"只增不删"的既有做法，不是这次要解决的问题。

## 6. 错误处理

- 图片压缩/上传失败：界面提示"图片上传失败，可重试"，不影响其他已暂存的文字改动（网站图片场景）或已插入的正文内容（Blog 场景）。
- 超过 1MB 且压缩后仍超限：前端拒绝并提示"图片过大，请更换"。
- Worker 侧大小校验失败（前端被绕过时）：返回 400，界面提示同上。

## 7. 测试

- `images.js` 纯逻辑（大小/格式校验）单元测试，进 `node --test` + CI。
- Blog 封面图上限从 500KB 改 1MB 后，同步更新 `tests/admin-worker.test.mjs` 里相关断言。
- 鉴权 + 真实上传链路 CI 测不了，人工验证：
  1. 给南雪传真实照片，确认 `about/index.html` 正常显示、謝怡然的 monogram 不受影响。
  2. Blog 文章正文插入一张图片，确认发布后文章页正常渲染图片。

## 8. 范围外（YAGNI）

- 图片库/复用已上传图片（每次都是新选文件上传）
- 裁剪、旋转等编辑功能（只做等比压缩）
- 插图拖拽排序
- 图片 alt 文字三语化（单一 alt，不做多语言）
- 孤儿图片自动清理
- 除团队照片外的其他网站图片位（hero、产品图等）——机制通用可扩展，但本次不新增这些位置的标记
- 同一 `key` 重新上传替换照片时，旧文件不删除（同样是"只增不删"，和 Blog 插图孤儿文件是同一类取舍，不单独处理）
