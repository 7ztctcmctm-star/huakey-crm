/**
 * 认证服务层
 * 从 routes/auth.js 提取的业务逻辑
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const svgCaptcha = require('svg-captcha');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');
const { getUserPermissions, getMenuPermissions, getDataPermissions } = require('./permissionService');
const { getCache, setCache, delCache } = require('../config/redis');

// [安全修复] 密码正则：至少8位，含大小写字母和数字
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PASSWORD_MESSAGE = '密码至少8位，需包含大写字母、小写字母和数字';

// 验证码 Redis 配置
const CAPTCHA_TTL_SECONDS = 300;
const CAPTCHA_REDIS_PREFIX = 'captcha:';

// 验证码内存存储（dev/test 模式及 Redis 故障降级使用）
// 保留导出以兼容 routes/auth.js 的 SKIP_CAPTCHA 开发跳过逻辑
const captchaStore = new Map();

function getCaptchaRedisKey(key) {
  return `${CAPTCHA_REDIS_PREFIX}${key}`;
}

const redisEnabled = () => process.env.REDIS_ENABLED === 'true';

// 惰性清理计数：每 32 次写入触发一次过期项清理，防止未验证的 key 无界增长
let captchaCleanupCounter = 0;

async function saveCaptcha(key, code) {
  const expires = Date.now() + CAPTCHA_TTL_SECONDS * 1000;
  // [安全修复] Redis 启用时优先写入 Redis；失败降级到内存，避免登录完全中断
  if (redisEnabled()) {
    try {
      await setCache(getCaptchaRedisKey(key), code, CAPTCHA_TTL_SECONDS);
      return;
    } catch { /* Redis 写入失败，降级到内存 */ }
  }
  // 周期性惰性清理过期项（内存 DoS 防护：攻击者高频请求但从不验证时，key 仍会过期回收）
  if (++captchaCleanupCounter % 32 === 0) {
    const now = Date.now();
    for (const [k, v] of captchaStore) {
      if (v.expires <= now) captchaStore.delete(k);
    }
  }
  captchaStore.set(key, { code, expires });
}

async function loadCaptcha(key) {
  // [安全修复] Redis 启用时优先读取 Redis；失败降级到内存
  if (redisEnabled()) {
    try {
      const code = await getCache(getCaptchaRedisKey(key));
      if (code) return code;
    } catch { /* Redis 读取失败，降级到内存 */ }
  }
  const mem = captchaStore.get(key);
  if (mem) {
    if (mem.expires > Date.now()) return mem.code;
    captchaStore.delete(key);
  }
  return null;
}

async function removeCaptcha(key) {
  // 双删：内存 + Redis，避免 Redis 故障恢复后残留
  captchaStore.delete(key);
  if (redisEnabled()) {
    try {
      await delCache(getCaptchaRedisKey(key));
    } catch { /* ok */ }
  }
}

/**
 * 生成验证码
 * @returns {Promise<{ key: string, svg: string }>}
 */
async function getCaptcha() {
  const captcha = svgCaptcha.create({
    size: 4,
    ignoreChars: '0o1il',
    noise: 4,          // 增加干扰线，提高识别难度
    color: true,
    background: '#f5f5f7'
  });

  const key = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  await saveCaptcha(key, captcha.text.toLowerCase());

  return { key, svg: captcha.data };
}

/**
 * 验证码校验
 * @param {string} captchaKey
 * @param {string} captcha
 * @returns {Promise<{ valid: boolean, message?: string }>}
 */
async function verifyCaptcha(captchaKey, captcha) {
  const storedCode = await loadCaptcha(captchaKey);
  if (!storedCode) {
    await removeCaptcha(captchaKey);
    return { valid: false, message: '验证码已过期，请刷新' };
  }
  if (storedCode !== captcha.toLowerCase()) {
    await removeCaptcha(captchaKey);
    return { valid: false, message: '验证码错误' };
  }
  await removeCaptcha(captchaKey);
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
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '用户名和密码不能为空');
  }

  const [users] = await pool.query(
    `SELECT u.id, u.username, u.password, u.real_name, u.phone, u.email,
            u.dept_id, u.role_id, u.status,
            COALESCE(u.must_change_password, 0) as must_change_password,
            COALESCE(r.view_all, 0) as view_all,
            COALESCE(r.manage_all, 0) as manage_all,
            r.code as role_code
     FROM sys_user u
     LEFT JOIN sys_role r ON u.role_id = r.id
     WHERE u.username = ? AND u.status = 1`,
    [username]
  );

  if (users.length === 0) {
    throw new AppError(ErrorCodes.LOGIN_FAILED, '用户名或密码错误');
  }

  const user = users[0];

  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    throw new AppError(ErrorCodes.LOGIN_FAILED, '用户名或密码错误');
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

