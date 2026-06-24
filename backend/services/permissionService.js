const ROLES = require('../config/roles');
const NodeCache = require('node-cache');

// 权限缓存，TTL 5分钟
const permissionCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

/**
 * 获取用户权限列表
 * @param {number} userId - 用户ID
 * @param {number} roleId - 角色ID
 */
async function getUserPermissions(pool, userId, roleId) {
  const cacheKey = `permissions:${userId}`;

  // 尝试从缓存获取
  let permissions = permissionCache.get(cacheKey);

  if (!permissions) {
    // 从数据库查询
    const [rows] = await pool.query(
      `SELECT DISTINCT p.code, p.name, p.type
       FROM sys_role_permission rp
       JOIN sys_permission p ON rp.permission_id = p.id
       WHERE rp.role_id = ?`,
      [roleId]
    );

    permissions = rows.map(r => r.code);

    // 存入缓存
    permissionCache.set(cacheKey, permissions);
  }

  return permissions;
}

/**
 * 检查用户是否有指定权限
 * @param {number} userId - 用户ID
 * @param {number} roleId - 角色ID
 * @param {string} permissionCode - 权限编码
 */
async function hasPermission(pool, userId, roleId, permissionCode) {
  // 超级管理员拥有所有权限
  if (roleId === ROLES.ADMIN) {
    return true;
  }

  const permissions = await getUserPermissions(pool, userId, roleId);
  return permissions.includes(permissionCode);
}

/**
 * 清除用户权限缓存
 * @param {number} userId - 用户ID
 */
function clearPermissionCache(userId) {
  permissionCache.del(`permissions:${userId}`);
}

/**
 * 清除所有权限缓存
 */
function clearAllPermissionCache() {
  permissionCache.flushAll();
}

/**
 * 获取用户菜单权限（树形结构）
 * @param {number} roleId - 角色ID
 */
async function getMenuPermissions(pool, roleId) {
  const [permissions] = await pool.query(
    `SELECT p.id, p.name, p.code, p.parent_id, p.path, p.icon, p.sort
     FROM sys_role_permission rp
     JOIN sys_permission p ON rp.permission_id = p.id
     WHERE rp.role_id = ? AND p.type = 'menu' AND p.is_visible = true
     ORDER BY p.sort`,
    [roleId]
  );

  return buildMenuTree(permissions);
}

/**
 * 构建菜单树
 */
function buildMenuTree(permissions, parentId = 0) {
  return permissions
    .filter(p => p.parent_id === parentId)
    .map(p => ({
      id: p.id,
      name: p.name,
      code: p.code,
      path: p.path,
      icon: p.icon,
      sort: p.sort,
      children: buildMenuTree(permissions, p.id)
    }));
}

/**
 * 获取角色数据权限（带缓存）
 * @param {number} roleId - 角色ID
 */
async function getDataPermissions(pool, roleId) {
  const cacheKey = `data_perms:${roleId}`;

  let configs = permissionCache.get(cacheKey);
  if (configs !== undefined) {
    return configs;
  }

  const [rows] = await pool.query(
    `SELECT module, data_scope, custom_dept_ids
     FROM sys_data_permission
     WHERE role_id = ?`,
    [roleId]
  );

  configs = rows;
  permissionCache.set(cacheKey, configs);
  return configs;
}

module.exports = {
  getUserPermissions,
  hasPermission,
  clearPermissionCache,
  clearAllPermissionCache,
  getMenuPermissions,
  getDataPermissions
};
