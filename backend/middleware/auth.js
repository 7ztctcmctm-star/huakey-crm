/**
 * @module middleware/auth
 * @description JWT 认证中间件
 *
 * 职责：
 * - 从 Cookie 或 Authorization Header 提取 JWT Token
 * - 校验 Token 签名、有效期、黑名单状态
 * - 从 DB 实时查询用户角色权限（不依赖 JWT payload 过期值）
 * - 注入 req.user 供后续中间件和路由使用
 *
 * 安全设计：
 * - Token 传递仅限 Cookie 和 Authorization Header，禁止 URL query
 * - Token 黑名单：登出时写入 SHA-256 哈希，过期自动清理
 * - 强制改密：must_change_password=1 时仅允许访问白名单路径
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/database');
const logger = require('../config/logger');
const ROLES = require('../config/roles');
const { ADMIN_ROLE_CODES } = ROLES;

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  logger.error('错误: JWT_SECRET 环境变量未设置，请在 .env 文件中配置');
  process.exit(1);
}

/**
 * 从请求中获取 Token（仅 Cookie 或 Authorization header，禁止 URL query string）
 * @param {import('express').Request} req - Express 请求对象
 * @returns {string|null} Token 字符串，未找到返回 null
 */
const getTokenFromRequest = (req) => {
  if (req.cookies && req.cookies.token) return req.cookies.token;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.split(' ')[1];
  return null;
};

/**
 * [P0-06 2026-10-23] 判断 Token 是否签发于密码变更之前
 *
 * 改密/管理员重置密码/强制改密都会写 sys_user.password_changed_at。
 * JWT 自带的 iat 是秒级；密码变更时间按秒比较，避免「同一秒内签发的新 token 被误杀」。
 *
 * @param {number} iat - JWT 签发时间（秒）
 * @param {Date|string|null} passwordChangedAt - sys_user.password_changed_at
 * @returns {boolean} true=旧 token，必须拒绝
 */
const isTokenStaleByPasswordChange = (iat, passwordChangedAt) => {
  if (!passwordChangedAt) return false;
  const changedAt = new Date(passwordChangedAt).getTime();
  if (!Number.isFinite(changedAt)) return false;
  return Math.floor(changedAt / 1000) > Number(iat || 0);
};

/**
 * JWT 认证中间件
 *
 * 验证流程：
 * 1. 提取 Token（Cookie 优先，其次 Authorization Header）
 * 2. jwt.verify 校验签名与有效期
 * 3. 检查 Token 黑名单（sys_token_blacklist，SHA-256 哈希比对）
 * 4. 从 DB 查询最新角色权限（sys_role），不依赖 JWT payload 过期值
 * 5. 查询 must_change_password 状态，首次登录强制改密
 * 6. 注入 req.user: { userId, username, roleId, roleCode, viewAll, manageAll, mustChangePassword }
 *
 * @param {import('express').Request} req - Express 请求对象
 * @param {import('express').Response} res - Express 响应对象
 * @param {import('express').NextFunction} next - Express next 函数
 * @returns {void}
 */
