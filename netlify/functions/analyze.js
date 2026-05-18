exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'QWEN_API_KEY not configured.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { files, prompt } = body;
  if (!Array.isArray(files) || files.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'files array required' }) };
  }

  const CHAR_LIMIT = 4000;
  const docContext = files.map((f, i) => {
    const content = (f.content || '').trim().slice(0, CHAR_LIMIT);
    return `【文件${i + 1}：${f.name}】\n${content || '（内容为空，可能为扫描版 PDF，无法提取文字层）'}`;
  }).join('\n\n---\n\n');

  const systemPrompt = `你是一位专业的商业分析师，擅长对多份文件进行交叉对比与深度分析。根据用户提供的文件内容，撰写结构清晰、有洞察力的分析报告。
要求：
- 用中文撰写，语言专业简洁
- 先做整体概述，再按维度展开分析
- 明确指出各对象的异同点，给出有根据的结论
- 如文件内容不足以支撑某项分析，请注明"资料不足"`;

  const userMessage = `以下是需要分析的文件内容：\n\n${docContext}\n\n---\n\n分析要求：${(prompt || '').trim() || '请对以上文件进行综合对比分析，指出主要异同点和关键洞察。'}`;

  try {
    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 1500,
        temperature: 0.3
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
