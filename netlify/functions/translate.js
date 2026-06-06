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
    const ciBase = 'You are a professional consecutive interpreter. The following is one complete speaking turn. Translate naturally and fluently, preserving the speaker\'s register and intent. Output ONLY the translation — no labels, no original text, no explanations. For Japanese output, use polite ます/です form unless the source is clearly casual speech.';
    if (direction === 'ja-zh') {
      systemPrompt = ciBase + ' Input language: Japanese. Target language: Simplified Chinese.';
    } else if (direction === 'zh-ja') {
      systemPrompt = ciBase + ' Input language: Simplified Chinese. Target language: Japanese.';
    } else if (direction === 'en-zh') {
      systemPrompt = ciBase + ' Input language: English. Target language: Simplified Chinese.';
    } else if (direction === 'en-ja') {
      systemPrompt = ciBase + ' Input language: English. Target language: Japanese.';
    } else if (direction === 'zh-en') {
      systemPrompt = ciBase + ' Input language: Simplified Chinese. Target language: English.';
    } else if (direction === 'ja-en') {
      systemPrompt = ciBase + ' Input language: Japanese. Target language: English.';
    } else {
      systemPrompt = ciBase + ' Detect the input language and translate to the most appropriate target language among Japanese, Simplified Chinese, and English.';
    }
  } else {
    maxTokens = 2000;
    temperature = 0.2;
    systemPrompt = `You are a professional interpreter specializing in Japanese, Chinese, and English. Follow these rules for every user message:

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
