// 登录门控的纯判定逻辑：不碰 DOM、不碰 Firebase，只根据已知信息决定当前应该
// 进入哪个状态。零依赖，可以被 node --test 直接测试。
// 实际接 Firebase 事件、操作 DOM 的装配层在同目录的 auth-gate.js。
export function resolveGateState({ user, isAdminUser, status }) {
  if (!user) return 'guest';
  if (isAdminUser) return 'admin';
  if (status === 'approved') return 'approved';
  if (status === 'disabled') return 'disabled';
  return 'pending';
}
