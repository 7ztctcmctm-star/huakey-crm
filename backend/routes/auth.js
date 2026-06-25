const express = require('express');
const pool = require('../config/database');
const { authenticateToken, generateToken, getTokenFromRequest } = require('../middleware/auth');
const ROLES = require('../config/roles');
const { validate, Joi } = require('../middleware/validate');
const { logAction, getIpAddress } = require('../middleware/logger');
const authService = require('../services/authService');

const router = express.Router();

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

// 0. 获取验证码
router.get('/captcha', (req, res) => {
  const { key, svg } = authService.getCaptcha();
  res.json({ code: 200, data: { key, svg } });
});

// 本地开发环境跳过验证码（前置中间件，必须在JOI校验之前）
router.use('/login', (req, res, next) => {
  if (process.env.NODE_ENV !== 'production' && process.env.SKIP_CAPTCHA === 'true') {
    req.body.captchaKey = 'dev';
    req.body.captcha = 'dev1';
  }
  next();
});

// 1. 登录接口
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { username, password, captcha, captchaKey } = req.body;
    const ip = getIpAddress(req);

    // 本地开发跳过验证码校验
    if (process.env.NODE_ENV !== 'production' && process.env.SKIP_CAPTCHA === 'true') {
      authService.captchaStore.set('dev', { code: 'dev1', expires: Date.now() + 3600000 });
    }

    // 验证码校验
    const captchaResult = authService.verifyCaptcha(captchaKey, captcha);
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
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
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
    console.error('[认证] 登录错误:', error);
    res.status(500).json({ code: 500, message: '登录失败，请稍后重试', data: null });
  }
});

// 2. 登出接口
router.post('/logout', validate(logoutSchema), async (req, res) => {
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

  res.clearCookie('token', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict'
  });

  res.json({ code: 200, message: '登出成功', data: null });
});

// 3. 获取当前用户信息（用于前端验证登录状态）
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
        secure: isProduction,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
      res.set('X-Token-Refresh', 'true');
      data.token = newToken;
    }

    res.json({ code: 200, message: '获取成功', data });
  } catch (error) {
    console.error('[认证] 获取用户信息错误:', error);
    res.status(500).json({ code: 500, message: '获取用户信息失败', data: null });
  }
});

// 4. 注册接口（仅管理员可用，禁止公开注册）
router.post('/register', authenticateToken, validate(registerSchema), async (req, res) => {
  try {
    if (!(req.user.manageAll || req.user.roleId === ROLES.ADMIN)) {
      return res.status(403).json({ code: 403, message: '仅管理员可创建账号', data: null });
    }

    const result = await authService.register(pool, req.body);
    res.json({ code: 200, message: '用户创建成功', data: result });
  } catch (error) {
    console.error('[认证] 注册错误:', error);
    res.status(error.code || 500).json({ code: error.code || 500, message: error.message || '注册失败，请稍后重试', data: null });
  }
});

// 4. 获取用户信息
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await authService.getProfile(pool, req.user.userId);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在', data: null });
    }

    res.json({ code: 200, message: '获取用户信息成功', data: user });
  } catch (error) {
    console.error('[认证] 获取用户信息错误:', error);
    res.status(500).json({ code: 500, message: '获取用户信息失败', data: null });
  }
});

// 5. 修改个人信息
router.post('/update-profile', authenticateToken, validate(updateProfileSchema), async (req, res) => {
  try {
    await authService.updateProfile(pool, req.user.userId, req.body);
    res.json({ code: 200, message: '个人信息更新成功', data: null });
  } catch (error) {
    console.error('[认证] 更新个人信息错误:', error);
    res.status(error.code || 500).json({ code: error.code || 500, message: error.message || '更新失败', data: null });
  }
});

// 6. 修改密码
router.post('/change-password', authenticateToken, validate(changePasswordSchema), async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    await authService.changePassword(pool, req.user.userId, old_password, new_password);
    res.json({ code: 200, message: '密码修改成功，请重新登录', data: null });
  } catch (error) {
    console.error('[认证] 修改密码错误:', error);
    res.status(error.code || 500).json({ code: error.code || 500, message: error.message || '修改密码失败', data: null });
  }
});

module.exports = router;
