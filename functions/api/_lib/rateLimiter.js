// Rate limiting via Firestore REST API.
// Uses atomic field increment so concurrent requests don't race.
// Documents are bucketed per user per minute: rate_limits/{uid}_{YYYYMMDDHHmm}
// Fails open: if Firestore is unreachable, requests are allowed through.

// 120/min: voice interpretation calls /api/translate-stream once per utterance,
// so keep generous headroom for busy meetings (function-first). Still stops abuse.
const RATE_LIMIT = 120; // max requests per minute per user
const FIRESTORE_PROJECT = 'senridfauthentication';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents`;

export async function checkRateLimit(uid, idToken) {
  try {
    const minute = new Date().toISOString().slice(0, 16).replace(/\D/g, ''); // "202506251430"
    const docPath = `${FIRESTORE_BASE}/rate_limits/${uid}_${minute}`;

    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents:commit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          writes: [
            {
              transform: {
                document: docPath,
                fieldTransforms: [
                  {
                    fieldPath: 'count',
                    increment: { integerValue: '1' },
                  },
                ],
              },
            },
          ],
        }),
      },
    );

    if (!res.ok) return false; // fail open

    const data = await res.json();
    const newCount = parseInt(
      data.writeResults?.[0]?.transformResults?.[0]?.integerValue ?? '1',
      10,
    );

    return newCount > RATE_LIMIT; // true = blocked
  } catch {
    return false; // fail open
  }
}
