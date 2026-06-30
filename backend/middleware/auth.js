const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/database');
const ROLES = require('../config/roles');
const { ADMIN_ROLE_CODES } = ROLES;

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('错误: JWT_SECRET 环境变量未设置，请在 .env 文件中配置');
  process.exit(1);
}
// 从请求中获取 token（仅 Cookie 或 Authorization header，禁止 URL query string）
const getTokenFromRequest = (req) => {
  if (req.cookies && req.cookies.token) return req.cookies.token;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.split(' ')[1];
  return null;
};

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
      const [blacklistResult, roleResult] = await Promise.all([
        pool.query(
          'SELECT 1 as blacklisted FROM sys_token_blacklist WHERE token_hash = ? AND expire_at > NOW() LIMIT 1',
          [tokenHash]
        ),
        pool.query(
          'SELECT COALESCE(view_all, 0) as view_all, COALESCE(manage_all, 0) as manage_all, code as role_code FROM sys_role WHERE id = ?',
          [user.roleId]
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

      // 从 DB 获取最新权限，不依赖 token 中的过期值
      const roleRows = Array.isArray(roleResult) && Array.isArray(roleResult[0]) ? roleResult[0] : [];
      const freshRole = roleRows[0] || {};

      // roleCode 优先使用 DB 新鲜值，fallback 到 JWT 中的值
      const roleCode = freshRole.role_code || user.roleCode || '';

      req.user = {
        userId: user.userId,
        username: user.username,
        roleId: user.roleId,
        roleCode: roleCode,
        viewAll: freshRole.view_all === 1 || ADMIN_ROLE_CODES.has(roleCode),
        manageAll: freshRole.manage_all === 1 || ADMIN_ROLE_CODES.has(roleCode)
      };
    } catch (dbErr) {
      console.error('[Auth] 数据库查询失败', dbErr);
      return res.status(500).json({
        code: 500,
        message: '令牌验证失败，请稍后重试',
        data: null
      });
    }

    next();
  });
};

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
