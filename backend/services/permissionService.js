const ROLES = require("../config/roles");
const NodeCache = require("node-cache");
const logger = require("../config/logger");

// 权限缓存，TL 5分钟
const permissionCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

/**
 * 获取用户权限列表（合并角色权限 + 用户直接权限）
 * @param {number} userId - 用户ID
 * @param {number} roleId - 角色ID
 */
async function getUserPermissions(pool, userId, roleId) {
  const cacheKey = `permissions:${userId}`;

  let permissions = permissionCache.get(cacheKey);

  if (!permissions) {
    // 合并角色权限（sys_role_permission）和用户直接权限（crm_user_permission）
    const [rows] = await pool.query(
      `SELECT DISTINCT p.code
       FROM (
         SELECT rp.permission_id
         FROM sys_role_permission rp
         WHERE rp.role_id = ?
         UNION
         SELECT up.permission_id
         FROM crm_user_permission up
         WHERE up.user_id = ?
       ) combined
       JOIN sys_permission p ON combined.permission_id = p.id`,
      [roleId, userId]
    );

    permissions = rows.map(r => r.code);
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
     WHERE rp.role_id = ? AND p.type = "menu" AND p.is_visible = true
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

// ==================== crm_user_permission 用户直接权限管理 ====================

/**
 * 获取用户直接分配的权限列表（不含角色继承权限）
 * @param {object} pool - 数据库连接池
 * @param {number} userId - 用户ID
 */
async function getUserDirectPermissions(pool, userId) {
  const [rows] = await pool.query(
    `SELECT p.id, p.code, p.name, p.type
     FROM crm_user_permission up
     JOIN sys_permission p ON up.permission_id = p.id
     WHERE up.user_id = ?`,
    [userId]
  );
  return rows;
}

/**
 * 为用户直接分配权限
 * @param {object} pool - 数据库连接池
 * @param {number} userId - 用户ID
 * @param {number} permissionId - 权限ID
 */
async function addUserPermission(pool, userId, permissionId) {
  try {
    await pool.query(
      `INSERT IGNORE INTO crm_user_permission (user_id, permission_id) VALUES (?, ?)`,
      [userId, permissionId]
    );
    clearPermissionCache(userId);
    return true;
  } catch (error) {
    logger.error("添加用户权限失败:", { userId, permissionId, error: error.message });
    throw error;
  }
}

/**
 * 移除用户的直接权限
 * @param {object} pool - 数据库连接池
 * @param {number} userId - 用户ID
 * @param {number} permissionId - 权限ID
 */
async function removeUserPermission(pool, userId, permissionId) {
  try {
    await pool.query(
      `DELETE FROM crm_user_permission WHERE user_id = ? AND permission_id = ?`,
      [userId, permissionId]
    );
    clearPermissionCache(userId);
    return true;
  } catch (error) {
    logger.error("移除用户权限失败:", { userId, permissionId, error: error.message });
    throw error;
  }
}

/**
 * 批量设置用户直接权限（替换现有权限）
 * @param {object} pool - 数据库连接池
 * @param {number} userId - 用户ID
 * @param {number[]} permissionIds - 权限ID列表
 */
async function setUserPermissions(pool, userId, permissionIds) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM crm_user_permission WHERE user_id = ?`, [userId]);
    if (permissionIds.length > 0) {
      const values = permissionIds.map(id => [userId, id]);
      await conn.query(`INSERT INTO crm_user_permission (user_id, permission_id) VALUES ?`, [values]);
    }
    await conn.commit();
    clearPermissionCache(userId);
    return true;
  } catch (error) {
    await conn.rollback();
    logger.error("批量设置用户权限失败:", { userId, error: error.message });
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  getUserPermissions,
  hasPermission,
  clearPermissionCache,
  clearAllPermissionCache,
  getMenuPermissions,
  getDataPermissions,
  getUserDirectPermissions,
  addUserPermission,
  removeUserPermission,
  setUserPermissions
};

