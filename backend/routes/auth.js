const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/database');
const { authenticateToken, generateToken, getTokenFromRequest } = require('../middleware/auth');
const { validate, Joi } = require('../middleware/validate');
const { checkPermission } = require('../middleware/permission');
const { logAction, getIpAddress } = require('../middleware/logger');
const authService = require('../services/authService');
const { authLimiter } = require('../middleware/rateLimiter');
const logger = require('../config/logger');

const JWT_SECRET = process.env.JWT_SECRET;

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: 认证管理
 *     description: 登录、登出、用户信息、密码管理
 *
 * /api/auth/captcha:
 *   get:
 *     summary: 获取验证码
 *     tags: [认证管理]
 *     security: []
 *     responses:
 *       200:
 *         description: 返回 SVG 验证码和 key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     key: { type: string, description: 验证码 key }
 *                     svg: { type: string, description: SVG 验证码 }
 *
 * /api/auth/login:
 *   post:
 *     summary: 用户登录
 *     tags: [认证管理]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password, captcha, captchaKey]
 *             properties:
 *               username: { type: string, example: admin }
 *               password: { type: string, example: huakey123 }
 *               captcha: { type: string, example: '0000' }
 *               captchaKey: { type: string }
 *     responses:
 *       200:
 *         description: 登录成功，返回 token 和 userInfo
 *       400:
 *         description: 验证码或用户名密码错误
 *
 * /api/auth/logout:
 *   post:
 *     summary: 用户登出
 *     tags: [认证管理]
 *     responses:
 *       200:
 *         description: 登出成功
 *
 * /api/auth/me:
 *   get:
 *     summary: 获取当前用户信息（验证登录状态）
 *     tags: [认证管理]
 *     responses:
 *       200:
 *         description: 返回当前用户信息
 *       401:
 *         description: 未登录或 token 过期
 */

const isProduction = process.env.NODE_ENV === 'production';

// --- Joi schemas ---

const loginSchema = Joi.object({
  username: Joi.string().required().min(2).max(50),
  password: Joi.string().required().max(200),
  captcha: Joi.string().required().length(4),
  captchaKey: Joi.string().required()
});

const registerSchema = Joi.object({
  username: Joi.string().required().min(2).max(50).alphanum(),
  password: Joi.string().required().max(200).pattern(authService.PASSWORD_PATTERN).message(authService.PASSWORD_MESSAGE),
  real_name: Joi.string().max(50).allow('', null)
});

const updateProfileSchema = Joi.object({
  real_name: Joi.string().max(50).allow('', null),
  phone: Joi.string().pattern(/^\+?\d{7,20}$/).allow('', null),
  email: Joi.string().email().max(200).allow('', null)
});

const changePasswordSchema = Joi.object({
  old_password: Joi.string().required(),
  new_password: Joi.string().required().max(200).pattern(authService.PASSWORD_PATTERN).message(authService.PASSWORD_MESSAGE)
});

const logoutSchema = Joi.object({});
const refreshSchema = Joi.object({});

// 0. 获取验证码
router.get('/captcha', async (req, res) => {
  const { key, svg } = await authService.getCaptcha();
  res.json({ code: 200, message: 'success', data: { key, svg } });
});

// 本地开发环境跳过验证码（前置中间件，必须在JOI校验之前）
router.use('/login', (req, res, next) => {
  if (process.env.NODE_ENV !== 'production' && process.env.SKIP_CAPTCHA === 'true') {
    req.body.captchaKey = 'dev';
    req.body.captcha = 'dev1';
  }
  next();
});