const authenticateToken = (req, res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({
      code: 401,
      message: '未提供访问令牌',
      data: null
    });
  }

  jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }, async (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          code: 401,
          message: '访问令牌已过期',
          data: null
        });
      }

      if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
          code: 401,
          message: '无效的访问令牌',
          data: null
        });
      }

      return res.status(401).json({
        code: 401,
        message: '令牌验证失败',
        data: null
      });
    }

    // 缺少 userId 的令牌无法定位账号（历史/伪造 token）——直接拒绝，且不查库
    if (!user || !user.userId) {
      return res.status(401).json({
        code: 401,
        message: '未登录',
        data: null
      });
    }

    // 检查token是否在黑名单中（已登出）+ 查询最新角色权限
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // 并行：黑名单检查 + 按 userId 查询「当前」用户与角色
      //
      // [P0-06 2026-10-23] 原实现用 JWT 里的 user.roleId 查角色：
      //   · 用户被软删除时 user 查询返回空行，status 校验被跳过（旧 token 继续可用）；
      //   · 角色被调整后，旧 token 仍按旧 roleId 取权限（降权不生效）。
      // 现统一按 userId 关联当前角色，角色/状态/软删任一变化立即生效。
      const [blacklistResult, userResult] = await Promise.all([
        pool.query(
          'SELECT 1 as blacklisted FROM sys_token_blacklist WHERE token_hash = ? AND expire_at > NOW() LIMIT 1',
          [tokenHash]
        ),
        pool.query(
          `SELECT u.id, u.username, u.role_id, u.status,
                  u.must_change_password, u.password_changed_at,
                  r.id AS fresh_role_id, r.code AS role_code,
                  COALESCE(r.view_all, 0) AS view_all,
                  COALESCE(r.manage_all, 0) AS manage_all
             FROM sys_user u
             LEFT JOIN sys_role r
               ON u.role_id = r.id AND r.deleted_at IS NULL AND r.status = 1
            WHERE u.id = ? AND u.deleted_at IS NULL`,
          [user.userId]
        )
      ]);

      const blacklistRows = Array.isArray(blacklistResult) && Array.isArray(blacklistResult[0]) ? blacklistResult[0] : [];
      if (blacklistRows.length > 0 && blacklistRows[0] && blacklistRows[0].blacklisted === 1) {
        return res.status(401).json({
          code: 401,
          message: '令牌已失效，请重新登录',
          data: null
        });
      }

      const userRows = Array.isArray(userResult) && Array.isArray(userResult[0]) ? userResult[0] : [];
      const freshUser = userRows[0];

      // 不存在 / 已软删除 ⇒ 旧 token 立即失效（fail-closed）
      if (!freshUser) {
        return res.status(401).json({
          code: 401,
          message: '账号不存在或已被禁用，请联系管理员',
          data: null
        });
      }

      // 已被禁用（status=0）的用户，已签发 JWT 立即失效
      if (freshUser.status !== 1) {
        return res.status(401).json({
          code: 401,
          message: '账号不存在或已被禁用，请联系管理员',
          data: null
        });
      }

      // 用户仍挂着一个已删除/停用的角色 ⇒ 拒绝，避免落到「无权限但可访问」的灰区
      if (freshUser.role_id !== null && freshUser.role_id !== undefined && freshUser.fresh_role_id === null) {
        return res.status(403).json({
          code: 403,
          message: '账号角色已失效，请联系管理员',
          data: null
        });
      }

      // 改密/重置密码后，签发时间早于 password_changed_at 的旧 token 一律失效
      if (isTokenStaleByPasswordChange(user.iat, freshUser.password_changed_at)) {
        return res.status(401).json({
          code: 401,
          message: '密码已修改，请重新登录',
          data: null
        });
      }

      const roleCode = freshUser.role_code || '';

      req.user = {
        userId: freshUser.id,
        username: freshUser.username,
        roleId: freshUser.role_id,
        roleCode: roleCode,
        viewAll: freshUser.view_all === 1 || ADMIN_ROLE_CODES.has(roleCode),
        manageAll: freshUser.manage_all === 1 || ADMIN_ROLE_CODES.has(roleCode),
        mustChangePassword: freshUser.must_change_password === 1
      };

      // 首次登录/重置密码后强制改密
      if (req.user.mustChangePassword) {
        const allowedPaths = ['/auth/force-change-password', '/auth/logout', '/auth/me', '/auth/refresh'];
        const requestPath = (req.baseUrl || '') + (req.path || '');
        const isAllowed = allowedPaths.some(ep => requestPath === ep || requestPath.endsWith(ep));
        if (!isAllowed) {
          return res.status(403).json({ code: 403, message: '请先修改初始密码后再操作', data: { mustChangePassword: true } });
        }
      }
    } catch (dbErr) {
      logger.error('[Auth] 数据库查询失败', dbErr);
      return res.status(500).json({
        code: 500,
        message: '令牌验证失败，请稍后重试',
        data: null
      });
    }

    next();
  });
};

/**
 * 签发 JWT Token
 * @param {object} user - 用户对象
 * @param {number} user.id - 用户 ID
 * @param {string} user.username - 用户名
 * @param {number} user.role_id - 角色 ID
 * @param {string} [user.role_code] - 角色 code
 * @param {number} [user.view_all] - 全局查看权限 (0/1)
 * @param {number} [user.manage_all] - 全局管理权限 (0/1)
 * @returns {string} JWT Token（有效期由 JWT_EXPIRES_IN 控制，默认 7d）
 */
const generateToken = (user) => {
  const payload = {
    userId: user.id,
    username: user.username,
    roleId: user.role_id,
    roleCode: user.role_code || '',
    viewAll: user.view_all === 1,
    manageAll: user.manage_all === 1
  };

  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

module.exports = {
  authenticateToken,
  generateToken,
  getTokenFromRequest,
  isTokenStaleByPasswordChange
};
