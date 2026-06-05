const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { clearConfigCache, getOverdueDays } = require('../utils/config');
const notification = require('../utils/notification');

const router = express.Router();

// 获取逾期天数（所有登录用户可用）
router.get('/overdue-days', authenticateToken, async (req, res) => {
  try {
    const days = await getOverdueDays();
    res.json({ code: 200, message: '查询成功', data: { overdue_days: days } });
  } catch (error) {
    console.error('[配置] 获取逾期天数失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 获取所有配置
router.get('/list', authenticateToken, async (req, res) => {
  try {
    // 仅管理员可查看配置
    if (req.user.roleId !== 1 && req.user.roleId !== 2) {
      return res.status(403).json({ code: 403, message: '无权查看系统配置', data: null });
    }

    const [rows] = await pool.query('SELECT config_key, config_value, description FROM sys_config ORDER BY id');
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[配置] 获取配置错误:', error);
    res.status(500).json({ code: 500, message: '获取配置失败', data: null });
  }
});

// 更新配置
router.post('/update', authenticateToken, async (req, res) => {
  try {
    if (req.user.roleId !== 1 && req.user.roleId !== 2) {
      return res.status(403).json({ code: 403, message: '无权修改系统配置', data: null });
    }

    const { configs } = req.body;
    if (!configs || !Array.isArray(configs) || configs.length === 0) {
      return res.status(400).json({ code: 400, message: '配置数据不能为空', data: null });
    }

    for (const item of configs) {
      if (!item.config_key || item.config_value === undefined) continue;
      await pool.query(
        'UPDATE sys_config SET config_value = ? WHERE config_key = ?',
        [String(item.config_value), item.config_key]
      );
    }

    clearConfigCache();
    res.json({ code: 200, message: '配置更新成功', data: null });
  } catch (error) {
    console.error('[配置] 更新配置错误:', error);
    res.status(500).json({ code: 500, message: '更新配置失败', data: null });
  }
});

// 测试企业微信通知
router.post('/test-notification', authenticateToken, async (req, res) => {
  try {
    await notification.sendText('🔔 CRM 通知测试\n\n如果您收到这条消息，说明企业微信通知配置成功！');
    res.json({ code: 200, message: '测试消息已发送', data: null });
  } catch (error) {
    console.error('[配置] 测试通知失败:', error);
    res.status(500).json({ code: 500, message: '发送失败: ' + error.message, data: null });
  }
});

module.exports = router;
