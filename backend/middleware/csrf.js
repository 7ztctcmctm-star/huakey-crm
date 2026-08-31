/**
 * CSRF 防护中间件（double-submit cookie 模式）
 *
 * 说明：
 * - 认证已迁移到 httpOnly Cookie，本中间件作为额外的 CSRF 防护层
 * - 服务端设置一个非 httpOnly 的 csrf-token Cookie
 * - 前端在发送非 GET 请求时，从 document.cookie 读取并放入 X-CSRF-Token header
 * - 服务端比对 header 与 cookie 是否一致，不一致则拒绝
 * - sameSite=strict 已能防御大多数 CSRF，本层作为纵深防御
 */

const crypto = require('crypto');

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';

// 这些接口本身带有验证码或 token 刷新机制，跳过 CSRF 校验
const SKIP_CSRF_PATHS = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/register',
  // 客户端性能指标上报：前端用 navigator.sendBeacon 发送，无法携带 X-CSRF-Token 头；
  // 该接口仅做性能指标落库（无副作用），予以豁免
  '/api/v1/metrics/client'
]);

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function setCsrfCookie(req, res, token) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: isProduction && req.secure,
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function csrfProtection(req, res, next) {
  // GET/HEAD/OPTIONS 请求不修改状态，无需校验；若还没有 csrf cookie 则设置一个
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (!req.cookies || !req.cookies[CSRF_COOKIE_NAME]) {
      const token = generateCsrfToken();
      setCsrfCookie(req, res, token);
    }
    return next();
  }

  // 登录/注册/刷新/登出本身有验证码或黑名单机制，跳过 CSRF 校验
  if (SKIP_CSRF_PATHS.has(req.originalUrl)) {
    return next();
  }

  // 测试环境跳过 CSRF 校验，避免集成测试需要额外维护 double-submit cookie
  // 生产/开发环境仍会严格执行校验
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const cookieToken = req.cookies && req.cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      code: 403,
      message: 'CSRF token 校验失败，请重新登录',
      data: null
    });
  }

  next();
}

module.exports = {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateCsrfToken,
  setCsrfCookie,
  csrfProtection
};
