// 访问统计去重用的确定性文档ID：同一身份（登录邮箱或匿名访客ID）同一天同一工具页
// 只对应一个ID，写入时用这个ID做 setDoc merge 就能自然去重，不需要额外查询判断。
// 零依赖，可被 node --test 直接测试；实际写 Firestore 的装配层在同目录 track-visit.js。
export function visitDocId(identity, page, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return `${identity}_${page}_${day}`;
}
