/**
 * 用户管理服务层
 * 从 routes/user.js 提取的业务逻辑
 */
const bcrypt = require('bcryptjs');
const { clearPermissionCache } = require('./permissionService');

/**
 * 获取用户列表
 */
async function listUsers(pool, { page = 1, pageSize = 10, username, realName }) {
  const offset = (page - 1) * pageSize;
  const params = [];
  let whereClause = 'WHERE u.deleted_at IS NULL';

  if (username) {
    whereClause += ' AND u.username LIKE ?';
    params.push(`%${username}%`);
  }

  if (realName) {
    whereClause += ' AND u.real_name LIKE ?';
    params.push(`%${realName}%`);
  }

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM sys_user u ${whereClause}`,
    params
  );
  const total = countResult[0].total;

  const [users] = await pool.query(
    `SELECT
      u.id, u.username, u.real_name, u.phone, u.email,
      u.dept_id, u.role_id, u.status, u.create_time, u.update_time,
      d.name as dept_name, r.name as role_name
    FROM sys_user u
    LEFT JOIN sys_dept d ON u.dept_id = d.id
    LEFT JOIN sys_role r ON u.role_id = r.id
    ${whereClause}
    ORDER BY u.create_time DESC
    LIMIT ? OFFSET ?`,
    [...params, parseInt(pageSize), parseInt(offset)]
  );

  return {
    list: users,
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize)
  };
}

/**
 * 添加用户
 */
async function addUser(pool, { username, password, real_name, phone, email, dept_id, role_id }) {
  const [existingUsers] = await pool.query(
    'SELECT id FROM sys_user WHERE username = ? AND deleted_at IS NULL',
    [username]
  );

  if (existingUsers.length > 0) {
    const err = new Error('用户名已存在');
    err.statusCode = 400;
    throw err;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const [result] = await pool.query(
    `INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [username, hashedPassword, real_name || null, phone || null, email || null, dept_id || null, role_id || null]
  );

  return { id: result.insertId };
}

/**
 * 修改用户
 */
async function updateUser(pool, { id, real_name, phone, email, dept_id, role_id, status }) {
  const [users] = await pool.query(
    'SELECT id FROM sys_user WHERE id = ?',
    [id]
  );

  if (users.length === 0) {
    const err = new Error('用户不存在');
    err.statusCode = 404;
    throw err;
  }

  const updates = [];
  const params = [];

  if (real_name !== undefined) { updates.push('real_name = ?'); params.push(real_name); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
  if (email !== undefined) { updates.push('email = ?'); params.push(email); }
  if (dept_id !== undefined) { updates.push('dept_id = ?'); params.push(dept_id); }
  if (role_id !== undefined) { updates.push('role_id = ?'); params.push(role_id); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }

  if (updates.length === 0) {
    const err = new Error('没有要更新的字段');
    err.statusCode = 400;
    throw err;
  }

  params.push(id);

  await pool.query(
    `UPDATE sys_user SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  if (role_id !== undefined) {
    clearPermissionCache(id);
  }
}

/**
 * 删除用户（逻辑删除）
 */
async function deleteUser(pool, { id }, currentUserId) {
  const [users] = await pool.query(
    'SELECT id FROM sys_user WHERE id = ?',
    [id]
  );

  if (users.length === 0) {
    const err = new Error('用户不存在');
    err.statusCode = 404;
    throw err;
  }

  if (id == currentUserId) {
    const err = new Error('不能删除当前登录用户');
    err.statusCode = 400;
    throw err;
  }

  await pool.query(
    'UPDATE sys_user SET deleted_at = NOW() WHERE id = ?',
    [id]
  );
}

/**
 * 获取用户详情
 */
async function getUserDetail(pool, id) {
  const [users] = await pool.query(
    `SELECT
      u.id, u.username, u.real_name, u.phone, u.email,
      u.dept_id, u.role_id, u.status, u.create_time, u.update_time,
      d.name as dept_name, r.name as role_name
    FROM sys_user u
    LEFT JOIN sys_dept d ON u.dept_id = d.id
    LEFT JOIN sys_role r ON u.role_id = r.id
    WHERE u.id = ?`,
    [id]
  );

  if (users.length === 0) {
    const err = new Error('用户不存在');
    err.statusCode = 404;
    throw err;
  }

  return users[0];
}

module.exports = {
  listUsers,
  addUser,
  updateUser,
  deleteUser,
  getUserDetail
};
