const QWEN_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

async function qwen(system, user, maxTokens = 1500, temp = 0.5) {
  const key = process.env.QWEN_API_KEY;
  if (!key) throw new Error('未配置 API Key');

  const res = await fetch(QWEN_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),  // 30 秒超时
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      max_tokens: maxTokens,
      temperature: temp,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `API ${res.status}`);
  return data.choices[0].message.content.trim();
}

// ── HTTP 处理器 ──
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: '请求格式错误' }) };
  }

  const headers = { 'Content-Type': 'application/json' };

  try {
    const { dialogues } = body;
    if (!Array.isArray(dialogues) || dialogues.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '缺少 dialogues 数组' })
      };
    }

    // 后续任务会实现具体逻辑
    // TODO: 调用 Qwen 生成纪要
    // TODO: 生成 DOCX 文件

    return { statusCode: 200, headers, body: JSON.stringify({ message: 'OK' }) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
