// Cloudflare Pages Function — meeting summary (JSON only; DOCX generated client-side)
const SYS_SUMMARY =
  '你是会议纪要专家，擅长从多语对话（中文、日文或英文）中提取关键信息。\n\n' +
  '任务：分析以下双语/多语对话，生成结构化的会议纪要。\n\n' +
  '请按以下 JSON 格式输出（不要代码块，直接输出）：\n' +
  '{\n' +
  '  "topics": [...],\n' +
  '  "feedback": [...],\n' +
  '  "actions": []\n' +
  '}\n\n' +
  '要求：\n' +
  '· topics：从对话中归纳主要讨论主题，用简洁的名词短语（3-5 个）\n' +
  '· feedback：提取客户明确表达的兴趣点、问题、顾虑（3-5 条）\n' +
  '· actions：识别双方的承诺或计划\n' +
  '  - 格式：{ "actor": "我们" 或 "客户", "task": "具体任务", "deadline": "时间" }\n' +
  '  - 没有明确时间则写 "待定"\n' +
  '· 禁止编造、推断或猜测，只提取对话中明确说出的内容\n' +
  '· 如果没有相关内容，返回空数组 []';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = env.QWEN_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: '未配置 API Key' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: '请求格式错误' }), { status: 400 }); }

  const { dialogues } = body;
  if (!Array.isArray(dialogues) || dialogues.length === 0) {
    return new Response(JSON.stringify({ error: '缺少 dialogues 数组' }), { status: 400 });
  }

  const LANG = { ja: '日文', zh: '中文', en: '英文' };
  const dialogueText = dialogues.map(d => {
    const speaker = d.marker === '我说' ? '我们' : '客户';
    // New shape: src/tgt + srcLang/tgtLang. Fall back to old zh/ja shape.
    const src = d.src ?? d.zh;
    const tgt = d.tgt ?? d.ja;
    const srcLabel = LANG[d.srcLang] || '原文';
    const tgtLabel = LANG[d.tgtLang] || '译文';
    return `【${speaker}】\n${srcLabel}：${src}\n${tgtLabel}：${tgt}`;
  }).join('\n\n');

  const upstream = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: SYS_SUMMARY },
        { role: 'user', content: `以下是会议对话：\n\n${dialogueText}` },
      ],
      max_tokens: 1500,
      temperature: 0.5,
    }),
  });

  const data = await upstream.json();
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: data.error?.message || 'Qwen API error' }), {
      status: upstream.status, headers: { 'Content-Type': 'application/json' }
    });
  }

  const raw = data.choices[0].message.content.trim();
  let summary;
  try {
    summary = JSON.parse(raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim());
  } catch {
    summary = { topics: [], feedback: [], actions: [] };
  }

  return new Response(JSON.stringify({ summary }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
