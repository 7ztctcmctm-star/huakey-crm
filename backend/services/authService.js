/**
 * 认证服务层
 * 从 routes/auth.js 提取的业务逻辑
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const svgCaptcha = require('svg-captcha');
const { getUserPermissions, getMenuPermissions, getDataPermissions } = require('./permissionService');

// [安全修复] 密码正则：至少8位，含大小写字母和数字
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PASSWORD_MESSAGE = '密码至少8位，需包含大写字母、小写字母和数字';

// 验证码存储（key: captcha_key, value: {code, expires}）
const captchaStore = new Map();

// 定期清理过期验证码（每5分钟）
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of captchaStore) {
    if (val.expires < now) captchaStore.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * 生成验证码
 * @returns {{ key: string, svg: string }}
 */
function getCaptcha() {
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
    expires: Date.now() + 5 * 60 * 1000
  });

  return { key, svg: captcha.data };
}

/**
 * 验证码校验
 * @param {string} captchaKey
 * @param {string} captcha
 * @returns {{ valid: boolean, message?: string }}
 */
function verifyCaptcha(captchaKey, captcha) {
  const stored = captchaStore.get(captchaKey);
  if (!stored || stored.expires < Date.now()) {
    captchaStore.delete(captchaKey);
    return { valid: false, message: '验证码已过期，请刷新' };
  }
  if (stored.code !== captcha.toLowerCase()) {
    captchaStore.delete(captchaKey);
    return { valid: false, message: '验证码错误' };
  }
  captchaStore.delete(captchaKey);
  return { valid: true };
}

/**
 * 用户登录
 * @param {object} pool
 * @param {object} params - { username, password }
 * @returns {object} { user, token } 或抛出错误
 */
async function login(pool, { username, password }) {
  if (!username || !password) {
    const err = new Error('用户名和密码不能为空');
    err.code = 400;
    throw err;
  }

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
    const err = new Error('用户名或密码错误');
    err.code = 401;
    throw err;
  }

  const user = users[0];

  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    const err = new Error('用户名或密码错误');
    err.code = 401;
    throw err;
  }

  return user;
}

/**
 * 更新最后登录信息
 * @param {object} pool
 * @param {number} userId
 * @param {string} ip
 */
async function updateLastLogin(pool, userId, ip) {
  await pool.query(
    'UPDATE sys_user SET last_login_time = NOW(), last_login_ip = ? WHERE id = ?',
    [ip, userId]
  );
}

/**
 * 登出（将token加入黑名单）
 * @param {object} pool
 * @param {string} token
 * @returns {{ userId?: number, username?: string }}
 */
async function logout(pool, token) {
  if (!token) return {};

  try {
    const JWT_SECRET = process.env.JWT_SECRET;
    const decoded = jwt.verify(token, JWT_SECRET);

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expireAt = new Date(decoded.exp * 1000);
    await pool.query(
      'INSERT IGNORE INTO sys_token_blacklist (token_hash, user_id, expire_at, reason) VALUES (?, ?, ?, ?)',
      [tokenHash, decoded.userId, expireAt, 'logout']
    );

    return { userId: decoded.userId, username: decoded.username };
  } catch (error) {
    return {};
  }
}

/**
 * 获取当前用户信息（含权限）
 * @param {object} pool
 * @param {number} userId
 * @returns {object|null}
 */
async function getMe(pool, userId) {
  const [users] = await pool.query(
    `SELECT u.id, u.username, u.real_name, u.phone, u.email,
            u.dept_id, u.role_id, u.status,
            COALESCE(r.view_all, 0) as view_all,
            COALESCE(r.manage_all, 0) as manage_all
     FROM sys_user u
     LEFT JOIN sys_role r ON u.role_id = r.id
     WHERE u.id = ? AND u.status = 1`,
    [userId]
  );

  if (users.length === 0) return null;

  const user = users[0];

  const [permissions, menus, dataPermissions] = await Promise.all([
    getUserPermissions(pool, user.id, user.role_id),
    getMenuPermissions(pool, user.role_id),
    getDataPermissions(pool, user.role_id)
  ]);

  return {
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
  };
}

