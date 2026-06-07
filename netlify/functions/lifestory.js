const QWEN_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

async function qwen(system, user, maxTokens = 800, temp = 0.7) {
  const key = process.env.QWEN_API_KEY;
  if (!key) throw new Error('未配置 API Key');
  const res = await fetch(QWEN_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
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
  '  "softLanding": null // 仅当 isEvasion=true：1-2句温和包容的回应，不是回避则 null\n' +
  '}';

// ── 生成衔接语 ───────────────────────────────────────────────────────────────

const SYS_BRIDGE =
  '你负责生成访谈中的衔接语：读取用户的上一条回答，生成一句连接到下一个问题的过渡句。\n' +
  '规则：\n' +
  '· 只输出一句话，20到35字之间\n' +
  '· 从用户回答的具体内容出发（细节、关键词、感受），不要泛泛而谈\n' +
  '· 自然引向下一个问题涉及的主题方向，但不要直接重复问题本身\n' +
  '· 语气克制平实，禁止"太棒了""你真的很勇敢""谢谢你的分享"之类奉承或煽情语\n' +
  '· 禁止陈词滥调和散文化修辞\n' +
  '· 只输出这一句话，不要解释，不要换行，不要引号';

// ── 生成故事 ────────────────────────────────────────────────────────────────

const SYS_STORY =
  '你是传记整理员，将访谈问答整理成第一人称自述文章。\n\n' +
  '═══ 风格规则 ═══\n' +
  '· 写法：白描，纪录片解说词式，克制，不煽情，不渲染\n' +
  '· 语言：口语化短句，像普通人写流水账日记，不是高考作文\n' +
  '· 不用比喻句、排比句、形容词堆砌\n' +
  '· 绝对禁止以下词汇和句式（违反即视为严重错误）：\n' +
  '  时光荏苒、岁月如歌、命运的齿轮、命运的安排、吴侬软语、明明灭灭、\n' +
  '  悄然分岔、红砖墙、青苔、梧桐树影、氤氲、婆娑、蹉跎、如诗如画、\n' +
  '  温情脉脉、筑梦、逐梦、岁月沉淀、人生轨迹、开启新篇章、\n' +
  '  以及一切用于营造文学氛围的修饰性短语\n\n' +
  '═══ 事实铁律（最高优先级，不得违反）═══\n' +
  '1. 只写受访者明确说出的事实，只用他们亲口使用的词\n' +
  '2. 受访者没有提到的人名、地名、职业、机构、品牌、具体事件，一律不得出现\n' +
  '3. 受访者说"换过几个城市"→只能写"换过几个城市"，不能列举任何城市名\n' +
  '4. 受访者说"认识了一些人"→不能编造任何人的名字、外貌、职业\n' +
  '5. 受访者没有提到某个职业→文中绝对不能出现该职业名称\n' +
  '6. 某个维度没有任何信息（如婚姻、信仰、具体工作单位）→该维度保持空白，完全不写\n' +
  '7. 推断、猜测、联想、补全、"可能是"——全部禁止，无一例外\n\n' +
  '═══ 结构要求 ═══\n' +
  '· 用 ## 分隔章节，章节名不超过6字，简洁直白\n' +
  '· 中文写作，不写序言和后记，直接开始\n' +
  '· 篇幅由素材决定，素材少则写短，不要凑字数';

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
          softLanding: null,
        };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ analysis }) };
    }

    // ── 生成衔接语 ──
    if (action === 'bridge') {
      const { lastAnswer, nextQuestion } = body;
      if (!lastAnswer || !nextQuestion) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: '缺少 lastAnswer/nextQuestion' }) };
      }
      const userPrompt =
        `用户刚才的回答：\n${lastAnswer}\n\n即将提出的下一个问题：\n${nextQuestion}\n\n请输出衔接语：`;
      const bridge = await qwen(SYS_BRIDGE, userPrompt, 100, 0.6);
      return { statusCode: 200, headers, body: JSON.stringify({ bridge: bridge.trim() }) };
    }

    // ── 生成完整故事 ──
    if (action === 'story') {
      const { answers } = body;
      if (!answers?.length) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: '缺少 answers' }) };
      }
      const qaText = answers.map(a => {
        if (a.privacy) {
          return `问：${a.question}\n答：[用户选择不分享]`;
        }
        return `问：${a.question}\n答：${a.answer}`;
      }).join('\n\n');
      const userPrompt =
        `以下是受访者亲口说出的所有信息。请严格基于这些内容撰写，禁止添加任何未提及的细节。\n标记为 [用户选择不分享] 的部分保持空白，不要推断内容。\n\n${qaText}`;
      const story = await qwen(SYS_STORY, userPrompt, 3000, 0.5);
      return { statusCode: 200, headers, body: JSON.stringify({ story }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: '未知操作' }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
