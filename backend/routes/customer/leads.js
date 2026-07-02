const express = require('express');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const customerController = require('../../controllers/customerController');

const router = express.Router();

// Validation schemas
const convertSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const claimSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const markLostSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const importLeadsSchema = Joi.object({
  leads: Joi.array().items(Joi.object({
    company_name: Joi.string().required(),
    contact_name: Joi.string().allow('', null),
    phone: Joi.string().allow('', null),
    source: Joi.string().allow('', null)
  })).min(1).required()
});

const batchConvertSchema = Joi.object({
  ids: Joi.array().items(Joi.number().integer().positive()).min(1).required()
});

const leadsListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  company_name: Joi.string().max(200).allow('', null),
  contact_name: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  source: Joi.string().max(50).allow('', null),
  lead_level: Joi.string().valid('A', 'B', 'C').allow('', null),
  follow_status: Joi.string().max(50).allow('', null),
  owner_id: Joi.number().integer().positive().allow('', null)
});

// 线索列表
router.post('/list', authenticateToken, checkPermission('leads'), validate(leadsListSchema), customerController.listLeads);

// 线索转化：将线索转为潜客（status 5→1）
router.post('/convert', authenticateToken, checkPermission('leads'), validate(convertSchema), customerController.convertLead);

// 批量转化线索
router.post('/batch-convert', authenticateToken, checkPermission('leads'), validate(batchConvertSchema), customerController.batchConvertLeads);

// 导入线索
router.post('/import', authenticateToken, checkPermission('leads'), validate(importLeadsSchema), customerController.importLeads);

// 销售领取线索
router.post('/claim', authenticateToken, checkPermission('leads'), validate(claimSchema), customerController.claimLead);

// 销售标记线索为已流失
router.post('/mark-lost', authenticateToken, checkPermission('leads'), validate(markLostSchema), customerController.markLeadLost);

// 线索统计
router.get('/stats', authenticateToken, checkPermission('leads'), customerController.getLeadsStats);

module.exports = router;
