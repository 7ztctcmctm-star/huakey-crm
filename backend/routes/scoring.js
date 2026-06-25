const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

const requireAdmin = require('../middleware/admin');
const { requireManager } = require('../middleware/admin');

const scoringService = require('../services/scoringRouteService');

// 获取所有评分规则
router.get('/rules', authenticateToken, checkPermission('scoring'), async (req, res) => {
  try {
    const rows = await scoringService.getRules(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[评分] 获取规则失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建评分规则
router.post('/rules', authenticateToken, checkPermission('scoring'), requireAdmin, async (req, res) => {
  try {
    const { name, score } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: '规则名称不能为空', data: null });
    }
    if (score === undefined || score === null) {
      return res.status(400).json({ code: 400, message: '分数不能为空', data: null });
    }

    const result = await scoringService.createRule(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    console.error('[评分] 创建规则失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新评分规则
router.put('/rules/:id', authenticateToken, checkPermission('scoring'), requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await scoringService.updateRule(pool, id, req.body);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ code: error.statusCode, message: error.message, data: null });
    }
    console.error('[评分] 更新规则失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除评分规则
router.delete('/rules/:id', authenticateToken, checkPermission('scoring'), requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await scoringService.deleteRule(pool, id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[评分] 删除规则失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 计算单个客户评分
router.post('/calculate/:customerId', authenticateToken, checkPermission('scoring'), requireManager, async (req, res) => {
  try {
    const { customerId } = req.params;
    const data = await scoringService.calculateScore(pool, customerId);
    res.json({ code: 200, message: '评分计算完成', data });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ code: error.statusCode, message: error.message, data: null });
    }
    console.error('[评分] 计算评分失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 批量计算所有客户评分
router.post('/batch-calculate', authenticateToken, checkPermission('scoring'), requireAdmin, async (req, res) => {
  try {
    const result = await scoringService.batchCalculate(pool);
    res.json({ code: 200, message: '批量评分完成', data: result });
  } catch (error) {
    console.error('[评分] 批量评分失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 评分排行榜
router.get('/ranking', authenticateToken, checkPermission('scoring'), async (req, res) => {
  try {
    const rows = await scoringService.getRanking(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[评分] 排行榜查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 获取客户评分详情（含评分历史）
router.get('/customer/:customerId', authenticateToken, checkPermission('scoring'), async (req, res) => {
  try {
    const { customerId } = req.params;
    const data = await scoringService.getCustomerScore(pool, customerId);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ code: error.statusCode, message: error.message, data: null });
    }
    console.error('[评分] 客户评分详情查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;
