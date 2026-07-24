import { fetchWithTimeout } from './_lib/fetchWithTimeout.js';

const MAX_CHARS = 20000;

const buildPrompt = (
  text,
) => `你是一名专业的中文新闻稿校对助手。请仔细阅读以下文稿，检查六类问题并以Markdown格式输出报告。

## 检查项目

**一、错别字**
形近/音近错字；标点符号误入词语内部（如"公:约"应为"公约"，"空:白"应为"空白"）；语境明显不符的字词。

**二、重复或未完成的句子**
同一意思重复表达；明显被截断的句子；语义未完结的段落。

**三、编辑指令和插入提示**
括号内的编辑操作说明（如"(此处插入专栏1…)"）；嵌入正文的格式说明（如"注:文中(注1)…"）；其他发布前需清理的编辑备注。

**四、前后逻辑和细节冲突**
文中数字前后不一致；人名/地名/机构名前后写法不统一；时间线矛盾；与常识明显不符的表述。

**五、标题与正文一致性**
若文稿第一行为标题（通常是独立的短句），核查该标题是否准确反映正文主要内容；若存在夸大、遗漏关键信息或与正文主旨明显偏差，指出具体冲突点。若无法判断第一行是否为标题，写：> 未能识别标题，本项跳过

**六、中文排版规范**
逐条按确定性规则核查（这些是机械规则，请严格比对，不要放过）：
- 中英文之间、中文与阿拉伯数字之间应有一个半角空格（如"AI技术"应为"AI 技术"，"发布Q3财报"应为"发布 Q3 财报"）。
- 全角/半角标点混用：中文句子应用全角标点（，。！？：；），不应混入半角（如"报告,指出"应为"报告，指出"）；英文与纯数字片段内用半角。
- 标点重复或误用：连续重复标点（如"，，""。。""！！"）、句末缺失标点、逗号句号误用。
- 引号规范：中文引号统一用弯引号""''或直角引号「」，不应用英文直引号（" '）。
- 数字与单位、百分号写法前后一致（如混用"百分之三十"与"30%"应指出）。

## 输出格式

每类用 ## 二级标题标注（如"## 一、错别字"），逐条列出：
- **原文**：\`有问题的原文片段\`
  **问题**：简要说明
  **建议**：修改建议（无法判断时写"需人工核实"）

若某类无问题，写：> 未发现问题

## 待校对文稿

${text}`;

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
    });
  }

  const text = (body.text || '').trim();
  if (!text) {
    return new Response(JSON.stringify({ error: '未提供文本' }), {
      status: 400,
    });
  }

  const truncated = text.length > MAX_CHARS;
  const input = truncated ? text.slice(0, MAX_CHARS) : text;

  try {
    const qwenRes = await fetchWithTimeout(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${context.env.QWEN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen-plus',
          messages: [{ role: 'user', content: buildPrompt(input) }],
          max_tokens: 6000,
        }),
      },
    );

    if (!qwenRes.ok) {
      const err = await qwenRes.text();
      return new Response(JSON.stringify({ error: `AI 服务错误：${err}` }), {
        status: 502,
      });
    }

    const data = await qwenRes.json();
    const result = data.choices?.[0]?.message?.content?.trim() || '';

    return new Response(JSON.stringify({ result, truncated, char_count: text.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err.name === 'AbortError' ? '请求超时，请稍后重试' : '校对服务暂时不可用，请稍后重试';
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
