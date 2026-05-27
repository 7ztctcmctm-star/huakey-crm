const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const {
  getUserPermissions,
  clearPermissionCache,
  clearAllPermissionCache,
  getMenuPermissions,
  getDataPermissions
} = require('../services/permissionService');

// 获取当前用户权限
router.get('/my-permissions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const roleId = req.user.roleId;

    // 获取功能权限
    const permissions = await getUserPermissions(userId, roleId);

    // 获取菜单权限
    const menus = await getMenuPermissions(roleId);

    // 获取数据权限
    const dataPermissions = await getDataPermissions(roleId);

    res.json({
      code: 200,
      message: '查询成功',
      data: {
        permissions,
        menus,
        dataPermissions
      }
    });
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({
      code: 500,
      message: '查询失败',
      data: null
    });
  }
});

// 获取所有权限列表（树形结构）
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const [permissions] = await pool.query(
      'SELECT * FROM sys_permission ORDER BY sort'
    );

    // 构建树形结构
    const tree = buildPermissionTree(permissions);

    res.json({
      code: 200,
      message: '查询成功',
      data: tree
    });
  } catch (error) {
    console.error('Get permission list error:', error);
    res.status(500).json({
      code: 500,
      message: '查询失败',
      data: null
    });
  }
});

// 获取角色权限
router.get('/role/:roleId', authenticateToken, async (req, res) => {
  try {
    const { roleId } = req.params;

    const [permissions] = await pool.query(
      `SELECT permission_id
       FROM sys_role_permission
       WHERE role_id = ?`,
      [roleId]
    );

    const permissionIds = permissions.map(p => p.permission_id);

    res.json({
      code: 200,
      message: '查询成功',
      data: permissionIds
    });
  } catch (error) {
    console.error('Get role permissions error:', error);
    res.status(500).json({
      code: 500,
      message: '查询失败',
      data: null
    });
  }
});

// 更新角色权限
router.post('/role/update', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { role_id, permission_ids } = req.body;

    await connection.beginTransaction();

    // 删除原有权限
    await connection.query(
      'DELETE FROM sys_role_permission WHERE role_id = ?',
      [role_id]
    );

    // 插入新权限
    if (permission_ids && permission_ids.length > 0) {
      const values = permission_ids.map(pid => [role_id, pid]);
      await connection.query(
        'INSERT INTO sys_role_permission (role_id, permission_id) VALUES ?',
        [values]
      );
    }

    await connection.commit();

    // 清除该角色所有用户的权限缓存
    const [users] = await pool.query(
      'SELECT id FROM sys_user WHERE role_id = ?',
      [role_id]
    );
    users.forEach(u => clearPermissionCache(u.id));
    clearAllPermissionCache();

    res.json({
      code: 200,
      message: '更新成功',
      data: null
    });
  } catch (error) {
    await connection.rollback();
    console.error('Update role permissions error:', error);
    res.status(500).json({
      code: 500,
      message: '更新失败',
      data: null
    });
  } finally {
    connection.release();
  }
});

// 获取数据权限配置
router.get('/data-scope/:roleId', authenticateToken, async (req, res) => {
  try {
    const { roleId } = req.params;

    const [configs] = await pool.query(
      `SELECT module, data_scope, custom_dept_ids
       FROM sys_data_permission
       WHERE role_id = ?`,
      [roleId]
    );

    res.json({
      code: 200,
      message: '查询成功',
      data: configs
    });
  } catch (error) {
    console.error('Get data scope error:', error);
    res.status(500).json({
      code: 500,
      message: '查询失败',
      data: null
    });
  }
});

// 更新数据权限配置
router.post('/data-scope/update', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { role_id, configs } = req.body;

    await connection.beginTransaction();

    // 删除原有配置
    await connection.query(
      'DELETE FROM sys_data_permission WHERE role_id = ?',
      [role_id]
    );

    // 插入新配置
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

    // 清除该角色所有用户的权限缓存
    const [users] = await pool.query(
      'SELECT id FROM sys_user WHERE role_id = ?',
      [role_id]
    );
    users.forEach(u => clearPermissionCache(u.id));
    clearAllPermissionCache();

    res.json({
      code: 200,
      message: '更新成功',
      data: null
    });
  } catch (error) {
    await connection.rollback();
    console.error('Update data scope error:', error);
    res.status(500).json({
      code: 500,
      message: '更新失败',
      data: null
    });
  } finally {
    connection.release();
  }
});

function buildPermissionTree(permissions, parentId = 0) {
  return permissions
    .filter(p => p.parent_id === parentId)
    .map(p => ({
      ...p,
      children: buildPermissionTree(permissions, p.id)
    }));
}

// 新增权限节点
router.post('/add', authenticateToken, async (req, res) => {
  try {
    const { name, code, type, parent_id, path, icon, sort } = req.body;
    if (!name || !code || !type) {
      return res.status(400).json({ code: 400, message: '名称、编码、类型不能为空', data: null });
    }
    const [existing] = await pool.query('SELECT id FROM sys_permission WHERE code = ?', [code]);
    if (existing.length > 0) {
      return res.status(400).json({ code: 400, message: '权限编码已存在', data: null });
    }
    await pool.query(
      'INSERT INTO sys_permission (name, code, type, parent_id, path, icon, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, code, type, parent_id || 0, path || null, icon || null, sort || 0]
    );
    clearAllPermissionCache();
    res.json({ code: 200, message: '新增成功', data: null });
  } catch (error) {
    console.error('Add permission error:', error);
    res.status(500).json({ code: 500, message: '新增失败', data: null });
  }
});

// 编辑权限节点
router.post('/update-node', authenticateToken, async (req, res) => {
  try {
    const { id, name, code, type, parent_id, path, icon, sort } = req.body;
    if (!id) {
      return res.status(400).json({ code: 400, message: 'ID不能为空', data: null });
    }
    await pool.query(
      'UPDATE sys_permission SET name=?, code=?, type=?, parent_id=?, path=?, icon=?, sort=? WHERE id=?',
      [name, code, type, parent_id || 0, path || null, icon || null, sort || 0, id]
    );
    clearAllPermissionCache();
    res.json({ code: 200, message: '修改成功', data: null });
  } catch (error) {
    console.error('Update permission error:', error);
    res.status(500).json({ code: 500, message: '修改失败', data: null });
  }
});

// 删除权限节点
router.post('/delete-node', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ code: 400, message: 'ID不能为空', data: null });
    }
    // 检查是否有子权限
    const [children] = await pool.query('SELECT id FROM sys_permission WHERE parent_id = ?', [id]);
    if (children.length > 0) {
      return res.status(400).json({ code: 400, message: '存在子权限，请先删除子权限', data: null });
    }
    await connection.beginTransaction();
    await connection.query('DELETE FROM sys_role_permission WHERE permission_id = ?', [id]);
    await connection.query('DELETE FROM sys_permission WHERE id = ?', [id]);
    await connection.commit();
    clearAllPermissionCache();
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    await connection.rollback();
    console.error('Delete permission error:', error);
    res.status(500).json({ code: 500, message: '删除失败', data: null });
  } finally {
    connection.release();
  }
});

module.exports = router;