// 1. 登录接口（单独挂载登录限流，避免影响验证码刷新）
router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { username, password, captcha, captchaKey } = req.body;
    const ip = getIpAddress(req);

    // 本地开发跳过验证码校验
    if (process.env.NODE_ENV !== 'production' && process.env.SKIP_CAPTCHA === 'true') {
      authService.captchaStore.set('dev', { code: 'dev1', expires: Date.now() + 3600000 });
    }

    // 验证码校验
    const captchaResult = await authService.verifyCaptcha(captchaKey, captcha);
    if (!captchaResult.valid) {
      return res.status(400).json({ code: 400, message: captchaResult.message, data: null });
    }

    // 登录
    let user;
    try {
      user = await authService.login(pool, { username, password });
    } catch (error) {
      await logAction({
        module: '系统管理', action: '登录', method: 'POST', url: '/api/auth/login',
        params: { username }, ipAddress: ip, userId: null, userName: username,
        description: `登录失败：${error.message}`, status: 0, errorMsg: error.message
      });
      return res.status(error.code || 500).json({ code: error.code || 500, message: error.message, data: null });
    }

    // 生成JWT token
    const token = generateToken(user);

    // 更新最后登录信息
    await authService.updateLastLogin(pool, user.id, ip);

    // 记录登录成功日志
    await logAction({
      module: '系统管理', action: '登录', method: 'POST', url: '/api/auth/login',
      params: { username }, ipAddress: ip, userId: user.id, userName: user.real_name,
      description: `${user.real_name} 登录成功`, status: 1
    });

    // 设置httpOnly cookie
    // 仅在生产环境且请求为 HTTPS 时启用 secure，避免 HTTP 部署下浏览器不发送 cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction && req.secure,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      code: 200,
      message: '登录成功',
      data: {
        token,
        userInfo: {
          id: user.id,
          username: user.username,
          roleId: user.role_id
        }
      }
    });

  } catch (error) {
    logger.error('[认证] 登录错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '登录失败，请稍后重试', data: null });
  }
});

// 2. 登出接口
router.post('/logout', validate(logoutSchema), async (req, res) => {
  try {
    const ip = getIpAddress(req);
    const token = getTokenFromRequest(req);

    const { userId, username } = await authService.logout(pool, token);
    if (userId) {
      logAction({
        module: '系统管理', action: '登出', method: 'POST', url: '/api/auth/logout',
        params: null, ipAddress: ip, userId, userName: username,
        description: `${username} 登出成功`, status: 1
      });
    }
  } catch (error) {
    // logout 的数据库操作失败不影响清除 cookie 和返回成功
    // 用户端应始终能正常登出
    logger.error('[认证] 登出记录失败（已忽略）:', { error: error.message, traceId: req.traceId || 'N/A' });
  }

  res.clearCookie('token', {
    httpOnly: true,
    secure: isProduction && req.secure,
    sameSite: 'strict'
  });

  res.json({ code: 200, message: '登出成功', data: null });
});

// 3. 获取当前用户信息（用于前端验证登录状态）
// [权限说明] 个人登录态接口，仅需认证，无需业务权限码
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const data = await authService.getMe(pool, req.user.userId);
    if (!data) {
      return res.status(401).json({ code: 401, message: '用户不存在或已禁用', data: null });
    }

    // 检查 token 中的权限是否与 DB 一致，不一致则签发新 token
    const tokenNeedsRefresh = req.user.viewAll !== data.viewAll || req.user.manageAll !== data.manageAll;

    if (tokenNeedsRefresh) {
      const newToken = generateToken({ id: data.id, username: data.username, role_id: data.roleId, view_all: data.viewAll ? 1 : 0, manage_all: data.manageAll ? 1 : 0 });
      res.cookie('token', newToken, {
        httpOnly: true,
        secure: isProduction && req.secure,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
      res.set('X-Token-Refresh', 'true');
      data.token = newToken;
    }

    res.json({ code: 200, message: '获取成功', data });
  } catch (error) {
    logger.error('[认证] 获取用户信息错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '获取用户信息失败', data: null });
  }
});

