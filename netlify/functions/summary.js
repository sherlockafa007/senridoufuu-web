const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const fs = require('fs');
const path = require('path');

const QWEN_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

const SYS_SUMMARY =
  '你是会议纪要专家，擅长从双语对话（中文和日文）中提取关键信息。\n\n' +
  '任务：分析以下中日双语对话，生成结构化的会议纪要。\n\n' +
  '请按以下 JSON 格式输出（不要代码块，直接输出）：\n' +
  '{\n' +
  '  "topics": [...],           // 列表：识别的主要议题（3-5 个）\n' +
  '  "feedback": [...],         // 列表：客户的反馈和顾虑（3-5 条）\n' +
  '  "actions": [...]           // 列表：行动项，包含谁、做什么、到什么时间\n' +
  '}\n\n' +
  '要求：\n' +
  '· topics：从对话中归纳主要讨论主题，用简洁的名词短语\n' +
  '· feedback：提取客户（"对方说"部分）明确表达的兴趣点、问题、顾虑\n' +
  '· actions：识别对话中双方的承诺或计划\n' +
  '  - 格式：{ "actor": "我们" 或 "客户", "task": "具体任务", "deadline": "时间" }\n' +
  '  - 如果没有明确的时间，可写 "待定"\n' +
  '· 禁止编造、推断或猜测。只提取对话中明确说出的内容\n' +
  '· 如果对话中没有相关内容，返回空数组 []';

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

function formatDialoguesForAnalysis(dialogues) {
  return dialogues
    .map(d => {
      const speaker = d.marker === "我说" ? "我们" : "客户";
      return `【${speaker}】\n中文：${d.zh}\n日文：${d.ja}`;
    })
    .join('\n\n');
}

// ── DOCX 生成函数 ──
async function generateDocxBase64(summary, dialogues) {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          text: '会议纪要',
          heading: HeadingLevel.HEADING_1,
          bold: true,
          spacing: { after: 400 }
        }),

        new Paragraph({
          text: `日期：${new Date().toLocaleDateString('zh-CN')}`,
          spacing: { after: 100 }
        }),
        new Paragraph({
          text: `参与者：中国团队、日本客户`,
          spacing: { after: 100 }
        }),
        new Paragraph({
          text: `时长：约 ${Math.ceil(dialogues.length / 10)} 分钟`,
          spacing: { after: 400 }
        }),

        new Paragraph({
          text: '【议题】',
          heading: HeadingLevel.HEADING_2,
          bold: true,
          spacing: { after: 200 }
        }),
        ...(summary.topics || []).map(topic =>
          new Paragraph({
            text: `• ${topic}`,
            spacing: { after: 100 }
          })
        ),
        ...(summary.topics && summary.topics.length === 0 ? [
          new Paragraph({
            text: '（无）',
            spacing: { after: 200 }
          })
        ] : [new Paragraph({ text: '', spacing: { after: 200 } })]),

        new Paragraph({
          text: '【客户反馈】',
          heading: HeadingLevel.HEADING_2,
          bold: true,
          spacing: { after: 200 }
        }),
        ...(summary.feedback || []).map(fb =>
          new Paragraph({
            text: `• ${fb}`,
            spacing: { after: 100 }
          })
        ),
        ...(summary.feedback && summary.feedback.length === 0 ? [
          new Paragraph({
            text: '（无）',
            spacing: { after: 200 }
          })
        ] : [new Paragraph({ text: '', spacing: { after: 200 } })]),

        new Paragraph({
          text: '【行动项】',
          heading: HeadingLevel.HEADING_2,
          bold: true,
          spacing: { after: 200 }
        }),

        ...(summary.actions && summary.actions.length > 0
          ? summary.actions.map(action =>
              new Paragraph({
                text: `${action.actor}: ☐ ${action.task}${action.deadline ? `（${action.deadline}）` : ''}`,
                spacing: { after: 100 }
              })
            )
          : [new Paragraph({ text: '（无）', spacing: { after: 200 } })]
        ),
      ]
    }]
  });

  const bytes = await Packer.toBuffer(doc);
  return bytes.toString('base64');
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

    // 格式化对话
    const dialogueText = formatDialoguesForAnalysis(dialogues);
    const userPrompt = `以下是会议对话：\n\n${dialogueText}`;

    // 调用 Qwen 生成纪要
    const rawSummary = await qwen(SYS_SUMMARY, userPrompt, 1500, 0.5);

    // 解析 JSON
    let summary;
    try {
      const cleaned = rawSummary
        .replace(/```(?:json)?\n?/g, '')
        .replace(/```/g, '')
        .trim();
      summary = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr.message);
      summary = {
        topics: [],
        feedback: [],
        actions: []
      };
    }

    // 生成 DOCX 的 Base64 编码
    const docxBase64 = await generateDocxBase64(summary, dialogues);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        summary,
        docxBase64,
        docxFilename: `summary_${Date.now()}.docx`
      })
    };

  } catch (err) {
    let statusCode = 500;
    let errorMsg = err.message;

    if (err.message.includes('API') || err.message.includes('401')) {
      statusCode = 503;
      errorMsg = 'Qwen API 调用失败，请稍后重试';
    } else if (err.message.includes('timeout')) {
      statusCode = 504;
      errorMsg = '生成超时，请检查网络后重试';
    } else if (err.message.includes('缺少')) {
      statusCode = 400;
    }

    console.error('[summary.js]', err);

    return {
      statusCode,
      headers,
      body: JSON.stringify({ error: errorMsg })
    };
  }
};
