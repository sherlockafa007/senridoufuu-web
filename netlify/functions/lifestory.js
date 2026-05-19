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

const SYS_QUESTIONS =
  '你是一位温暖、善于倾听的传记访谈师，正在帮助记录一个人的生平故事。' +
  '根据受访者已经分享的内容，生成指定数量的追问问题。原则：' +
  '问题温暖自然，像朋友聊天，不像审问；' +
  '针对受访者提到的具体细节、人物或经历追问，展现真诚好奇；' +
  '敏感话题（感情、健康、困难经历）用开放式、非评判的方式提问；' +
  '不主动询问性取向、宗教信仰等私密标签，若对方主动提及可顺着深入；' +
  '符合中国和日本文化背景：含蓄、温和，尊重隐私；' +
  '只输出问题，每个问题独占一行，不要编号、不要其他说明。';

const SYS_STORY =
  '你是一位富有文学素养的传记作家，擅长将人物访谈整理成动人的生平故事。' +
  '请根据以下问答内容，撰写一篇完整的人物传记。要求：' +
  '用第一人称叙事，让故事充满个人温度；' +
  '有细节、有情感、有起伏，不是信息的机械罗列；' +
  '按人生脉络梳理，章节之间自然过渡；' +
  '保留受访者语言中的真实感，用流畅的文学语言呈现；' +
  '敏感或私密内容，用含蓄、有尊严的方式处理；' +
  '用 ## 分隔章节，给每个章节起一个诗意的名字；' +
  '篇幅视内容多少自然生成，不要强行填充；中文撰写。';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: '请求格式错误' }) }; }

  const { action, answers, count } = body;
  if (!action || !answers?.length) {
    return { statusCode: 400, body: JSON.stringify({ error: '缺少参数' }) };
  }

  const headers = { 'Content-Type': 'application/json' };

  try {
    if (action === 'questions') {
      const recent = answers.slice(-12);
      const qaText = recent.map(a => `问：${a.question}\n答：${a.answer}`).join('\n\n');
      const n = Math.min(count || 2, 3);
      const result = await qwen(
        SYS_QUESTIONS,
        `受访者已分享的内容（最近 ${recent.length} 条）：\n\n${qaText}\n\n请生成 ${n} 个追问问题：`,
        300,
      );
      const questions = result.split('\n').map(q => q.trim()).filter(q => q.length > 4);
      return { statusCode: 200, headers, body: JSON.stringify({ questions }) };
    }

    if (action === 'story') {
      const qaText = answers.map(a => `问：${a.question}\n答：${a.answer}`).join('\n\n');
      const story = await qwen(SYS_STORY, `以下是受访者的问答记录：\n\n${qaText}`, 3000, 0.8);
      return { statusCode: 200, headers, body: JSON.stringify({ story }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: '未知操作' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
