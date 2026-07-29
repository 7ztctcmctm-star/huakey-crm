/**
 * 用户管理服务层
 * 从 routes/user.js 提取的业务逻辑
 */
const bcrypt = require('bcryptjs');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');
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
    throw new AppError(ErrorCodes.DUPLICATE_USERNAME, '用户名已存在');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

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
    throw new AppError(ErrorCodes.USER_NOT_FOUND, '用户不存在');
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
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '没有要更新的字段');
  }

  params.push(id);

  await pool.query(
    `UPDATE sys_user SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  if (role_id !== undefined) {
    await clearPermissionCache(id);
  }
}

/**
 * 删除用户（逻辑删除 + 级联处理）
 *
 * 级联规则：
 *   1. 用户账号 → 软删除（status=0, deleted_at=NOW()）
 *   2. 员工档案 → 自动设为离职（leave_date=NOW()）
 *   3. 名下客户 → 释放到公海池（pool_status=1, owner_id=NULL, protect_until=NULL）
 *   4. 名下商机 → 优先转移给直属上级 manager_id；无可用上级时 owner_id=NULL（待分配）
 *   5. 跟进记录 → 保留不动（归属客户，不归属用户）
 */
async function deleteUser(pool, { id }, currentUserId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 验证用户存在并读取直属上级
    const [users] = await connection.query(
      'SELECT id, username, manager_id FROM sys_user WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (users.length === 0) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, '用户不存在或已删除');
    }
    if (id == currentUserId) {
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '不能删除当前登录用户');
    }

    // 校验直属上级是否可用
    let managerId = users[0].manager_id;
    if (managerId) {
      const [managers] = await connection.query(
        'SELECT id FROM sys_user WHERE id = ? AND deleted_at IS NULL AND status = 1',
        [managerId]
      );
      if (managers.length === 0) {
        managerId = null;
      }
    }

    // 1. 软删除用户账号
    await connection.query(
      'UPDATE sys_user SET status = 0, deleted_at = NOW() WHERE id = ?',
      [id]
    );

    // 2. 员工档案 → 设为离职
    await connection.query(
      'UPDATE crm_employee_profile SET leave_date = CURDATE(), update_time = NOW() WHERE user_id = ? AND leave_date IS NULL',
      [id]
    );

    // 3. 名下客户 → 释放到公海池
    const [customerResult] = await connection.query(
      `UPDATE crm_customer
       SET owner_id = NULL,
           pool_status = 1,
           pool_type = 'public',
           protect_until = NULL,
           update_time = NOW()
       WHERE owner_id = ? AND deleted_at IS NULL`,
      [id]
    );

    // 4. 名下商机 → 优先转移给直属上级，无上级或上级不可用时再释放为待分配
    const [oppResult] = await connection.query(
      `UPDATE crm_opportunity
       SET owner_id = ?, update_time = NOW()
       WHERE owner_id = ? AND deleted_at IS NULL`,
      [managerId, id]
    );

    await connection.commit();

    return {
      username: users[0].username,
      customersReleased: customerResult.affectedRows || 0,
      opportunitiesReleased: oppResult.affectedRows || 0
    };

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
    throw new AppError(ErrorCodes.USER_NOT_FOUND, '用户不存在');
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
