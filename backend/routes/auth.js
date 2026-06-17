const express = require('express');
const bcrypt = require('bcryptjs');
const svgCaptcha = require('svg-captcha');
const pool = require('../config/database');
const { authenticateToken, generateToken, getTokenFromRequest } = require('../middleware/auth');
const ROLES = require('../config/roles');
const { validate, Joi } = require('../middleware/validate');
const { logAction, getIpAddress } = require('../middleware/logger');
const { getUserPermissions, getMenuPermissions, getDataPermissions } = require('../services/permissionService');

const router = express.Router();

// 验证码存储（key: captcha_key, value: {code, expires}）
const captchaStore = new Map();

// 定期清理过期验证码（每5分钟）
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of captchaStore) {
    if (val.expires < now) captchaStore.delete(key);
  }
}, 5 * 60 * 1000);

// [安全修复] 密码正则：至少8位，含大小写字母和数字
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PASSWORD_MESSAGE = '密码至少8位，需包含大写字母、小写字母和数字';

const loginSchema = Joi.object({
  username: Joi.string().required().min(2).max(50),
  password: Joi.string().required().max(200),
  captcha: Joi.string().required().length(4),
  captchaKey: Joi.string().required()
});

const registerSchema = Joi.object({
  username: Joi.string().required().min(2).max(50).alphanum(),
  password: Joi.string().required().max(200).pattern(PASSWORD_PATTERN).message(PASSWORD_MESSAGE),
  real_name: Joi.string().max(50).allow('', null)
});

const updateProfileSchema = Joi.object({
  real_name: Joi.string().max(50).allow('', null),
  phone: Joi.string().pattern(/^\+?\d{7,20}$/).allow('', null),
  email: Joi.string().email().max(200).allow('', null)
});

const changePasswordSchema = Joi.object({
  old_password: Joi.string().required(),
  new_password: Joi.string().required().max(200).pattern(PASSWORD_PATTERN).message(PASSWORD_MESSAGE)
});

// 0. 获取验证码
router.get('/captcha', (req, res) => {
  const captcha = svgCaptcha.create({
    size: 4,
    ignoreChars: '0o1il',
    noise: 2,
    color: true,
    background: '#f5f5f7'
  });

  const key = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  captchaStore.set(key, {
    code: captcha.text.toLowerCase(),
    expires: Date.now() + 5 * 60 * 1000 // 5分钟过期
  });

  res.json({
    code: 200,
    data: {
      key: key,
      svg: captcha.data  // SVG字符串，前端直接渲染
    }
  });
});

