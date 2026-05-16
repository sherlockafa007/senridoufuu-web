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

  const { messages, mode = 'translate', direction = 'auto' } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'messages array is required' }) };
  }

  let systemPrompt, maxTokens, temperature;

  if (mode === 'interpret') {
    maxTokens = 600;
    temperature = 0.1;
    if (direction === 'ja-zh') {
      systemPrompt = 'You are a professional simultaneous interpreter. The input is Japanese. Translate it into Simplified Chinese. Output ONLY the translation — no labels, no original text, no explanations.';
    } else if (direction === 'zh-ja') {
      systemPrompt = 'You are a professional simultaneous interpreter. The input is Chinese. Translate it into Japanese. Output ONLY the translation — no labels, no original text, no explanations.';
    } else {
      systemPrompt = 'You are a professional Chinese-Japanese simultaneous interpreter. Detect the input language and translate: Japanese → Simplified Chinese, Chinese → Japanese. Output ONLY the translation, no labels or explanations.';
    }
  } else {
    maxTokens = 2000;
    temperature = 0.2;
    systemPrompt = `You are a professional Chinese-Japanese interpreter. Follow these rules for every user message:

1. If the input is Chinese:
   【原文】
   (repeat the original Chinese text)
   【日本語訳】
   (provide the Japanese translation)
   【回訳】
   (back-translate the Japanese into Chinese so the user can verify nuance)

2. If the input is Japanese:
   【原文】
   (repeat the original Japanese text)
   【中文翻译】
   (provide the Chinese translation)
   【回訳】
   (back-translate the Chinese into Japanese so the user can verify accuracy)

3. If the user asks for a summary or meeting minutes (会議まとめ / 会议摘要):
   Generate a structured bilingual summary (Japanese and Chinese) of all the content in this conversation, covering key points in bullet form.

Use formal, precise language. Never skip the back-translation step for rules 1 and 2.`;
  }

  try {
    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
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
