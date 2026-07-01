// 静态站质量扫描：站内死链 + <img> 缺 alt。
// 用法：node scripts/qa/scan.js  （有问题时退出码非 0）
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');

const ROOT = path.resolve(__dirname, '..', '..');
const IGNORE_DIRS = new Set(['node_modules', '.git', 'assets', 'tools', 'netlify', 'tests']);

function listHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) listHtml(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith('.html')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// 只检查站内相对链接；跳过外链/锚点/mailto/js/协议相对
function isLocalLink(href) {
  if (!href) return false;
  if (/^(https?:)?\/\//.test(href)) return false;
  if (/^(#|mailto:|tel:|javascript:|data:)/.test(href)) return false;
  return true;
}

// relBaseDir 是"相对链接"的解析基准目录（受 <base href> 影响）。
// 根绝对路径（以 / 开头）不受 <base> 影响，始终从站点根解析。
function resolveTarget(href, relBaseDir) {
  const rel = href.split('#')[0].split('?')[0];
  if (!rel) return null;
  const base = rel.startsWith('/') ? ROOT : relBaseDir;
  let target = path.resolve(base, rel.replace(/^\//, ''));
  // 目录链接 → index.html
  if (rel.endsWith('/')) target = path.join(target, 'index.html');
  return target;
}

const problems = [];

for (const file of listHtml(ROOT)) {
  const rel = path.relative(ROOT, file);
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));

  // <base href> 改变相对链接的解析基准（如 solutions 页用 <base href="../">）
  const baseHref = $('base[href]').attr('href');
  const relBaseDir = baseHref ? path.resolve(path.dirname(file), baseHref) : path.dirname(file);

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!isLocalLink(href)) return;
    const target = resolveTarget(href, relBaseDir);
    if (target && !fs.existsSync(target)) {
      problems.push(`${rel}: 死链 -> ${href}`);
    }
  });

  $('img').each((_, el) => {
    if ($(el).attr('alt') === undefined) {
      const src = $(el).attr('src') || '(无 src)';
      problems.push(`${rel}: <img> 缺 alt -> ${src}`);
    }
  });
}

if (problems.length) {
  console.error(`静态扫描发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('静态扫描通过：无死链、无缺 alt。');