// 1. 登录接口
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { username, password, captcha, captchaKey } = req.body;
    const ip = getIpAddress(req);

    // 验证码校验
    const stored = captchaStore.get(captchaKey);
    if (!stored || stored.expires < Date.now()) {
      captchaStore.delete(captchaKey);
      return res.status(400).json({
        code: 400,
        message: '验证码已过期，请刷新',
        data: null
      });
    }
    if (stored.code !== captcha.toLowerCase()) {
      captchaStore.delete(captchaKey);
      return res.status(400).json({
        code: 400,
        message: '验证码错误',
        data: null
      });
    }
    captchaStore.delete(captchaKey); // 一次性使用

    // 参数验证
    if (!username || !password) {
      await logAction({
        module: '系统管理', action: '登录', method: 'POST', url: '/api/auth/login',
        params: { username }, ipAddress: ip, userId: null, userName: username,
        description: '登录失败：用户名或密码为空', status: 0, errorMsg: '用户名和密码不能为空'
      });
      return res.status(400).json({
        code: 400,
        message: '用户名和密码不能为空',
        data: null
      });
    }

    // 查询用户（含角色权限）
    const [users] = await pool.query(
      `SELECT u.id, u.username, u.password, u.real_name, u.phone, u.email,
              u.dept_id, u.role_id, u.status,
              COALESCE(r.view_all, 0) as view_all,
              COALESCE(r.manage_all, 0) as manage_all
       FROM sys_user u
       LEFT JOIN sys_role r ON u.role_id = r.id
       WHERE u.username = ? AND u.status = 1`,
      [username]
    );

    if (users.length === 0) {
      await logAction({
        module: '系统管理', action: '登录', method: 'POST', url: '/api/auth/login',
        params: { username }, ipAddress: ip, userId: null, userName: username,
        description: '登录失败：用户名不存在', status: 0, errorMsg: '用户名或密码错误'
      });
      return res.status(401).json({
        code: 401,
        message: '用户名或密码错误',
        data: null
      });
    }

    const user = users[0];

    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      await logAction({
        module: '系统管理', action: '登录', method: 'POST', url: '/api/auth/login',
        params: { username }, ipAddress: ip, userId: user.id, userName: user.real_name,
        description: '登录失败：密码错误', status: 0, errorMsg: '用户名或密码错误'
      });
      return res.status(401).json({
        code: 401,
        message: '用户名或密码错误',
        data: null
      });
    }

    // 生成JWT token
    const token = generateToken(user);

    // 获取用户权限
    const permissions = await getUserPermissions(user.id, user.role_id);
    const menus = await getMenuPermissions(user.role_id);
    const dataPermissions = await getDataPermissions(user.role_id);

    // 更新最后登录信息
    await pool.query(
      'UPDATE sys_user SET last_login_time = NOW(), last_login_ip = ? WHERE id = ?',
      [ip, user.id]
    );

    // 记录登录成功日志
    await logAction({
      module: '系统管理', action: '登录', method: 'POST', url: '/api/auth/login',
      params: { username }, ipAddress: ip, userId: user.id, userName: user.real_name,
      description: `${user.real_name} 登录成功`, status: 1
    });

    // 设置httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: false,        // 内网HTTP，生产HTTPS时改为true
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000  // 7天
    });

    // 返回结果（token仍在body中保持兼容）
    res.json({
      code: 200,
      message: '登录成功',
      data: {
        token,
        userInfo: {
          id: user.id,
          username: user.username,
          realName: user.real_name,
          phone: user.phone,
          email: user.email,
          deptId: user.dept_id,
          roleId: user.role_id,
          viewAll: user.view_all === 1,
          manageAll: user.manage_all === 1,
          permissions,
          menus,
          dataPermissions
        }
      }
    });

  } catch (error) {
    console.error('[认证] 登录错误:', error);
    res.status(500).json({
      code: 500,
      message: '登录失败，请稍后重试',
      data: null
    });
  }
});

// 2. 登出接口
router.post('/logout', (req, res) => {
  const ip = getIpAddress(req);

  // 清除httpOnly cookie
  res.clearCookie('token', {
    httpOnly: true,
    secure: false,
    sameSite: 'strict'
  });

  // 从cookie或header获取token用于日志记录
  const token = getTokenFromRequest(req);

  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET;
      const decoded = jwt.verify(token, JWT_SECRET);
      logAction({
        module: '系统管理', action: '登出', method: 'POST', url: '/api/auth/logout',
        params: null, ipAddress: ip, userId: decoded.userId, userName: decoded.username,
        description: `${decoded.username} 登出成功`, status: 1
      });
    } catch (error) {
      // token无效也正常返回，无需记录
    }
  }

  res.json({ code: 200, message: '登出成功', data: null });
});

