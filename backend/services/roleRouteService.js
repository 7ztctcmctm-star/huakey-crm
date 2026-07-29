/**
 * 角色路由服务层
 * 职责：处理角色管理相关的业务逻辑
 */
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

/**
 * 查询角色列表
 * @param {object} pool - 数据库连接池
 * @returns {object} { list, total }
 */
async function listRoles(pool) {
  const [rows] = await pool.query('SELECT id, name, code, description, status, create_time, update_time FROM sys_role ORDER BY id');
  return { list: rows, total: rows.length };
}

/**
 * 新增角色
 * @param {object} pool - 数据库连接池
 * @param {object} params - { name, code, description }
 * @returns {number} 新增角色的ID
 */
async function addRole(pool, params) {
  const { name, code, description } = params;
  const [result] = await pool.query(
    'INSERT INTO sys_role (name, code, description) VALUES (?, ?, ?)',
    [name, code, description || null]
  );
  return result.insertId;
}

/**
 * 修改角色
 * @param {object} pool - 数据库连接池
 * @param {object} params - { id, name, code, description, status }
 * @param {function} clearPermissionCache - 清除权限缓存函数
 * @param {function} clearAllPermissionCache - 清除所有权限缓存函数
 */
async function updateRole(pool, params, clearPermissionCache, clearAllPermissionCache) {
  const { id, name, code, description, status } = params;
  await pool.query(
    'UPDATE sys_role SET name=?, code=?, description=?, status=? WHERE id=?',
    [name, code, description, status !== undefined ? status : 1, id]
  );
  // 修改角色后清除该角色所有用户的权限缓存
  const [users] = await pool.query('SELECT id FROM sys_user WHERE role_id = ?', [id]);
  await Promise.all(users.map(u => clearPermissionCache(u.id)));
  await clearAllPermissionCache();
}

/**
 * 删除角色
 * @param {object} pool - 数据库连接池
 * @param {number} id - 角色ID
 * @param {function} clearPermissionCache - 清除权限缓存函数
 * @param {function} clearAllPermissionCache - 清除所有权限缓存函数
 * @returns {boolean} 是否删除成功
 * @throws {Error} 如果角色下有用户则抛出错误
 */
async function deleteRole(pool, id, clearPermissionCache, clearAllPermissionCache) {
  // 检查是否有用户关联该角色
  const [users] = await pool.query('SELECT COUNT(*) as cnt FROM sys_user WHERE role_id = ?', [id]);
  if (users[0].cnt > 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, `该角色下有 ${users[0].cnt} 个用户，无法删除`);
  }
  await pool.query('DELETE FROM sys_role WHERE id=?', [id]);
  // 删除角色后清除该角色所有用户的权限缓存
  const [delUsers] = await pool.query('SELECT id FROM sys_user WHERE role_id = ?', [id]);
  delUsers.forEach(u => clearPermissionCache(u.id));
  clearAllPermissionCache();
  return true;
}

module.exports = {
  listRoles,
  addRole,
  updateRole,
  deleteRole
};
