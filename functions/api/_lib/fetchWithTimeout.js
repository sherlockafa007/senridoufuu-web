// 给对外部服务（Qwen/Deepgram）的请求包一层超时。
// 只对"发出请求到收到首个响应"计时——一旦 fetch 的 Promise 落定（拿到 Response 对象，
// 哪怕是流式响应刚建立连接的那一刻），计时器就被清除，不影响后续读取正文/流的耗时。
// 长文档翻译/文书分析这类耗时久的调用不受影响；真正卡死无响应的连接会被按时 abort。
export async function fetchWithTimeout(url, options = {}, timeoutMs = 30000, fetchFn = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
