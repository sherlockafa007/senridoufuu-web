// sdf-admin Worker — 管理后台的写入通道。
// 部署在站长自己的 Cloudflare 账号，持有 GITHUB_TOKEN（细粒度、仅本仓库 Contents:RW）。
// 复用主仓库的 token 校验与管理员名单，保证前后端同一份逻辑。
// 注意：ADMINS 名单变更后需重新 `npx wrangler deploy`（名单在部署时打包进 Worker）。

import { verifyFirebaseToken } from '../../../functions/api/_lib/verifyFirebaseToken.js';
import { isAdmin } from '../../../js/shared/admins.js';
import { allowedOrigin, validateContentPayload } from './validate.js';
import { createRateLimiter } from './rateLimit.js';
import { getFile, putFile, deleteFile } from './github.js';
import {
  validateTranslateFields,
  buildTranslatePrompt,
  parseTranslateResponse,
} from './translate.js';
import {
  generateSlug,
  validatePublishPayload,
  upsertPost,
  removePost,
  renderArticleHtml,
} from './blog.js';

const REPO = 'sherlockafa007/senridoufuu-web';
const CONTENT_PATH = 'content.json';
const POSTS_PATH = 'solutions/blog/posts.json';

const isLimited = createRateLimiter({ limit: 30 });

function json(status, body, cors = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = allowedOrigin(origin)
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      : {};

    // CORS 预检 —— 无 token，必须在鉴权前放行
    if (request.method === 'OPTIONS') {
      if (!cors['Access-Control-Allow-Origin']) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/health') return json(200, { ok: true }, cors);

    // ── 鉴权：Firebase ID token 有效 + 在管理员名单 ──
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) return json(401, { error: '未登录' }, cors);

    let user;
    try {
      user = await verifyFirebaseToken(token);
    } catch {
      return json(401, { error: '登录已过期或无效，请刷新页面重新登录' }, cors);
    }
    if (!isAdmin(user)) return json(403, { error: '该账号无管理员权限' }, cors);
    if (isLimited(user.uid)) return json(429, { error: '操作过于频繁，请稍后再试' }, cors);

    try {
      if (url.pathname === '/content' && request.method === 'GET') {
        const { text } = await getFile(REPO, CONTENT_PATH, env.GITHUB_TOKEN);
        return json(200, { content: text ? JSON.parse(text) : {} }, cors);
      }

      if (url.pathname === '/content' && request.method === 'PUT') {
        let body;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: '请求格式错误' }, cors);
        }
        const check = validateContentPayload(body.content);
        if (!check.ok) return json(400, { error: check.error }, cors);
        const { commitSha } = await putFile(
          REPO,
          CONTENT_PATH,
          JSON.stringify(body.content, null, 2) + '\n',
          'content: update via admin panel',
          env.GITHUB_TOKEN,
        );
        return json(200, { ok: true, commitSha }, cors);
      }

      if (url.pathname === '/translate' && request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: '请求格式错误' }, cors);
        }
        const check = validateTranslateFields(body.fields);
        if (!check.ok) return json(400, { error: check.error }, cors);

        const qwenRes = await fetch(
          'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.QWEN_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'qwen-plus',
              messages: [{ role: 'user', content: buildTranslatePrompt(body.fields) }],
              max_tokens: 4000,
            }),
          },
        );
        if (!qwenRes.ok) return json(502, { error: '翻译服务暂时不可用，请稍后重试' }, cors);
        const data = await qwenRes.json();
        const parsed = parseTranslateResponse(
          data.choices?.[0]?.message?.content || '',
          body.fields.map((f) => f.key),
        );
        if (!parsed) return json(502, { error: '翻译服务返回格式异常，可重试' }, cors);
        return json(200, parsed, cors);
      }

      if (url.pathname === '/blog/posts' && request.method === 'GET') {
        const { text } = await getFile(REPO, POSTS_PATH, env.GITHUB_TOKEN);
        return json(200, { posts: text ? JSON.parse(text) : [] }, cors);
      }

      if (url.pathname === '/blog/publish' && request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: '请求格式错误' }, cors);
        }
        const check = validatePublishPayload(body);
        if (!check.ok) return json(400, { error: check.error }, cors);

        const slug = body.slug || generateSlug(body.date);
        const { text: postsText } = await getFile(REPO, POSTS_PATH, env.GITHUB_TOKEN);
        const posts = postsText ? JSON.parse(postsText) : [];
        const existing = posts.find((p) => p.slug === slug);

        let coverPath = existing ? existing.cover : null;
        if (body.cover) {
          coverPath = `assets/images/blog/${slug}-cover.webp`;
          const base64Data = body.cover.replace(/^data:image\/\w+;base64,/, '');
          await putFile(
            REPO,
            coverPath,
            base64Data,
            'blog: publish cover image',
            env.GITHUB_TOKEN,
            { alreadyBase64: true },
          );
        }

        const html = renderArticleHtml({
          slug,
          date: body.date,
          tag: body.tag,
          title: body.title,
          body: body.body,
          cover: coverPath,
        });
        await putFile(
          REPO,
          `solutions/blog/${slug}.html`,
          html,
          'blog: publish article',
          env.GITHUB_TOKEN,
        );

        const entry = {
          slug,
          date: body.date,
          tag: body.tag,
          title: body.title,
          body: body.body,
          cover: coverPath,
        };
        const updated = upsertPost(posts, entry);
        const { commitSha } = await putFile(
          REPO,
          POSTS_PATH,
          JSON.stringify(updated, null, 2) + '\n',
          'blog: update posts.json',
          env.GITHUB_TOKEN,
        );

        return json(200, { ok: true, slug, commitSha }, cors);
      }

      if (url.pathname === '/blog/unpublish' && request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: '请求格式错误' }, cors);
        }
        if (!body.slug || typeof body.slug !== 'string') {
          return json(400, { error: '缺少 slug' }, cors);
        }

        await deleteFile(
          REPO,
          `solutions/blog/${body.slug}.html`,
          'blog: unpublish article',
          env.GITHUB_TOKEN,
        );

        const { text } = await getFile(REPO, POSTS_PATH, env.GITHUB_TOKEN);
        const posts = text ? JSON.parse(text) : [];
        const updated = removePost(posts, body.slug);
        const { commitSha } = await putFile(
          REPO,
          POSTS_PATH,
          JSON.stringify(updated, null, 2) + '\n',
          'blog: remove from posts.json',
          env.GITHUB_TOKEN,
        );

        return json(200, { ok: true, commitSha }, cors);
      }
    } catch (e) {
      return json(502, { error: e.message || '保存服务出错，请稍后重试' }, cors);
    }

    return json(404, { error: 'not found' }, cors);
  },
};
