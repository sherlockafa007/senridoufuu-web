// 统一的访客统计写入：同一身份同一天同一工具页最多一条记录（确定性ID去重，merge更新）。
// ID 计算在 track-visit-id.js（纯函数，有单测）；这里是接 Firebase 的装配层。
//
// 用法：
//   import { trackVisit, updateVisitDuration } from '/js/shared/track-visit.js';
//   const docId = trackVisit({ db, email, anonId, page: 'translation', device: 'desktop' });
//   // 页面离开时：
//   updateVisitDuration({ db, docId, duration: 秒数 });
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { visitDocId } from './track-visit-id.js';

// 6个月，配合 Firestore TTL 策略（expireAt 字段）自动清理过期记录。
const RETENTION_MS = 6 * 30 * 24 * 60 * 60 * 1000;

export function trackVisit({ db, email, anonId, page, device }) {
  const identity = email || anonId || 'unknown';
  const docId = visitDocId(identity, page);
  setDoc(
    doc(db, 'visits', docId),
    {
      email: email || null,
      anonId: anonId || null,
      page,
      device,
      timestamp: serverTimestamp(),
      expireAt: Timestamp.fromMillis(Date.now() + RETENTION_MS),
    },
    { merge: true },
  ).catch(() => {});
  return docId;
}

export function updateVisitDuration({ db, docId, duration }) {
  if (!docId) return;
  updateDoc(doc(db, 'visits', docId), {
    duration,
    expireAt: Timestamp.fromMillis(Date.now() + RETENTION_MS),
  }).catch(() => {});
}
