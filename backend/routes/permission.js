const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const requireAdmin = require('../middleware/admin');
const { requireManager } = require('../middleware/admin');
const permRouteService = require('../services/permissionRouteService');

// 获取当前用户权限
// [权限说明] 个人权限查询接口，仅需认证
router.get('/my-permissions', authenticateToken, async (req, res) => {
  try {
    const data = await permRouteService.getMyPermissions(pool, req.user.userId, req.user.roleId);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('[权限] 获取权限错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 获取所有权限列表（树形结构，仅管理员/经理）
router.get('/list', authenticateToken, requireManager, async (req, res) => {
  try {
    const tree = await permRouteService.listPermissions(pool);
    res.json({ code: 200, message: '查询成功', data: tree });
  } catch (error) {
    console.error('[权限] 获取权限列表错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 获取角色权限（仅管理员/经理）
router.get('/role/:roleId', authenticateToken, requireManager, async (req, res) => {
  try {
    const permissionIds = await permRouteService.getRolePermissions(pool, req.params.roleId);
    res.json({ code: 200, message: '查询成功', data: permissionIds });
  } catch (error) {
    console.error('[权限] 获取角色权限错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 更新角色权限
router.post('/role/update', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { role_id, permission_ids } = req.body;
    await permRouteService.updateRolePermissions(pool, role_id, permission_ids);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[权限] 更新角色权限错误:', error);
    res.status(500).json({ code: 500, message: '更新失败', data: null });
  }
});

// 获取数据权限配置（仅管理员/经理）
router.get('/data-scope/:roleId', authenticateToken, requireManager, async (req, res) => {
  try {
    const configs = await permRouteService.getDataScope(pool, req.params.roleId);
    res.json({ code: 200, message: '查询成功', data: configs });
  } catch (error) {
    console.error('[权限] 获取数据权限错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 更新数据权限配置
router.post('/data-scope/update', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { role_id, configs } = req.body;
    await permRouteService.updateDataScope(pool, role_id, configs);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[权限] 更新数据权限错误:', error);
    res.status(500).json({ code: 500, message: '更新失败', data: null });
  }
});

// 新增权限节点
router.post('/add', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await permRouteService.addPermission(pool, req.body);
    if (result.error) return res.status(400).json({ code: 400, message: result.error, data: null });
    res.json({ code: 200, message: '新增成功', data: null });
  } catch (error) {
    console.error('[权限] 添加权限错误:', error);
    res.status(500).json({ code: 500, message: '新增失败', data: null });
  }
});

// 编辑权限节点
router.post('/update-node', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await permRouteService.updatePermission(pool, req.body);
    if (result.error) return res.status(400).json({ code: 400, message: result.error, data: null });
    res.json({ code: 200, message: '修改成功', data: null });
  } catch (error) {
    console.error('[权限] 更新权限错误:', error);
    res.status(500).json({ code: 500, message: '修改失败', data: null });
  }
});

// 删除权限节点
router.post('/delete-node', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await permRouteService.deletePermission(pool, req.body.id);
    if (result.error) return res.status(400).json({ code: 400, message: result.error, data: null });
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[权限] 删除权限错误:', error);
    res.status(500).json({ code: 500, message: '删除失败', data: null });
  }
});

module.exports = router;
