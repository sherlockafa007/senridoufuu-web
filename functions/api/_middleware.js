// Auth gate for every /api/* route.
// Cloudflare Pages runs this middleware before any matched function under /api/.
// Requires a valid Firebase ID token; rejects anonymous requests with 401.

import { verifyFirebaseToken } from './_lib/verifyFirebaseToken.js';

const json401 = (msg) =>
  new Response(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequest(context) {
  const { request } = context;

  // Same-origin requests don't preflight, but let OPTIONS through just in case.
  if (request.method === 'OPTIONS') return context.next();

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return json401('未登录');

  try {
    // Available to downstream functions via context.data.user if needed.
    context.data.user = await verifyFirebaseToken(token);
  } catch {
    return json401('登录已过期或无效，请刷新页面重新登录');
  }

  return context.next();
}
