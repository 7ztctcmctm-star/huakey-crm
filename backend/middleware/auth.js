const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'huakey-crm-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!process.env.JWT_SECRET) {
  console.warn('警告: JWT_SECRET 环境变量未设置，使用默认密钥（仅限开发环境）');
  console.warn('请在 .env 文件中配置: JWT_SECRET=your_strong_secret_key_here');
  if (process.env.NODE_ENV === 'production') {
    console.error('生产环境必须设置 JWT_SECRET');
    process.exit(1);
  }
}

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      code: 401,
      message: '未提供访问令牌',
      data: null
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
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
  generateToken
};
