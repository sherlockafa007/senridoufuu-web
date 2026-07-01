// Auth + CORS + rate-limiting gate for every /api/* route.
// Cloudflare Pages runs this before any matched function under /api/.

import { verifyFirebaseToken } from './_lib/verifyFirebaseToken.js';
import { checkRateLimit } from './_lib/rateLimiter.js';

const ALLOWED_ORIGIN = 'https://www.senridf.com';

function corsHeaders(origin) {
  const allowed =
    origin === ALLOWED_ORIGIN ||
    /^http:\/\/localhost(:\d+)?$/.test(origin);
  if (!allowed) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

export async function onRequest(context) {
  const { request } = context;
  const origin = request.headers.get('Origin') || '';
  const cors = corsHeaders(origin) ?? {};

  // CORS preflight — must return before auth check (preflight has no token)
  if (request.method === 'OPTIONS') {
    if (!cors['Access-Control-Allow-Origin']) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: cors });
  }

  // Auth check
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return json(401, { error: '未登录' }, cors);

  let user;
  try {
    user = await verifyFirebaseToken(token);
  } catch {
    return json(401, { error: '登录已过期或无效，请刷新页面重新登录' }, cors);
  }

  // Rate limiting (120 req/min per user)
  const limited = await checkRateLimit(user.uid, token);
  if (limited) {
    return json(429, { error: '请求过于频繁，请稍后再试（每分钟限 120 次）' }, cors);
  }

  context.data.user = user;

  // Attach CORS headers to the actual response
  const response = await context.next();
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
