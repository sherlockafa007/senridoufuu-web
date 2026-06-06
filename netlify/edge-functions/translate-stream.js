export const config = { path: '/api/translate-stream' };

export default async function(request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const apiKey = Deno.env.get('QWEN_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'QWEN_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { messages, direction = 'ja-zh' } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages array is required' }), { status: 400 });
  }

  const ciBase = "You are a professional consecutive interpreter. The following is one complete speaking turn. Translate naturally and fluently, preserving the speaker's register and intent. Output ONLY the translation — no labels, no original text, no explanations. For Japanese output, use polite ます/です form unless the source is clearly casual speech.";

  const dirMap = {
    'ja-zh': ' Input language: Japanese. Target language: Simplified Chinese.',
    'zh-ja': ' Input language: Simplified Chinese. Target language: Japanese.',
    'en-zh': ' Input language: English. Target language: Simplified Chinese.',
    'en-ja': ' Input language: English. Target language: Japanese.',
    'zh-en': ' Input language: Simplified Chinese. Target language: English.',
    'ja-en': ' Input language: Japanese. Target language: English.',
  };
  const suffix = dirMap[direction] || ' Detect the input language and translate to the most appropriate target language among Japanese, Simplified Chinese, and English.';
  const systemPrompt = ciBase + suffix;

  const qwenResp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: 400,
      temperature: 0.1,
      stream: true
    })
  });

  if (!qwenResp.ok) {
    const errorData = await qwenResp.json();
    return new Response(JSON.stringify({ error: errorData.error?.message || 'Qwen API error' }), {
      status: qwenResp.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(qwenResp.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    }
  });
}
