// Firebase ID token verification for Cloudflare Pages Functions.
// Pure Web Crypto (RS256) — no npm dependencies, runs on the Workers runtime.
//
// Verifies signature against Google's public keys and checks the standard
// Firebase claims (aud / iss / exp). Returns { uid, email } on success,
// throws on any failure.

const PROJECT_ID = 'senridfauthentication';
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;
// JWK form of Google's public keys — easier to import than the X.509 certs.
const JWK_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

// Isolate-level cache, reused across requests on the same Worker instance.
let _jwkCache = { keys: null, exp: 0 };

async function getKeys() {
  if (_jwkCache.keys && Date.now() < _jwkCache.exp) return _jwkCache.keys;
  const res = await fetch(JWK_URL);
  if (!res.ok) throw new Error('failed to fetch signing keys');
  const { keys } = await res.json();
  const maxAge = parseInt(
    (res.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || '3600',
    10,
  );
  _jwkCache = { keys, exp: Date.now() + maxAge * 1000 };
  return keys;
}

function b64urlToBytes(s) {
  const b64 = s
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

export async function verifyFirebaseToken(idToken) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [h, p, s] = parts;

  const header = b64urlToJson(h);
  if (header.alg !== 'RS256') throw new Error('unexpected algorithm');

  const jwk = (await getKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown key id');

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!valid) throw new Error('bad signature');

  const payload = b64urlToJson(p);
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) throw new Error('expired');
  if (payload.aud !== PROJECT_ID) throw new Error('wrong audience');
  if (payload.iss !== ISSUER) throw new Error('wrong issuer');
  if (!payload.sub) throw new Error('no subject');

  return { uid: payload.sub, email: payload.email || null };
}