// [性能优化] /auth/me 内存缓存，TTL 30秒，避免每次页面刷新都执行3个权限查询
const meCache = new Map();
const ME_CACHE_TTL = 30 * 1000; // 30秒

/**
 * 获取当前用户信息（含权限），带短TTL内存缓存
 * @param {object} pool
 * @param {number} userId
 * @returns {object|null}
 */
async function getMe(pool, userId) {
  // 检查缓存
  const cached = meCache.get(userId);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const [users] = await pool.query(
    `SELECT u.id, u.username, u.real_name, u.phone, u.email,
            u.dept_id, u.role_id, u.status,
            COALESCE(u.must_change_password, 0) as must_change_password,
            COALESCE(r.view_all, 0) as view_all,
            COALESCE(r.manage_all, 0) as manage_all,
            r.code as role_code
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

  const result = {
    id: user.id,
    username: user.username,
    realName: user.real_name,
    phone: user.phone,
    email: user.email,
    deptId: user.dept_id,
    roleId: user.role_id,
    roleCode: user.role_code,
    mustChangePassword: user.must_change_password === 1,
    viewAll: user.view_all === 1,
    manageAll: user.manage_all === 1,
    permissions,
    menus,
    dataPermissions
  };

  // 写入缓存
  meCache.set(userId, { data: result, expires: Date.now() + ME_CACHE_TTL });

  return result;
}

/**
 * 清除指定用户的 /auth/me 缓存（权限变更后调用）
 * @param {number} userId
 */
function clearMeCache(userId) {
  if (userId) {
    meCache.delete(userId);
  } else {
    meCache.clear();
  }
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
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '没有要更新的字段');
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
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '旧密码和新密码不能为空');
  }
  if (!PASSWORD_PATTERN.test(newPassword)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, PASSWORD_MESSAGE);
  }

  const [users] = await pool.query('SELECT password FROM sys_user WHERE id = ?', [userId]);
  if (users.length === 0) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, '用户不存在');
  }

  const isValid = await bcrypt.compare(oldPassword, users[0].password);
  if (!isValid) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '旧密码错误');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await pool.query(
    `UPDATE sys_user
     SET password = ?,
         must_change_password = 0,
         password_changed_at = NOW()
     WHERE id = ?`,
    [hashedPassword, userId]
  );
}

/**
 * 强制修改密码（首次登录/重置密码后无需旧密码）
 * @param {object} pool
 * @param {number} userId
 * @param {string} newPassword
 */
async function forceChangePassword(pool, userId, newPassword) {
  if (!newPassword) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '新密码不能为空');
  }
  if (!PASSWORD_PATTERN.test(newPassword)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, PASSWORD_MESSAGE);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [users] = await connection.query(
      'SELECT password, must_change_password FROM sys_user WHERE id = ? AND status = 1 FOR UPDATE',
      [userId]
    );
    if (users.length === 0) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, '用户不存在或已禁用');
    }

    if (users[0].must_change_password !== 1) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, '当前账号无需强制修改密码');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await connection.query(
      `UPDATE sys_user
       SET password = ?,
           must_change_password = 0,
           password_changed_at = NOW()
       WHERE id = ?`,
      [hashedPassword, userId]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '用户名和密码不能为空');
  }
  if (!PASSWORD_PATTERN.test(password)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, PASSWORD_MESSAGE);
  }

  const [existingUsers] = await pool.query(
    'SELECT id FROM sys_user WHERE username = ?',
    [username]
  );

  if (existingUsers.length > 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '用户名已存在');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const [roles] = await pool.query(
    "SELECT id FROM sys_role WHERE code = 'sales'"
  );
  const defaultRoleId = roles.length > 0 ? roles[0].id : 4;

  // [v1.0.1 安全补丁] 注册用户强制首次登录改密
  const [result] = await pool.query(
    `INSERT INTO sys_user (username, password, real_name, role_id, status, must_change_password)
     VALUES (?, ?, ?, ?, 1, 1)`,
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

/**
 * 开发/测试模式：预置一个固定的 dev 验证码
 * 避免 routes 层直接操作内部的 captchaStore
 */
async function setDevCaptcha() {
  await saveCaptcha('dev', 'dev1');
}

module.exports = {
  PASSWORD_PATTERN,
  PASSWORD_MESSAGE,
  captchaStore,
  getCaptcha,
  verifyCaptcha,
  setDevCaptcha,
  login,
  updateLastLogin,
  logout,
  getMe,
  clearMeCache,
  getProfile,
  updateProfile,
  changePassword,
  forceChangePassword,
  register
};
