/**
 * CSRF double-submit 工具
 *
 * 后端 `backend/middleware/csrf.js` 在登录/刷新及任意 GET 请求时下发非 httpOnly 的
 * `csrf-token` Cookie，要求所有写请求携带同值 `X-CSRF-Token` 头。
 * axios 拦截器（utils/request.js）与 el-upload 直传都必须使用同一读取逻辑，
 * 避免出现「axios 请求正常、直传 403」的分裂实现。
 */

export const CSRF_COOKIE_NAME = 'csrf-token'

/**
 * 从 document.cookie 中读取指定名称的 cookie 值
 * @param {string} name
 * @returns {string|null}
 */
export function getCookie(name) {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + encodeURIComponent(name).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

/** 读取当前 CSRF token（Cookie 不存在时返回 null） */
export function getCsrfToken() {
  return getCookie(CSRF_COOKIE_NAME)
}
