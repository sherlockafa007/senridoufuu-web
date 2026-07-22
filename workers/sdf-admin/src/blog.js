// Blog 模块纯逻辑（无 IO）：slug 生成、发布载荷校验、posts.json 增删改、文章 HTML 模板渲染。
// 供 sdf-admin Worker 的 /blog/* 路由使用。

const MAX_COVER_BYTES = 500_000; // 客户端已压缩，这里再校验一次防绕过

export function generateSlug(date, randomFn = Math.random) {
  const hex = Math.floor(randomFn() * 0xffff)
    .toString(16)
    .padStart(4, '0');
  return `${date}-${hex}`;
}

export function validatePublishPayload(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: '请求格式错误' };
  const { tag, date, title, body: postBody, cover } = body;
  if (typeof tag !== 'string' || !tag.trim()) return { ok: false, error: '缺少标签' };
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: '日期格式错误' };
  }
  for (const lang of ['ja', 'zh', 'en']) {
    if (!title || typeof title[lang] !== 'string' || !title[lang].trim()) {
      return { ok: false, error: `缺少${lang}标题` };
    }
    if (!postBody || typeof postBody[lang] !== 'string' || !postBody[lang].trim()) {
      return { ok: false, error: `缺少${lang}正文` };
    }
  }
  if (cover !== undefined && cover !== null) {
    if (typeof cover !== 'string') return { ok: false, error: '封面图格式错误' };
    const stripped = cover.replace(/^data:image\/\w+;base64,/, '');
    const approxBytes = Math.floor((stripped.length * 3) / 4);
    if (approxBytes > MAX_COVER_BYTES) return { ok: false, error: '封面图过大' };
  }
  return { ok: true };
}

// posts.json 是数组；按 slug 去重插入/更新，按 date 倒序排列。
export function upsertPost(posts, entry) {
  const filtered = posts.filter((p) => p.slug !== entry.slug);
  filtered.push(entry);
  filtered.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return filtered;
}

export function removePost(posts, slug) {
  return posts.filter((p) => p.slug !== slug);
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 文章页 HTML 模板。ARTICLE 数据内嵌三语内容，客户端用 marked+DOMPurify 渲染——
// Worker（Cloudflare Workers 运行时）没有现成 DOM 环境，服务端跑 DOMPurify 需要
// jsdom 之类的重依赖；本站现有 i18n 文字本来就是客户端渲染（data-i18n + T 字典），
// 文章正文走同一模式，不新增复杂度。
export function renderArticleHtml({ date, tag, title, body, cover }) {
  const articleData = {
    ja: { title: title.ja, body: body.ja },
    zh: { title: title.zh, body: body.zh },
    en: { title: title.en, body: body.en },
  };
  // </script> 若原样出现在 JSON 里会提前截断内嵌 <script> 标签，转成 unicode 转义防止。
  const articleJson = JSON.stringify(articleData).replace(/</g, '\\u003c');
  const coverImg = cover ? `<img src="/${cover}" alt="" class="blog-post__cover">` : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title.ja)} — 千里同風株式会社</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500&family=Noto+Serif+JP:wght@300;400;700&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
  <base href="../../">
  <link rel="stylesheet" href="css/main.css">
  <script defer src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js" integrity="sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi" crossorigin="anonymous"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/dompurify@3.4.12/dist/purify.min.js" integrity="sha384-piCcpDdJ7qVeK4Tv8Z6Hpcr3ZBIgP16TxQTPVfsLFdZ5uDgwc3Y8Ho7oUnqf12qu" crossorigin="anonymous"></script>
</head>
<body>

  <div id="nav-placeholder"></div>

  <main>
    <div class="page-header">
      <div class="page-header__container">
        <div data-animate>
          <span class="section__eyebrow">${escapeHtml(tag)} · ${escapeHtml(date)}</span>
          <h1 class="section__title" id="article-title"></h1>
        </div>
      </div>
    </div>
    <section class="section">
      ${coverImg}
      <div id="article-body" class="blog-post__body"></div>
    </section>
  </main>

  <div id="footer-placeholder"></div>

  <script src="js/main.js"></script>
  <script type="module" src="js/tracking.js"></script>
  <script>
    const ARTICLE = ${articleJson};
    function renderArticle(lang) {
      const d = ARTICLE[lang] || ARTICLE.ja;
      document.getElementById('article-title').textContent = d.title;
      document.getElementById('article-body').innerHTML = DOMPurify.sanitize(marked.parse(d.body));
    }
    const _switchLang = window.switchLang;
    window.switchLang = function (lang) { _switchLang(lang); renderArticle(lang); };
    document.addEventListener('DOMContentLoaded', () => renderArticle(currentLang));
  </script>
</body>
</html>
`;
}
