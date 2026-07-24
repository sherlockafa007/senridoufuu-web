// 统一登录门控：监听登录态、判定状态、渲染遮罩提示、分发回调。
// 判定逻辑本身在 auth-gate-state.js（纯函数，有单测）；这里是操作 DOM 和 Firebase 的装配层。
//
// 用法：
//   import { auth, db } from '/js/shared/firebase-init.js';
//   import { mountAuthGate } from '/js/shared/auth-gate.js';
//   mountAuthGate({ auth, db, onApproved: (user) => {...}, onAdmin: (user) => {...} });
//
// 页面里需要一个 id="auth-gate" 的遮罩元素；通过后该元素会被移除。
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { ADMINS } from './admins.js';
import { resolveGateState } from './auth-gate-state.js';

function renderMessage(gate, { icon, title, body }) {
  gate.innerHTML = `<div style="text-align:center;max-width:340px;padding:32px 24px;font-family:sans-serif"><div style="font-size:2.5rem;margin-bottom:16px">${icon}</div><h2 style="font-size:18px;font-weight:600;margin-bottom:12px;color:#1f2937">${title}</h2><p style="color:#6b7280;font-size:13px;line-height:1.8">${body}</p><a href="/account.html" style="display:inline-block;margin-top:20px;color:#9ca3af;font-size:12px;text-decoration:none">← 返回</a></div>`;
}

const MESSAGES = {
  pending: { icon: '⏳', title: '审核中', body: '账号正在审核中，审核通过后即可使用。' },
  disabled: { icon: '🚫', title: '账号已停用', body: '您的账号已被停用，请联系管理员。' },
  error: { icon: '⚠️', title: '出错了', body: '页面加载时出现问题，请刷新页面重试。' },
};

export function mountAuthGate({ auth, db, gateElId = 'auth-gate', onApproved, onAdmin }) {
  return onAuthStateChanged(auth, async (user) => {
    const gate = document.getElementById(gateElId);
    try {
      if (!user) {
        window.location.replace('/account.html');
        return;
      }
      localStorage.setItem('sdf_user_email', user.email);

      const isAdminUser = ADMINS.includes(user.email);
      let status;
      if (!isAdminUser) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        status = snap.data()?.status || 'pending';
      }

      const state = resolveGateState({ user, isAdminUser, status });

      if (state === 'admin') {
        gate?.remove();
        (onAdmin || onApproved)?.(user);
        return;
      }
      if (state === 'approved') {
        gate?.remove();
        onApproved?.(user);
        return;
      }
      if (gate) renderMessage(gate, MESSAGES[state]);
    } catch (err) {
      console.error('[auth-gate]', err);
      if (gate) renderMessage(gate, MESSAGES.error);
    }
  });
}
