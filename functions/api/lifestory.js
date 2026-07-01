// Cloudflare Pages Function — lifestory interview actions
const QWEN_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

async function qwen(apiKey, system, user, maxTokens = 800, temp = 0.7) {
  const res = await fetch(QWEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: temp,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `API ${res.status}`);
  return data.choices[0].message.content.trim();
}

const SYS_ANALYZE =
  '你是一个访谈对话分析系统。分析用户对问题的回答，提取结构化信息。\n' +
  '严格输出 JSON，不要代码块，不要其他文字：\n' +
  '{\n' +
  '  "tags": [],\n' +
  '  "year": null,\n' +
  '  "location": null,\n' +
  '  "isEvasion": false,\n' +
  '  "evasionType": null,\n' +
  '  "softLanding": null\n' +
  '}\n' +
  'tags 从以下词汇中选择：entrepreneur startup quit_job career_change fired achievement\n' +
  'parent_conflict family_pressure expectation sibling marriage divorce partner loneliness\n' +
  'isolation friendship betrayal migration moved abroad cultural_shock belonging death loss\n' +
  'grief illness health art music writing creative design performance study university teacher\n' +
  'finance debt wealthy poor investment faith religion belief spiritual identity culture heritage\n' +
  'fairness justice courage sacrifice risk';

const SYS_BRIDGE =
  '你负责生成访谈中的衔接语：读取用户的上一条回答，生成一句连接到下一个问题的过渡句。\n' +
  '规则：\n' +
  '· 只输出一句话，20到35字之间\n' +
  '· 从用户回答的具体内容出发（细节、关键词、感受），不要泛泛而谈\n' +
  '· 自然引向下一个问题涉及的主题方向，但不要直接重复问题本身\n' +
  '· 语气克制平实，禁止"太棒了""你真的很勇敢""谢谢你的分享"之类奉承或煽情语\n' +
  '· 只输出这一句话，不要解释，不要换行，不要引号';

const SYS_STORY =
  '你是传记整理员，将访谈问答整理成第一人称自述文章。\n\n' +
  '═══ 风格规则 ═══\n' +
  '· 写法：白描，纪录片解说词式，克制，不煽情，不渲染\n' +
  '· 语言：口语化短句，像普通人写流水账日记，不是高考作文\n' +
  '· 不用比喻句、排比句、形容词堆砌\n' +
  '· 绝对禁止：时光荏苒、岁月如歌、命运的齿轮、命运的安排、筑梦、逐梦、开启新篇章等一切文学氛围修饰语\n\n' +
  '═══ 事实铁律（最高优先级）═══\n' +
  '1. 只写受访者明确说出的事实，只用他们亲口使用的词\n' +
  '2. 受访者没有提到的人名、地名、职业、机构——一律不得出现\n' +
  '3. 推断、猜测、联想、补全——全部禁止\n' +
  '4. 某个维度没有信息则保持空白，完全不写\n\n' +
  '═══ 结构要求 ═══\n' +
  '· 用 ## 分隔章节，章节名不超过6字\n' +
  '· 中文写作，直接开始，不写序言和后记\n' +
  '· 篇幅由素材决定，素材少则写短';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = env.QWEN_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: '未配置 API Key' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: '请求格式错误' }), {
      status: 400,
    });
  }

  const { action } = body;
  const h = { 'Content-Type': 'application/json' };

  try {
    if (action === 'analyze') {
      const { question, answer, recentHistory = [], knownTags = [] } = body;
      if (!question || !answer) {
        return new Response(JSON.stringify({ error: '缺少 question/answer' }), {
          status: 400,
          headers: h,
        });
      }
      const histText = recentHistory
        .slice(-4)
        .map((a) => `问：${a.question}\n答：${a.answer}`)
        .join('\n\n');
      const userPrompt = [
        histText ? `最近的对话：\n${histText}\n\n` : '',
        `当前问答：\n问：${question}\n答：${answer}`,
        knownTags.length ? `\n\n已知标签：${knownTags.join('、')}` : '',
        '\n\n请分析并输出JSON：',
      ].join('');
      const raw = await qwen(apiKey, SYS_ANALYZE, userPrompt, 450, 0.2);
      let analysis;
      try {
        analysis = JSON.parse(
          raw
            .replace(/```(?:json)?\n?/g, '')
            .replace(/```/g, '')
            .trim(),
        );
      } catch {
        analysis = {
          tags: [],
          year: null,
          location: null,
          isEvasion: false,
          evasionType: null,
          softLanding: null,
        };
      }
      return new Response(JSON.stringify({ analysis }), { headers: h });
    }

    if (action === 'bridge') {
      const { lastAnswer, nextQuestion } = body;
      if (!lastAnswer || !nextQuestion) {
        return new Response(JSON.stringify({ error: '缺少 lastAnswer/nextQuestion' }), {
          status: 400,
          headers: h,
        });
      }
      const bridge = await qwen(
        apiKey,
        SYS_BRIDGE,
        `用户刚才的回答：\n${lastAnswer}\n\n即将提出的下一个问题：\n${nextQuestion}\n\n请输出衔接语：`,
        100,
        0.6,
      );
      return new Response(JSON.stringify({ bridge: bridge.trim() }), {
        headers: h,
      });
    }

    if (action === 'story') {
      const { answers } = body;
      if (!answers?.length) {
        return new Response(JSON.stringify({ error: '缺少 answers' }), {
          status: 400,
          headers: h,
        });
      }
      const qaText = answers
        .map((a) =>
          a.privacy
            ? `问：${a.question}\n答：[用户选择不分享]`
            : `问：${a.question}\n答：${a.answer}`,
        )
        .join('\n\n');
      const story = await qwen(
        apiKey,
        SYS_STORY,
        `以下是受访者亲口说出的所有信息。请严格基于这些内容撰写，禁止添加任何未提及的细节。标记为 [用户选择不分享] 的部分保持空白。\n\n${qaText}`,
        3000,
        0.5,
      );
      return new Response(JSON.stringify({ story }), { headers: h });
    }

    return new Response(JSON.stringify({ error: '未知操作' }), {
      status: 400,
      headers: h,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: h,
    });
  }
}
