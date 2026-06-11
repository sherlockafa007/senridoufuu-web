// Netlify Functions 2.0 (ESM) — streaming proxy for DashScope
export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200 });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'QWEN_API_KEY not configured.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { files, prompt } = body;
  if (!Array.isArray(files) || files.length === 0) {
    return new Response(JSON.stringify({ error: 'files array required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const CHAR_LIMIT = 30000;
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

  const upstream = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
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
      max_tokens: 2000,
      temperature: 0.2,
      stream: true
    })
  });

  // Intercept upstream errors before streaming to avoid piping error body as SSE
  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}));
    return new Response(JSON.stringify({ error: err.error?.message || 'Qwen API error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    }
  });
};
