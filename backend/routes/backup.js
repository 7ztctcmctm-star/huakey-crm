const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const requireAdmin = require('../middleware/admin');
const backupService = require('../services/backupRouteService');

// 创建备份
router.post('/create', authenticateToken, checkPermission('backup:create'), requireAdmin, async (req, res) => {
  try {
    const result = await backupService.createBackup(pool, req.user.userId);
    res.json({ code: 200, message: '备份任务已创建，正在后台执行', data: result });
  } catch (error) {
    console.error('[备份] 创建备份失败:', error);
    res.status(error.code || 500).json({ code: error.code || 500, message: error.message || '服务器内部错误', data: null });
  }
});

// 获取备份列表
router.post('/list', authenticateToken, checkPermission('backup:create'), async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.body;
    const result = await backupService.listBackups(pool, { page, pageSize });
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    console.error('[备份] 查询备份列表失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 恢复备份（需确认码）
router.post('/restore', authenticateToken, checkPermission('backup:restore'), requireAdmin, async (req, res) => {
  try {
    const { id, confirm_code } = req.body;
    await backupService.restoreBackup(pool, id, confirm_code);
    res.json({ code: 200, message: '恢复任务已执行', data: null });
  } catch (error) {
    console.error('[备份] 恢复备份失败:', error);
    res.status(error.code || 500).json({ code: error.code || 500, message: error.message || '恢复失败', data: null });
  }
});

// 获取备份恢复确认码
router.get('/confirm-code/:id', authenticateToken, checkPermission('backup:restore'), requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const confirmCode = backupService.getConfirmCode(id);
    res.json({ code: 200, message: '查询成功', data: { confirm_code: confirmCode } });
  } catch (error) {
    console.error('[备份] 获取确认码失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除备份文件
router.post('/delete', authenticateToken, checkPermission('backup:create'), requireAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    await backupService.deleteBackup(pool, id);
    res.json({ code: 200, message: '备份已删除', data: null });
  } catch (error) {
    console.error('[备份] 删除备份失败:', error);
    res.status(error.code || 500).json({ code: error.code || 500, message: error.message || '删除失败', data: null });
  }
});

module.exports = router;
