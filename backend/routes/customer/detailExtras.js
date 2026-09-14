/**
 * 客户详情·附加能力端点（2026-09-14 阶段3 从 detail.js 抽出，供两条命名空间复用）
 *
 * 抽出原因：这 3 个端点既是老树 /api/v1/customer 的能力端点，也要在阶段3 挂到
 *          新树 /api/v1/customers 下。抽成独立 router 后**两处挂载同一对象**，
 *          避免复制粘贴造成两份实现。
 *
 * 挂载点：
 *   - /api/v1/customer  ← routes/customer/detail.js 内 `router.use('/', detailExtras)`（兼容层）
 *   - /api/v1/customers ← backend/app.js 直接挂载（新命名空间）
 *
 * 端点：
 *   GET /overdue       逾期客户列表       [customer:view]
 *   GET /near-recycle  即将回收客户列表   [customer:view]
 *   GET /:id/360       客户 360 度视图    [customer:view]
 */

const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission, checkDataPermission, buildDataPermissionWhere } = require('../../middleware/permission');
const { queryValidate, Joi } = require('../../middleware/validate');
const customerController = require('../../controllers/customerController');
const customerService = require('../../services/customerService');
const logger = require('../../config/logger');

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional()
});

const router = express.Router();

// 客户360度视图
router.get('/:id/360',
  authenticateToken,
  checkPermission('customer:view'),
  checkDataPermission('customer', 'owner_id'),
  customerController.view360
);

// 逾期客户列表
router.get('/overdue',
  authenticateToken,
  checkPermission('customer:view'),
  checkDataPermission('customer', 'owner_id'),
  queryValidate(paginationSchema),
  async (req, res, next) => {
    try {
      const permission = await buildDataPermissionWhere(req.dataPermission, 'c');
      const data = await customerService.getOverdueCustomers(pool, req.query, permission);
      res.json({ code: 200, message: '获取逾期客户列表成功', data });
    } catch (error) {
      logger.error('获取逾期客户列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
      next(error);
    }
  }
);

// 即将回收客户列表
router.get('/near-recycle',
  authenticateToken,
  checkPermission('customer:view'),
  checkDataPermission('customer', 'owner_id'),
  queryValidate(paginationSchema),
  async (req, res, next) => {
    try {
      const permission = await buildDataPermissionWhere(req.dataPermission, 'c');
      const data = await customerService.getNearRecycleCustomersList(pool, req.query, permission);
      res.json({ code: 200, message: '获取即将回收客户列表成功', data });
    } catch (error) {
      logger.error('获取即将回收客户列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
      next(error);
    }
  }
);

module.exports = router;
