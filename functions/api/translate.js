// Cloudflare Pages Function — non-streaming translation proxy
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = env.QWEN_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'QWEN_API_KEY not configured.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages array is required' }), { status: 400 });
  }

  const systemPrompt = `You are a professional interpreter specializing in Japanese, Chinese, and English. Follow these rules for every user message:

1. If the input is Chinese:
   【原文】(original Chinese)
   【日本語訳】(Japanese translation)
   【回訳】(back-translate Japanese → Chinese to verify nuance)

2. If the input is Japanese:
   【原文】(original Japanese)
   【中文翻译】(Chinese translation)
   【回訳】(back-translate Chinese → Japanese to verify accuracy)

3. If the input is English:
   【Original】(original English)
   【日本語訳】(Japanese translation)
   【中文翻译】(Chinese translation)

4. If the user asks for a summary (会議まとめ / 会议摘要 / meeting summary):
   Generate a structured multilingual summary covering key points in bullet form.

Use formal, precise language appropriate to the context. Never skip the back-translation step for rules 1 and 2.`;

  const upstream = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: 2000,
      temperature: 0.2,
    }),
  });

  const data = await upstream.json();
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: data.error?.message || 'Qwen API error' }), {
      status: upstream.status, headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ content: data.choices[0].message.content }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
