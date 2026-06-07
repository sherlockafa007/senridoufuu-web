exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'QWEN_API_KEY not configured in environment variables.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'messages array is required' }) };
  }

  const maxTokens = 2000;
  const temperature = 0.2;
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

  try {
    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: maxTokens,
        temperature
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: data.error?.message || 'Qwen API error' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: data.choices[0].message.content })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
