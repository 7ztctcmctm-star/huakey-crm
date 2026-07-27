// 权限路由服务
// 从 routes/permission.js 提取的业务逻辑

const {
  getUserPermissions,
  clearPermissionCache,
  clearAllPermissionCache,
  getMenuPermissions,
  getDataPermissions
} = require('./permissionService');
const { clearMeCache } = require('./authService');

/**
 * 构建权限树形结构
 */
function buildPermissionTree(permissions, parentId = 0) {
  return permissions
    .filter(p => p.parent_id === parentId)
    .map(p => ({
      ...p,
      children: buildPermissionTree(permissions, p.id)
    }));
}

/**
 * 获取当前用户权限（功能权限 + 菜单权限 + 数据权限）
 */
async function getMyPermissions(pool, userId, roleId) {
  const permissions = await getUserPermissions(pool, userId, roleId);
  const menus = await getMenuPermissions(pool, roleId);
  const dataPermissions = await getDataPermissions(pool, roleId);
  return { permissions, menus, dataPermissions };
}

/**
 * 获取所有权限列表（树形结构）
 */
async function listPermissions(pool) {
  const [permissions] = await pool.query(
    'SELECT * FROM sys_permission ORDER BY sort'
  );
  return buildPermissionTree(permissions);
}

/**
 * 获取角色权限ID列表
 */
async function getRolePermissions(pool, roleId) {
  const [permissions] = await pool.query(
    'SELECT permission_id FROM sys_role_permission WHERE role_id = ?',
    [roleId]
  );
  return permissions.map(p => p.permission_id);
}

/**
 * 更新角色权限（事务）
 */
async function updateRolePermissions(pool, role_id, permission_ids) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      'DELETE FROM sys_role_permission WHERE role_id = ?',
      [role_id]
    );

    if (permission_ids && permission_ids.length > 0) {
      const values = permission_ids.map(pid => [role_id, pid]);
      await connection.query(
        'INSERT INTO sys_role_permission (role_id, permission_id) VALUES ?',
        [values]
      );
    }

    await connection.commit();

    const [users] = await pool.query(
      'SELECT id FROM sys_user WHERE role_id = ?',
      [role_id]
    );
    users.forEach(u => clearPermissionCache(u.id));
    clearAllPermissionCache();
    clearMeCache(); // 清除 /auth/me 缓存，避免权限列表延迟生效

    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 获取数据权限配置
 */
async function getDataScope(pool, roleId) {
  const [configs] = await pool.query(
    `SELECT module, data_scope, custom_dept_ids
     FROM sys_data_permission
     WHERE role_id = ?`,
    [roleId]
  );
  return configs;
}

/**
 * 更新数据权限配置（事务）
 */
async function updateDataScope(pool, role_id, configs) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      'DELETE FROM sys_data_permission WHERE role_id = ?',
      [role_id]
    );

    if (configs && configs.length > 0) {
      for (const config of configs) {
        await connection.query(
          `INSERT INTO sys_data_permission (role_id, module, data_scope, custom_dept_ids)
           VALUES (?, ?, ?, ?)`,
          [role_id, config.module, config.data_scope, config.custom_dept_ids || null]
        );
      }
    }

    await connection.commit();

    const [users] = await pool.query(
      'SELECT id FROM sys_user WHERE role_id = ?',
      [role_id]
    );
    users.forEach(u => clearPermissionCache(u.id));
    clearAllPermissionCache();
    clearMeCache(); // 清除 /auth/me 缓存，避免数据权限延迟生效

    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 新增权限节点
 */
async function addPermission(pool, data) {
  const { name, code, type, parent_id, path, icon, sort } = data;
  if (!name || !code || !type) return { error: '名称、编码、类型不能为空' };

  const [existing] = await pool.query('SELECT id FROM sys_permission WHERE code = ?', [code]);
  if (existing.length > 0) return { error: '权限编码已存在' };

  await pool.query(
    'INSERT INTO sys_permission (name, code, type, parent_id, path, icon, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, code, type, parent_id || 0, path || null, icon || null, sort || 0]
  );
  clearAllPermissionCache();
  clearMeCache();
  return { success: true };
}

/**
 * 编辑权限节点
 */
async function updatePermission(pool, data) {
  const { id, name, code, type, parent_id, path, icon, sort } = data;
  if (!id) return { error: 'ID不能为空' };

  await pool.query(
    'UPDATE sys_permission SET name=?, code=?, type=?, parent_id=?, path=?, icon=?, sort=? WHERE id=?',
    [name, code, type, parent_id || 0, path || null, icon || null, sort || 0, id]
  );
  clearAllPermissionCache();
  clearMeCache();
  return { success: true };
}

/**
 * 删除权限节点（事务，含子权限检查）
 */
async function deletePermission(pool, id) {
  if (!id) return { error: 'ID不能为空' };

  const [children] = await pool.query('SELECT id FROM sys_permission WHERE parent_id = ?', [id]);
  if (children.length > 0) return { error: '存在子权限，请先删除子权限' };

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM sys_role_permission WHERE permission_id = ?', [id]);
    await connection.query('DELETE FROM sys_permission WHERE id = ?', [id]);
    await connection.commit();
    clearAllPermissionCache();
    clearMeCache();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  getMyPermissions,
  listPermissions,
  getRolePermissions,
  updateRolePermissions,
  getDataScope,
  updateDataScope,
  addPermission,
  updatePermission,
  deletePermission
};
