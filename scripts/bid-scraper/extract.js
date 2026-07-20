// LLM-based bid extraction (借鉴 Firecrawl/crawl4ai 思路：抓正文 → 让模型抽结构化字段)。
// 纯函数部分（取正文文本、建提示词、解析返回）无网络、无 Firebase，可单测。
// 网络调用（真正问 Qwen）放在 index.js，便于隔离测试。
//
// 现阶段为「影子模式」：cheerio 仍是唯一真数据源，这里的抽取只用于在运行报告里
// 与 cheerio 并排对比条数。验证 LLM 抽取不比 cheerio 差后，再改为主源。
const cheerio = require('cheerio');

const MAX_TEXT_CHARS = 12000; // 喂给模型的正文上限，防超长页面

// 从 HTML 取「干净正文文本」：去掉脚本/样式/导航/页脚，压缩空白。
function extractPageText(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, footer, header').remove();
  const root = $('main').length ? $('main') : $('body');
  const text = root
    .text()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
  return text.slice(0, MAX_TEXT_CHARS);
}

// 构造抽取提示词：让模型从正文里挑出真正的招标公告，返回 JSON 数组。
function buildExtractionPrompt(pageText, target) {
  return `你是招标信息抽取助手。下面是日本${target.city}政府某网页的正文文本。请从中找出所有【真正的招标/入札公告条目】，忽略网站导航、站点地图、版权说明、组织介绍、设施介绍等非招标内容。

严格只输出一个 JSON 数组，不要输出任何解释或 Markdown 代码块。数组每个元素形如：
{"title": "招标标题原文", "deadline": "截止日期原文（找不到就空字符串）", "ordering_bureau": "发注单位原文（找不到就空字符串）"}

如果正文里没有任何招标条目，输出空数组 []。

网页正文：
${pageText}`;
}

// 解析模型返回：容忍 ```json 代码块包裹；只保留含非空 title 字符串的对象。
// 解析失败返回 null（表示「抽取异常」，区别于「正常抽到 0 条」的空数组）。
function parseExtractedBids(responseText) {
  if (!responseText || typeof responseText !== 'string') return null;
  let s = responseText.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return null;
  let arr;
  try {
    arr = JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  return arr.filter(
    (item) =>
      item && typeof item === 'object' && typeof item.title === 'string' && item.title.trim(),
  );
}

module.exports = { extractPageText, buildExtractionPrompt, parseExtractedBids, MAX_TEXT_CHARS };