/**
 * 获取用户个人信息
 * @param {object} pool
 * @param {number} userId
 * @returns {object|null}
 */
async function getProfile(pool, userId) {
  const [users] = await pool.query(
    'SELECT id, username, real_name, phone, email, dept_id, role_id FROM sys_user WHERE id = ?',
    [userId]
  );

  if (users.length === 0) return null;

  const user = users[0];
  return {
    id: user.id,
    username: user.username,
    realName: user.real_name,
    phone: user.phone,
    email: user.email,
    deptId: user.dept_id,
    roleId: user.role_id
  };
}

/**
 * 更新个人信息
 * @param {object} pool
 * @param {number} userId
 * @param {object} data - { real_name, phone, email }
 */
async function updateProfile(pool, userId, data) {
  const { real_name, phone, email } = data;
  const updates = [];
  const params = [];

  if (real_name !== undefined) { updates.push('real_name = ?'); params.push(real_name); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
  if (email !== undefined) { updates.push('email = ?'); params.push(email); }

  if (updates.length === 0) {
    const err = new Error('没有要更新的字段');
    err.code = 400;
    throw err;
  }

  params.push(userId);
  await pool.query(`UPDATE sys_user SET ${updates.join(', ')} WHERE id = ?`, params);
}

/**
 * 修改密码
 * @param {object} pool
 * @param {number} userId
 * @param {string} oldPassword
 * @param {string} newPassword
 */
async function changePassword(pool, userId, oldPassword, newPassword) {
  if (!oldPassword || !newPassword) {
    const err = new Error('旧密码和新密码不能为空');
    err.code = 400;
    throw err;
  }
  if (!PASSWORD_PATTERN.test(newPassword)) {
    const err = new Error(PASSWORD_MESSAGE);
    err.code = 400;
    throw err;
  }

  const [users] = await pool.query('SELECT password FROM sys_user WHERE id = ?', [userId]);
  if (users.length === 0) {
    const err = new Error('用户不存在');
    err.code = 404;
    throw err;
  }

  const isValid = await bcrypt.compare(oldPassword, users[0].password);
  if (!isValid) {
    const err = new Error('旧密码错误');
    err.code = 400;
    throw err;
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await pool.query('UPDATE sys_user SET password = ? WHERE id = ?', [hashedPassword, userId]);
}

/**
 * 注册新用户（仅管理员）
 * @param {object} pool
 * @param {object} data - { username, password, real_name }
 * @returns {{ id: number, username: string }}
 */
async function register(pool, data) {
  const { username, password, real_name } = data;

  if (!username || !password) {
    const err = new Error('用户名和密码不能为空');
    err.code = 400;
    throw err;
  }
  if (!PASSWORD_PATTERN.test(password)) {
    const err = new Error(PASSWORD_MESSAGE);
    err.code = 400;
    throw err;
  }

  const [existingUsers] = await pool.query(
    'SELECT id FROM sys_user WHERE username = ?',
    [username]
  );

  if (existingUsers.length > 0) {
    const err = new Error('用户名已存在');
    err.code = 400;
    throw err;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const [roles] = await pool.query(
    "SELECT id FROM sys_role WHERE code = 'sales'"
  );
  const defaultRoleId = roles.length > 0 ? roles[0].id : 4;

  const [result] = await pool.query(
    `INSERT INTO sys_user (username, password, real_name, role_id, status)
     VALUES (?, ?, ?, ?, 1)`,
    [username, hashedPassword, real_name || null, defaultRoleId]
  );

  const [newUsers] = await pool.query(
    `SELECT id, username, real_name, phone, email, dept_id, role_id
     FROM sys_user WHERE id = ?`,
    [result.insertId]
  );

  const newUser = newUsers[0];
  return { id: newUser.id, username: newUser.username };
}

module.exports = {
  PASSWORD_PATTERN,
  PASSWORD_MESSAGE,
  captchaStore,
  getCaptcha,
  verifyCaptcha,
  login,
  updateLastLogin,
  logout,
  getMe,
  getProfile,
  updateProfile,
  changePassword,
  register
};
