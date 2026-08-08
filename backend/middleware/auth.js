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

  jwt.verify(token, JWT_SECRET, async (err, user) => {
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

    // 检查token是否在黑名单中（已登出）+ 查询最新角色权限
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // 并行：黑名单检查 + 角色权限查询（含 role_code）
      const [blacklistResult, roleResult, userResult] = await Promise.all([
        pool.query(
          'SELECT 1 as blacklisted FROM sys_token_blacklist WHERE token_hash = ? AND expire_at > NOW() LIMIT 1',
          [tokenHash]
        ),
        pool.query(
          'SELECT COALESCE(view_all, 0) as view_all, COALESCE(manage_all, 0) as manage_all, code as role_code FROM sys_role WHERE id = ?',
          [user.roleId]
        ),
        pool.query(
          'SELECT must_change_password FROM sys_user WHERE id = ?',
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

      // 从 DB 获取最新权限和状态，不依赖 token 中的过期值
      const roleRows = Array.isArray(roleResult) && Array.isArray(roleResult[0]) ? roleResult[0] : [];
      const userRows = Array.isArray(userResult) && Array.isArray(userResult[0]) ? userResult[0] : [];
      const freshRole = roleRows[0] || {};
      const freshUser = userRows[0] || {};

      // roleCode 优先使用 DB 新鲜值，fallback 到 JWT 中的值
      const roleCode = freshRole.role_code || user.roleCode || '';

      req.user = {
        userId: user.userId,
        username: user.username,
        roleId: user.roleId,
        roleCode: roleCode,
        viewAll: freshRole.view_all === 1 || ADMIN_ROLE_CODES.has(roleCode),
        manageAll: freshRole.manage_all === 1 || ADMIN_ROLE_CODES.has(roleCode),
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
  getTokenFromRequest
};
