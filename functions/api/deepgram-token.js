// Cloudflare Pages Function — issue a short-lived Deepgram access token for the
// browser. Never returns the master API key: the client only ever sees a
// temporary JWT (5-min TTL) minted via Deepgram's /v1/auth/grant endpoint.
// Auth is enforced upstream by functions/api/_middleware.js.
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'DEEPGRAM_API_KEY not configured.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const grant = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl_seconds: 300 }),
  });

  const data = await grant.json();
  if (!grant.ok) {
    return new Response(
      JSON.stringify({ error: data.err_msg || data.error || 'Deepgram token grant failed' }),
      { status: grant.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // { access_token, expires_in } — client connects via WS subprotocol ['bearer', access_token]
  return new Response(JSON.stringify({
    access_token: data.access_token,
    expires_in: data.expires_in,
  }), { headers: { 'Content-Type': 'application/json' } });
}
