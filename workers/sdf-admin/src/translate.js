// 批量中文→日英翻译的纯逻辑（校验/建提示词/解析响应）。
// 供 sdf-admin Worker 的 /translate 路由使用，未来 Blog 模块直接复用同一模块。
// 真正调用 Qwen 的网络请求在 index.js，这里不含任何 IO。

const MAX_FIELDS = 200; // 单次批量上限，防误传超大请求
const MAX_TOTAL_CHARS = 20000; // 参照 functions/api/proofread.js 的量级

export function validateTranslateFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return { ok: false, error: '没有需要翻译的字段' };
  }
  if (fields.length > MAX_FIELDS) {
    return { ok: false, error: '一次翻译的字段过多，请分批同步' };
  }
  let totalChars = 0;
  for (const f of fields) {
    if (!f || typeof f.key !== 'string' || !f.key || typeof f.zh !== 'string' || !f.zh) {
      return { ok: false, error: '字段格式错误' };
    }
    totalChars += f.zh.length;
  }
  if (totalChars > MAX_TOTAL_CHARS) {
    return { ok: false, error: '待翻译内容过长，请分批同步' };
  }
  return { ok: true };
}

export function buildTranslatePrompt(fields) {
  const list = fields.map((f) => `- ${f.key}: ${f.zh}`).join('\n');
  return `你是专业的中文-日语-英语翻译。下面是网站上若干段中文文字，每条前面是它的字段名（不要翻译字段名本身，只翻译冒号后的内容）。

请把每一条分别翻译成日语和英语，严格只输出一个 JSON 对象，不要输出任何解释或 Markdown 代码块，格式如下：
{"ja": {"字段名": "日语翻译", ...}, "en": {"字段名": "English translation", ...}}

要求：保持原文语气和信息完整，不要增删内容，不要输出与原文无关的解释；如果字段名有明显语境提示
（如包含 title 表示标题、desc/body 表示正文），据此把握合适的正式程度。

待翻译内容：
${list}`;
}

export function parseTranslateResponse(responseText) {
  if (!responseText || typeof responseText !== 'string') return null;
  let s = responseText.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  let obj;
  try {
    obj = JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const ja = obj.ja && typeof obj.ja === 'object' ? obj.ja : {};
  const en = obj.en && typeof obj.en === 'object' ? obj.en : {};
  const cleanJa = {};
  const cleanEn = {};
  for (const [k, v] of Object.entries(ja)) if (typeof v === 'string' && v) cleanJa[k] = v;
  for (const [k, v] of Object.entries(en)) if (typeof v === 'string' && v) cleanEn[k] = v;
  return { ja: cleanJa, en: cleanEn };
}
