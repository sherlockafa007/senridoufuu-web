// 纯校验逻辑（无 IO），供 sdf-admin Worker 使用，可用 node --test 直接测。

const LANGS = ['ja', 'zh', 'en'];
const MAX_JSON_BYTES = 100_000; // content.json 上限，防误传大对象

export function allowedOrigin(origin) {
  return (
    origin === 'https://www.senridf.com' ||
    origin === 'https://senridf.com' ||
    /^http:\/\/localhost(:\d+)?$/.test(origin)
  );
}

// content.json 载荷形状：{ ja|zh|en|images: { 字段名: 字符串 } }
export function validateContentPayload(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return { ok: false, error: '内容格式错误' };
  }
  const allowedGroups = [...LANGS, 'images'];
  for (const [group, fields] of Object.entries(content)) {
    if (!allowedGroups.includes(group)) return { ok: false, error: `未知分组：${group}` };
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      return { ok: false, error: `分组 ${group} 格式错误` };
    }
    for (const [key, val] of Object.entries(fields)) {
      if (typeof val !== 'string') return { ok: false, error: `字段 ${group}.${key} 必须是文字` };
    }
  }
  if (JSON.stringify(content).length > MAX_JSON_BYTES) {
    return { ok: false, error: '内容过大，请分次保存' };
  }
  return { ok: true };
}