// 4. 注册接口（仅管理员可用，禁止公开注册）
// [权限说明] 需要 user:create 权限
router.post('/register', authenticateToken, checkPermission('user:create'), validate(registerSchema), async (req, res) => {
  try {
    const result = await authService.register(pool, req.body);
    res.json({ code: 200, message: '用户创建成功', data: result });
  } catch (error) {
    logger.error('[认证] 注册错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(error.code || 500).json({ code: error.code || 500, message: error.message || '注册失败，请稍后重试', data: null });
  }
});

// 4. 获取用户信息
// [权限说明] 个人资料接口，仅需认证，无需业务权限码
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await authService.getProfile(pool, req.user.userId);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在', data: null });
    }

    res.json({ code: 200, message: '获取用户信息成功', data: user });
  } catch (error) {
    logger.error('[认证] 获取用户信息错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '获取用户信息失败', data: null });
  }
});

// 5. 修改个人信息
// [权限说明] 个人资料修改接口，仅需认证，无需业务权限码
router.post('/update-profile', authenticateToken, validate(updateProfileSchema), async (req, res) => {
  try {
    await authService.updateProfile(pool, req.user.userId, req.body);
    res.json({ code: 200, message: '个人信息更新成功', data: null });
  } catch (error) {
    logger.error('[认证] 更新个人信息错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(error.code || 500).json({ code: error.code || 500, message: error.message || '更新失败', data: null });
  }
});

// 6. 修改密码
// [权限说明] 个人密码修改接口，仅需认证，无需业务权限码
router.post('/change-password', authenticateToken, validate(changePasswordSchema), async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    await authService.changePassword(pool, req.user.userId, old_password, new_password);
    res.json({ code: 200, message: '密码修改成功，请重新登录', data: null });
  } catch (error) {
    logger.error('[认证] 修改密码错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(error.code || 500).json({ code: error.code || 500, message: error.message || '修改密码失败', data: null });
  }
});

// 7. 刷新 JWT token（接受过期但签名有效的 token，并将其加入黑名单）
// [权限说明] 个人登录态接口，仅需提供旧 token，无需业务权限码
router.post('/refresh', validate(refreshSchema), async (req, res) => {
  try {
    const oldToken = getTokenFromRequest(req);
    if (!oldToken) {
      return res.status(401).json({ code: 401, message: '未提供访问令牌', data: null });
    }

    // 验证 token 签名，允许已过期
    let decoded;
    try {
      decoded = jwt.verify(oldToken, JWT_SECRET, { ignoreExpiration: true });
    } catch (err) {
      return res.status(401).json({ code: 401, message: '无效的访问令牌', data: null });
    }

    // 检查 token 是否已在黑名单
    const tokenHash = crypto.createHash('sha256').update(oldToken).digest('hex');
    const [blacklistRows] = await pool.query(
      'SELECT 1 as blacklisted FROM sys_token_blacklist WHERE token_hash = ? AND expire_at > NOW() LIMIT 1',
      [tokenHash]
    );
    if (blacklistRows.length > 0) {
      return res.status(401).json({ code: 401, message: '令牌已失效，请重新登录', data: null });
    }

    // 查询用户及最新角色权限
    const [users] = await pool.query(
      `SELECT u.id, u.username, u.role_id,
              COALESCE(r.code, '') as role_code,
              COALESCE(r.view_all, 0) as view_all,
              COALESCE(r.manage_all, 0) as manage_all
       FROM sys_user u
       LEFT JOIN sys_role r ON u.role_id = r.id
       WHERE u.id = ? AND u.status = 1`,
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({ code: 401, message: '用户不存在或已禁用', data: null });
    }

    const user = users[0];

    // 将旧 token 加入黑名单
    await pool.query(
      `INSERT INTO sys_token_blacklist (token_hash, expire_at)
       VALUES (?, DATE_ADD(NOW(), INTERVAL 7 DAY))
       ON DUPLICATE KEY UPDATE expire_at = VALUES(expire_at)`,
      [tokenHash]
    );

    // 签发新 token
    const newToken = generateToken(user);

    // 同步刷新 httpOnly cookie
    res.cookie('token', newToken, {
      httpOnly: true,
      secure: isProduction && req.secure,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      code: 200,
      message: 'Token 已刷新',
      data: { token: newToken }
    });
  } catch (error) {
    logger.error('[认证] Token 刷新失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: 'Token 刷新失败', data: null });
  }
});

module.exports = router;
