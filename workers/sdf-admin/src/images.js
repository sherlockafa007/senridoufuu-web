// 图片上传纯逻辑（无 IO）：大小/格式校验、存储路径生成。
// 供 sdf-admin Worker 的 PUT /content（网站图片）、POST /blog/publish（封面图，见 blog.js）、
// POST /blog/image（正文插图）复用同一套规则，避免三处各写一份还不一致。

export const MAX_IMAGE_BYTES = 1_000_000; // 客户端已压缩，这里再校验一次防绕过

// 图片位的 key 会拼进 GitHub 文件路径，必须限制字符集防止路径穿越（如 ../../xxx）。
export function validateImageKey(key) {
  return typeof key === 'string' && /^[a-zA-Z0-9_]{1,64}$/.test(key);
}

// 校验并拆出 base64 内容。返回 { ok:true, base64 } 或 { ok:false, error }。
export function validateImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return { ok: false, error: '图片格式错误' };
  }
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  if (base64 === dataUrl) return { ok: false, error: '图片格式错误' };
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) return { ok: false, error: '图片过大' };
  return { ok: true, base64 };
}

// 网站内容图片（团队照片等）：按 key 覆盖，重新上传会生成新文件名（旧文件不删，见设计文档范围外）。
export function siteImagePath(key, now = Date.now()) {
  return `assets/images/site/${key}-${now}.webp`;
}

// Blog 正文插图：每次插入都是新文件，不与任何 key 关联。
export function blogInlineImagePath(now = Date.now(), randomFn = Math.random) {
  const rand = Math.floor(randomFn() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
  return `assets/images/blog/inline-${now}-${rand}.webp`;
}