// 3. 获取当前用户信息（用于前端验证登录状态）
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT u.id, u.username, u.real_name, u.phone, u.email,
              u.dept_id, u.role_id, u.status,
              COALESCE(r.view_all, 0) as view_all,
              COALESCE(r.manage_all, 0) as manage_all
       FROM sys_user u
       LEFT JOIN sys_role r ON u.role_id = r.id
       WHERE u.id = ? AND u.status = 1`,
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({ code: 401, message: '用户不存在或已禁用', data: null });
    }

    const user = users[0];

    // 三个权限查询互不依赖，并行执行
    const [permissions, menus, dataPermissions] = await Promise.all([
      getUserPermissions(user.id, user.role_id),
      getMenuPermissions(user.role_id),
      getDataPermissions(user.role_id)
    ]);

    res.json({
      code: 200,
      message: '获取成功',
      data: {
        id: user.id,
        username: user.username,
        realName: user.real_name,
        phone: user.phone,
        email: user.email,
        deptId: user.dept_id,
        roleId: user.role_id,
        viewAll: user.view_all === 1,
        manageAll: user.manage_all === 1,
        permissions,
        menus,
        dataPermissions
      }
    });
  } catch (error) {
    console.error('[认证] 获取用户信息错误:', error);
    res.status(500).json({ code: 500, message: '获取用户信息失败', data: null });
  }
});

// 4. 注册接口（仅管理员可用，禁止公开注册）
router.post('/register', authenticateToken, validate(registerSchema), async (req, res) => {
  try {
    // 仅管理员可创建账号
    if (!(req.user.manageAll || req.user.roleId === ROLES.ADMIN)) {
      return res.status(403).json({ code: 403, message: '仅管理员可创建账号', data: null });
    }
    const { username, password, real_name } = req.body;

    // 参数验证
    if (!username || !password) {
      return res.status(400).json({
        code: 400,
        message: '用户名和密码不能为空',
        data: null
      });
    }

    if (!PASSWORD_PATTERN.test(password)) {
      return res.status(400).json({
        code: 400,
        message: PASSWORD_MESSAGE,
        data: null
      });
    }

    // 检查用户名是否已存在
    const [existingUsers] = await pool.query(
      'SELECT id FROM sys_user WHERE username = ?',
      [username]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        code: 400,
        message: '用户名已存在',
        data: null
      });
    }

    // 密码加密
    const hashedPassword = await bcrypt.hash(password, 10);

    // 获取默认角色ID（销售人员 role_id = 4）
    const [roles] = await pool.query(
      "SELECT id FROM sys_role WHERE code = 'sales'"
    );
    const defaultRoleId = roles.length > 0 ? roles[0].id : 4;

    // 插入新用户
    const [result] = await pool.query(
      `INSERT INTO sys_user (username, password, real_name, role_id, status) 
       VALUES (?, ?, ?, ?, 1)`,
      [username, hashedPassword, real_name || null, defaultRoleId]
    );

    // 获取新用户信息
    const [newUsers] = await pool.query(
      `SELECT id, username, real_name, phone, email, dept_id, role_id 
       FROM sys_user WHERE id = ?`,
      [result.insertId]
    );

    const newUser = newUsers[0];

    // 生成token
    const token = generateToken(newUser);

    res.json({
      code: 200,
      message: '注册成功',
      data: {
        token,
        userInfo: {
          id: newUser.id,
          username: newUser.username,
          realName: newUser.real_name,
          phone: newUser.phone,
          email: newUser.email,
          deptId: newUser.dept_id,
          roleId: newUser.role_id
        }
      }
    });

  } catch (error) {
    console.error('[认证] 注册错误:', error);
    res.status(500).json({
      code: 500,
      message: '注册失败，请稍后重试',
      data: null
    });
  }
});

// 4. 获取用户信息
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, username, real_name, phone, email, dept_id, role_id FROM sys_user WHERE id = ?',
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '用户不存在',
        data: null
      });
    }

    const user = users[0];
    
    res.json({
      code: 200,
      message: '获取用户信息成功',
      data: {
        id: user.id,
        username: user.username,
        realName: user.real_name,
        phone: user.phone,
        email: user.email,
        deptId: user.dept_id,
        roleId: user.role_id
      }
    });

  } catch (error) {
    console.error('[认证] 获取用户信息错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取用户信息失败',
      data: null
    });
  }
});

// 5. 修改个人信息
router.post('/update-profile', authenticateToken, validate(updateProfileSchema), async (req, res) => {
  try {
    const { real_name, phone, email } = req.body;
    const updates = [];
    const params = [];

    if (real_name !== undefined) { updates.push('real_name = ?'); params.push(real_name); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }

    if (updates.length === 0) {
      return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    }

    params.push(req.user.userId);
    await pool.query(`UPDATE sys_user SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ code: 200, message: '个人信息更新成功', data: null });
  } catch (error) {
    console.error('[认证] 更新个人信息错误:', error);
    res.status(500).json({ code: 500, message: '更新失败', data: null });
  }
});

// 6. 修改密码
router.post('/change-password', authenticateToken, validate(changePasswordSchema), async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password) {
      return res.status(400).json({ code: 400, message: '旧密码和新密码不能为空', data: null });
    }
    if (!PASSWORD_PATTERN.test(new_password)) {
      return res.status(400).json({ code: 400, message: PASSWORD_MESSAGE, data: null });
    }

    const [users] = await pool.query('SELECT password FROM sys_user WHERE id = ?', [req.user.userId]);
    if (users.length === 0) {
      return res.status(404).json({ code: 404, message: '用户不存在', data: null });
    }

    const isValid = await bcrypt.compare(old_password, users[0].password);
    if (!isValid) {
      return res.status(400).json({ code: 400, message: '旧密码错误', data: null });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE sys_user SET password = ? WHERE id = ?', [hashedPassword, req.user.userId]);

    res.json({ code: 200, message: '密码修改成功，请重新登录', data: null });
  } catch (error) {
    console.error('[认证] 修改密码错误:', error);
    res.status(500).json({ code: 500, message: '修改密码失败', data: null });
  }
});

module.exports = router;
