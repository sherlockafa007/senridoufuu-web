// 唯一一份管理员名单。加减管理员只改这里。
export const ADMINS = ['sherlockafa@gmail.com', 'yuki.minami@senridf.com'];

export function isAdmin(user) {
  return !!user && ADMINS.includes(user.email);
}
