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
export async function putFile(repo, path, text, message, token) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { sha } = await getFile(repo, path, token);
    const body = { message, content: b64encodeUtf8(text) };
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
