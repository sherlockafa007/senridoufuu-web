// 内存限流器（每 Worker 实例独立、重启清零）。管理员写操作频率极低，
// 这里只防脚本滥用，不追求跨实例精确 —— 有意比 functions/api 的 Firestore 限流简单。

export function createRateLimiter({ limit = 30, now = Date.now } = {}) {
  const buckets = new Map();
  return function isLimited(key) {
    const minute = Math.floor(now() / 60_000);
    const b = buckets.get(key);
    if (!b || b.minute !== minute) {
      buckets.set(key, { minute, count: 1 });
      return false;
    }
    b.count += 1;
    return b.count > limit;
  };
}
