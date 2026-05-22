const QWEN_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

async function qwen(system, user, maxTokens = 800, temp = 0.7) {
  const key = process.env.QWEN_API_KEY;
  if (!key) throw new Error('未配置 API Key');
  const res = await fetch(QWEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: maxTokens,
      temperature: temp,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `API ${res.status}`);
  return data.choices[0].message.content.trim();
}

// ── 分析回答 ────────────────────────────────────────────────────────────────

const SYS_ANALYZE =
  '你是一个访谈对话分析系统。分析用户对问题的回答，提取结构化信息。\n' +
  '严格输出 JSON，不要代码块，不要其他文字：\n' +
  '{\n' +
  '  "tags": [],         // 从回答中提取的经历/特征标签（英文），从以下词汇中选择：\n' +
  '                      // entrepreneur startup quit_job career_change fired achievement\n' +
  '                      // parent_conflict family_pressure expectation sibling\n' +
  '                      // marriage divorce partner loneliness isolation friendship betrayal\n' +
  '                      // migration moved abroad cultural_shock belonging\n' +
  '                      // death loss grief illness health\n' +
  '                      // art music writing creative design performance\n' +
  '                      // study university teacher\n' +
  '                      // finance debt wealthy poor investment\n' +
  '                      // faith religion belief spiritual\n' +
  '                      // identity culture heritage\n' +
  '                      // fairness justice courage sacrifice risk\n' +
  '  "year": null,       // 提到的具体年份（整数），没有则 null\n' +
  '  "location": null,   // 提到的具体城市或地区（中文原文），没有则 null\n' +
  '  "isEvasion": false, // 用户是否回避/模糊/不想回答（true/false）\n' +
  '  "evasionType": null,// "explicit_skip"/"vague"/"deflection"，不是回避则 null\n' +
  '  "transition": "",   // 1句自然过渡语，用于引入下一个问题，基于用户刚说的，克制真实，禁用陈词滥调\n' +
  '  "softLanding": null // 仅当 isEvasion=true：1-2句温和包容的回应，其余为 null\n' +
  '}';

// ── 生成故事 ────────────────────────────────────────────────────────────────

const SYS_STORY =
  '你是一位富有文学素养的传记作家，擅长将人物访谈整理成动人的生平故事。\n' +
  '请根据以下问答内容，撰写一篇完整的人物传记。要求：\n' +
  '- 用第一人称叙事，充满个人温度\n' +
  '- 有细节、有情感、有起伏，不是信息的机械罗列\n' +
  '- 按人生脉络梳理，章节之间自然过渡\n' +
  '- 保留受访者语言中的真实感，用流畅的文学语言呈现\n' +
  '- 敏感内容用含蓄、有尊严的方式处理\n' +
  '- 禁用"时光荏苒"、"岁月如歌"、"命运的齿轮"等陈词滥调\n' +
  '- 用 ## 分隔章节，给每个章节起一个简洁有力的名字\n' +
  '- 中文撰写';

// ── HTTP 处理器 ──────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: '请求格式错误' }) }; }

  const { action } = body;
  const headers = { 'Content-Type': 'application/json' };

  try {
    // ── 分析单条回答 ──
    if (action === 'analyze') {
      const { question, answer, recentHistory = [], knownTags = [] } = body;
      if (!question || !answer) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: '缺少 question/answer' }) };
      }

      const histText = recentHistory.slice(-4)
        .map(a => `问：${a.question}\n答：${a.answer}`)
        .join('\n\n');

      const userPrompt = [
        histText ? `最近的对话：\n${histText}\n\n` : '',
        `当前问答：\n问：${question}\n答：${answer}`,
        knownTags.length ? `\n\n已知标签：${knownTags.join('、')}` : '',
        '\n\n请分析并输出JSON：',
      ].join('');

      const raw = await qwen(SYS_ANALYZE, userPrompt, 450, 0.2);

      let analysis;
      try {
        const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
        analysis = JSON.parse(cleaned);
      } catch {
        analysis = {
          tags: [], year: null, location: null,
          isEvasion: false, evasionType: null,
          transition: '', softLanding: null,
        };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ analysis }) };
    }

    // ── 生成完整故事 ──
    if (action === 'story') {
      const { answers } = body;
      if (!answers?.length) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: '缺少 answers' }) };
      }
      const qaText = answers.map(a => `问：${a.question}\n答：${a.answer}`).join('\n\n');
      const story = await qwen(SYS_STORY, `以下是受访者的问答记录：\n\n${qaText}`, 3000, 0.8);
      return { statusCode: 200, headers, body: JSON.stringify({ story }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: '未知操作' }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
