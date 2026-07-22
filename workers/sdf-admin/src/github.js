// GitHub Contents API 薄封装。只做 IO，不含业务判断。

const GH = 'https://api.github.com';

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'sdf-admin-worker', // GitHub API 必须带 UA
  };
}

function b64encodeUtf8(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  const CHUNK = 8192; // 分块防调用栈溢出
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function b64decodeUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// 读文件。文件不存在时返回 { text: null, sha: null }（首次保存场景）。
export async function getFile(repo, path, token) {
  const res = await fetch(`${GH}/repos/${repo}/contents/${path}`, { headers: ghHeaders(token) });
  if (res.status === 404) return { text: null, sha: null };
  if (!res.ok) throw new Error(`GitHub 读取失败（${res.status}）`);
  const data = await res.json();
  return { text: b64decodeUtf8(data.content), sha: data.sha };
}

// 写文件：每次现取最新 sha 再提交；409/422 视为并发冲突，重取一次再试。
// content 默认当文本处理（UTF-8→base64）；alreadyBase64=true 时按图片等二进制数据处理，
// content 本身已经是算好的 base64 字符串，直接透传给 GitHub API。
export async function putFile(repo, path, content, message, token, { alreadyBase64 = false } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { sha } = await getFile(repo, path, token);
    const body = { message, content: alreadyBase64 ? content : b64encodeUtf8(content) };
    if (sha) body.sha = sha;
    const res = await fetch(`${GH}/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      return { commitSha: data.commit.sha };
    }
    if (res.status !== 409 && res.status !== 422) {
      let detail = '';
      try {
        detail = (await res.json()).message || '';
      } catch {
        /* 响应非 JSON 时只报状态码 */
      }
      throw new Error(`GitHub 写入失败（${res.status}${detail ? `：${detail}` : ''}）`);
    }
  }
  throw new Error('保存冲突，请刷新页面重试');
}

// 删除文件（下架文章用）。文件已不存在时视为已删除，幂等返回。
export async function deleteFile(repo, path, message, token) {
  const { sha } = await getFile(repo, path, token);
  if (!sha) return { deleted: false };
  const res = await fetch(`${GH}/repos/${repo}/contents/${path}`, {
    method: 'DELETE',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).message || '';
    } catch {
      /* 响应非 JSON 时只报状态码 */
    }
    throw new Error(`GitHub 删除失败（${res.status}${detail ? `：${detail}` : ''}）`);
  }
  return { deleted: true };
}
