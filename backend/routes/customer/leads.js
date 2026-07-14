const express = require('express');
const { authenticateToken } = require('../../middleware/auth');

const router = express.Router();

/**
 * @deprecated 线索管理模块已废弃（Prompt 4-1）
 * 线索已整合为客户生命周期的"潜客"阶段（customer_type='prospect'）。
 * 统一入口：
 *   - 潜客列表：POST /api/customer/list  （参数 customer_type=prospect）
 *   - 转化为正式客户：POST /api/customer/convert-to-customer
 * 原 /customer/leads/* 全部返回 410 Gone。
 */

function deprecated(res) {
  res.status(410).json({
    code: 410,
    message: '线索模块已废弃：请使用客户列表的"潜客"视图（customer_type=prospect）；转化为正式客户请调用 /api/customer/convert-to-customer',
    data: null
  });
}

router.post('/list', authenticateToken, (req, res) => deprecated(res));
router.post('/convert', authenticateToken, (req, res) => deprecated(res));
router.post('/batch-convert', authenticateToken, (req, res) => deprecated(res));
router.post('/import', authenticateToken, (req, res) => deprecated(res));
router.post('/claim', authenticateToken, (req, res) => deprecated(res));
router.post('/mark-lost', authenticateToken, (req, res) => deprecated(res));
router.get('/stats', authenticateToken, (req, res) => deprecated(res));

module.exports = router;
