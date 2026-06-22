const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('错误: JWT_SECRET 环境变量未设置，请在 .env 文件中配置');
  process.exit(1);
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// 从请求中获取token（优先cookie > Authorization header）
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

    // 检查token是否在黑名单中（已登出）
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const [blacklisted] = await pool.query(
        'SELECT id FROM sys_token_blacklist WHERE token_hash = ? AND expire_at > NOW()',
        [tokenHash]
      );
      if (blacklisted.length > 0) {
        return res.status(401).json({
          code: 401,
          message: '令牌已失效，请重新登录',
          data: null
        });
      }
    } catch (dbErr) {
      console.error('[认证] 黑名单查询失败:', dbErr.message);
      // 黑名单查询失败不阻断请求，降级放行
    }

    req.user = {
      userId: user.userId,
      username: user.username,
      roleId: user.roleId,
      viewAll: user.viewAll === true || [1].includes(user.roleId),
      manageAll: user.manageAll === true || [1].includes(user.roleId)
    };

    next();
  });
};

const generateToken = (user) => {
  const payload = {
    userId: user.id,
    username: user.username,
    roleId: user.role_id,
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
