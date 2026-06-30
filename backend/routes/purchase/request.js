/**
 * 采购申请路由
 * 路径前缀: /api/purchase/request
 */

const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { validate, Joi } = require('../../middleware/validate');
const purchaseRequestService = require('../../services/purchaseRequestService');
const logger = require('../../config/logger');

const MODULE_NAME = '采购申请';

const listSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  status: Joi.string().valid('draft', 'pending', 'approved', 'rejected', 'ordered', 'cancelled').allow('', null),
  keyword: Joi.string().max(200).allow('', null)
});

const createSchema = Joi.object({
  title: Joi.string().max(200).required(),
  dept_id: Joi.number().integer().allow(null),
  expected_amount: Joi.number().precision(2).min(0).allow(null),
  reason: Joi.string().max(2000).allow('', null)
});

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const rejectSchema = Joi.object({
  reason: Joi.string().max(500).required()
});

const cancelSchema = Joi.object({
  reason: Joi.string().max(500).allow('', null)
});

function handleServiceError(res, error) {
  logger.error(`[${MODULE_NAME}]`, { error: error.stack || error.message });
  const statusCode = error.code || 500;
  const message = error.message || '操作失败';
  res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
    code: statusCode,
    message,
    data: null
  });
}

// 采购申请列表
router.post('/list', authenticateToken, validate(listSchema), async (req, res) => {
  try {
    const data = await purchaseRequestService.listRequests(pool, req.body, req.user);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// 创建采购申请
router.post('/create', authenticateToken, validate(createSchema), async (req, res) => {
  try {
    const data = await purchaseRequestService.createRequest(pool, req.body, req.user.userId);
    res.status(201).json({ code: 201, message: '创建成功', data });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// 提交采购申请
router.post('/submit/:id', authenticateToken, validate(idParamSchema, 'params'), async (req, res) => {
  try {
    await purchaseRequestService.submitRequest(pool, req.params.id, req.user);
    res.json({ code: 200, message: '提交成功', data: null });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// 审批通过
router.post('/approve/:id', authenticateToken, validate(idParamSchema, 'params'), async (req, res) => {
  try {
    await purchaseRequestService.approveRequest(pool, req.params.id, req.user);
    res.json({ code: 200, message: '审批通过', data: null });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// 审批驳回
router.post('/reject/:id', authenticateToken, validate(idParamSchema, 'params'), validate(rejectSchema), async (req, res) => {
  try {
    await purchaseRequestService.rejectRequest(pool, req.params.id, req.user, req.body.reason);
    res.json({ code: 200, message: '已驳回', data: null });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// 撤销采购申请
router.post('/cancel/:id', authenticateToken, validate(idParamSchema, 'params'), validate(cancelSchema), async (req, res) => {
  try {
    await purchaseRequestService.cancelRequest(pool, req.params.id, req.user, req.body.reason);
    res.json({ code: 200, message: '已撤销', data: null });
  } catch (error) {
    handleServiceError(res, error);
  }
});

module.exports = router;
