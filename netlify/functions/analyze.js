exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) };
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
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { files, prompt } = body;
  if (!Array.isArray(files) || files.length === 0) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'files array required' }) };
  }

  // Per-file limit: 18,000 chars. With 5 files max = 90k chars total context.
  // qwen-turbo handles this within Netlify's 10s function timeout.
  const CHAR_LIMIT = 18000;
  const docContext = files.map((f, i) => {
    const content = (f.content || '').trim().slice(0, CHAR_LIMIT);
    return `【文件${i + 1}：${f.name}】\n${content || '（内容为空，可能为扫描版 PDF，无法提取文字层）'}`;
  }).join('\n\n---\n\n');

  const systemPrompt = `你是专业的财务分析师，擅长解读财务报告、MD&A（管理层讨论分析）及多份财务文件的交叉对比。
要求：
- 用中文撰写，语言专业简洁
- 重点关注：财务数据（收入、利润、资产、现金流）、经营指标、关键比率
- 分析MD&A中的管理层洞察、经营策略和风险因素
- 明确指出各对象的财务异同点：营收规模、盈利能力、增长率、关键指标对比
- 给出有根据的结论和风险提示，如数据不完整，注明"数据不足"`;

  const userMessage = `以下是需要分析的财务文件内容（包含财务报表和MD&A）：\n\n${docContext}\n\n---\n\n分析要求：${(prompt || '').trim() || '请对以上财务报告进行深度对比分析，重点关注财务指标、增长趋势、盈利能力和管理层对经营的分析。'}`;

  try {
    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(9000),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'qwen-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 1500,
        temperature: 0.2
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
    const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout');
    return {
      statusCode: isTimeout ? 504 : 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: isTimeout
        ? '分析超时，请减少文件数量或内容后重试。/ 分析がタイムアウトしました。ファイルを減らしてお試しください。'
        : err.message
      })
    };
  }
};
