const ROLES = require("../config/roles");
const NodeCache = require("node-cache");
const logger = require("../config/logger");
const { redis, REDIS_ENABLED, getCache, setCache } = require("../config/redis");

// 本地内存缓存（单实例降级 / Redis 未启用时的主力缓存，Redis 启用时作为 L1 热缓存）
const localCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const CACHE_TTL = 300; // 5 分钟

/**
 * 多级缓存读取：优先本地缓存 → Redis → DB
 * Redis 启用时跨实例共享失效，Redis 未启用时仅依赖本地缓存
 */
async function cacheGet(key) {
  // L1: 本地内存（最快，无网络开销）
  let value = localCache.get(key);
  if (value !== undefined) return value;

  // L2: Redis（跨实例共享）
  if (REDIS_ENABLED) {
    value = await getCache(key);
    if (value !== null) {
      localCache.set(key, value, CACHE_TTL); // 回填 L1
      return value;
    }
  }

  return undefined; // 缓存未命中
}

/**
 * 多级缓存写入：同时写入本地缓存和 Redis
 */
async function cacheSet(key, value) {
  localCache.set(key, value, CACHE_TTL);
  if (REDIS_ENABLED) {
    await setCache(key, value, CACHE_TTL);
  }
}

/**
 * 多级缓存删除：本地 + Redis 同时清除
 */
async function cacheDel(key) {
  localCache.del(key);
  if (REDIS_ENABLED) {
    try { await redis.del(key); } catch { /* ok */ }
  }
}

/**
 * 按前缀批量清除缓存（跨实例一致性）
 * @param {string} prefix - 缓存键前缀
 */
async function cacheDelByPrefix(prefix) {
  // 清除本地缓存
  const localKeys = localCache.keys().filter(k => k.startsWith(prefix));
  localCache.del(localKeys);

  // 清除 Redis 缓存（跨实例）
  if (REDIS_ENABLED && redis) {
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== '0');
    } catch { /* ok */ }
  }
}

/**
 * 获取用户权限列表（合并角色权限 + 用户直接权限）
 * @param {number} userId - 用户ID
 * @param {number} roleId - 角色ID
 */
async function getUserPermissions(pool, userId, roleId) {
  const cacheKey = `permissions:${userId}`;

  let permissions = await cacheGet(cacheKey);

  if (permissions === undefined) {
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
    await cacheSet(cacheKey, permissions);
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
async function clearPermissionCache(userId) {
  await cacheDel(`permissions:${userId}`);
}

/**
 * 清除所有权限缓存
 */
async function clearAllPermissionCache() {
  localCache.flushAll();
  // 跨实例清除所有权限缓存
  await cacheDelByPrefix('permissions:');
  await cacheDelByPrefix('data_perms:');
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

  let configs = await cacheGet(cacheKey);
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
  await cacheSet(cacheKey, configs);
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
    await clearPermissionCache(userId);
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
    await clearPermissionCache(userId);
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
    await clearPermissionCache(userId);
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

