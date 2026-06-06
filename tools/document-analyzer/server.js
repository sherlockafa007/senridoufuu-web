/**
 * 文件对比分析 — 本地服务器
 * 无需 npm install，直接运行：node server.js
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT     = 3000;
const QWEN_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const CHUNK_SIZE = 8000;
const MAX_CHUNKS = 10;

// 从 config.json 或环境变量读取 API Key（启动时加载一次）
let QWEN_API_KEY = process.env.QWEN_API_KEY || '';
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  if (cfg.QWEN_API_KEY && !cfg.QWEN_API_KEY.includes('在这里')) {
    QWEN_API_KEY = cfg.QWEN_API_KEY;
  }
} catch { /* config.json 不存在时忽略 */ }

// ── Qwen 调用 ──────────────────────────────────────────────────────────────

async function qwen(apiKey, system, user, maxTokens = 800) {
  const res = await fetch(QWEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:       'qwen-plus',
      messages:    [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens:  maxTokens,
      temperature: 0.3,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Qwen API 错误 ${res.status}`);
  return data.choices[0].message.content.trim();
}

// ── 分析逻辑 ───────────────────────────────────────────────────────────────

const SYS_EXTRACT =
  '你是专业的商业分析师。请从以下文件内容中提取核心商业信息：' +
  '主要业务、收入来源、关键财务/运营数据、战略重点、风险因素。' +
  '输出结构化要点，简洁，保留具体数字。';

const SYS_MERGE =
  '以下是同一份文件的分段摘要，请整合为一份完整的商业摘要，' +
  '保留所有关键数据和要点，去掉重复内容。';

const SYS_REPORT =
  '你是资深商业分析师，擅长多企业/多业务模式的横向对比。' +
  '请基于以下各文件摘要，撰写深度对比分析报告。' +
  '要求：用 ## 标题分层，有具体数据支撑，指出各方核心异同，' +
  '最后给出有价值的商业洞察和建议。用中文撰写。';

async function summarizeOne(apiKey, name, text, onLog) {
  const cap = text.slice(0, CHUNK_SIZE * MAX_CHUNKS);

  if (cap.length <= CHUNK_SIZE * 2) {
    onLog(`  ${name}：${cap.length.toLocaleString()} 字符，单次分析`);
    return qwen(apiKey, SYS_EXTRACT, `文件：${name}\n\n${cap}`, 900);
  }

  const chunks = [];
  for (let i = 0; i < cap.length; i += CHUNK_SIZE) {
    chunks.push(cap.slice(i, i + CHUNK_SIZE));
  }
  const total = chunks.length;
  if (text.length > cap.length) {
    onLog(`  ⚠ ${name} 过大，仅分析前 ${cap.length.toLocaleString()} 字符（约 ${MAX_CHUNKS * 3} 页）`);
  }

  const parts = [];
  for (let i = 0; i < total; i++) {
    onLog(`  ${name}：分析第 ${i + 1}/${total} 段…`);
    const s = await qwen(
      apiKey, SYS_EXTRACT,
      `《${name}》第 ${i + 1}/${total} 段\n\n${chunks[i]}`,
      700,
    );
    parts.push(s);
  }

  if (parts.length <= 3) return parts.join('\n\n');

  onLog(`  ${name}：汇总各段摘要…`);
  return qwen(apiKey, SYS_MERGE, `文件：${name}\n\n${parts.join('\n---\n')}`, 1200);
}

async function runAnalysis(files, prompt, apiKey, onLog) {
  const summaries = [];

  for (let i = 0; i < files.length; i++) {
    const { name, content } = files[i];
    onLog(`\n[${i + 1}/${files.length}] 处理文件：${name}`);

    if (!content || !content.trim()) {
      onLog(`  ⚠ 未提取到文字（可能是扫描版 PDF，不含文字层）`);
      summaries.push(`【${name}】\n（未能提取文字，可能是扫描版 PDF）`);
      continue;
    }

    try {
      const summary = await summarizeOne(apiKey, name, content.trim(), onLog);
      summaries.push(`【${name}】\n${summary}`);
      onLog(`  ✓ 完成`);
    } catch (e) {
      onLog(`  ✗ 失败：${e.message}`);
      summaries.push(`【${name}】\n分析失败：${e.message}`);
    }
  }

  onLog('\n正在生成综合对比报告…');
  const sep      = '\n\n' + '─'.repeat(40) + '\n\n';
  const combined = summaries.join(sep);
  const q        = (prompt || '').trim() ||
    '请对以上文件进行综合对比分析，指出各方的核心业务模式异同、关键指标对比和战略洞察。';

  const report = await qwen(
    apiKey, SYS_REPORT,
    `各文件摘要如下：\n\n${combined}\n\n分析要求：${q}`,
    3000,
  );
  onLog('✓ 报告生成完毕\n');
  return report;
}

// ── HTTP 服务器 ────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {

  // 首页：返回 index.html
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // 分析接口
  if (req.method === 'POST' && req.url === '/analyze') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '请求格式错误' }));
      }

      const { files, prompt } = body;
      const key = QWEN_API_KEY;

      if (!key) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '未配置 API Key，请在 config.json 中填写 QWEN_API_KEY' }));
      }
      if (!Array.isArray(files) || !files.length) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '请上传文件' }));
      }

      const logs = [];
      const onLog = msg => {
        console.log(msg);
        logs.push(msg);
      };

      try {
        const content = await runAnalysis(files, prompt, key, onLog);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content, log: logs.join('\n') }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message, log: logs.join('\n') }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n✓ 分析工具已启动`);
  console.log(`  请在浏览器中打开：${url}\n`);
  require('child_process').exec(`start ${url}`);
});

process.on('SIGINT', () => { console.log('\n已停止。'); process.exit(0); });
