const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission, checkDataPermission } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const contractController = require('../../controllers/contractController');

// --- Joi schemas ---

const paymentAddSchema = Joi.object({
  contract_id: Joi.number().integer().positive().required(),
  plan_id: Joi.number().integer().positive().allow(null),
  pay_date: Joi.date().iso().required(),
  pay_amount: Joi.number().precision(2).min(0).required(),
  pay_method: Joi.string().max(50).allow('', null),
  remark: Joi.string().max(500).allow('', null)
});

const paymentUpdateSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  pay_date: Joi.date().iso().required(),
  pay_amount: Joi.number().precision(2).min(0).required(),
  pay_method: Joi.string().max(50).allow('', null),
  remark: Joi.string().max(500).allow('', null)
});

const paymentDeleteSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const paymentListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  tab: Joi.string().valid('all', 'overdue', 'summary').allow('', null),
  keyword: Joi.string().max(100).allow('', null),
  start_date: Joi.string().isoDate().allow('', null),
  end_date: Joi.string().isoDate().allow('', null)
});

const paymentMergedSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  keyword: Joi.string().max(100).allow('', null),
  start_date: Joi.string().isoDate().allow('', null),
  end_date: Joi.string().isoDate().allow('', null)
});

const paymentSummarySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional()
});

const statementExportSchema = Joi.object({
  keyword: Joi.string().max(100).allow('', null),
  start_date: Joi.string().isoDate().allow('', null),
  end_date: Joi.string().isoDate().allow('', null)
});

// --- Routes ---

router.post('/payment/add', authenticateToken, checkPermission('contract'), checkDataPermission('contract', 'create_by'), validate(paymentAddSchema), contractController.addPayment);

router.post('/payment/update', authenticateToken, checkPermission('contract'), checkDataPermission('contract', 'create_by'), validate(paymentUpdateSchema), contractController.updatePayment);

router.post('/payment/delete', authenticateToken, checkPermission('contract'), checkDataPermission('contract', 'create_by'), validate(paymentDeleteSchema), contractController.deletePayment);

// 回款管理：回款列表 + 逾期未回款
router.post('/payment/list', authenticateToken, checkPermission('contract'), checkDataPermission('contract', 'create_by'), validate(paymentListSchema), contractController.listPayments);

// 回款合并视图（计划+记录）
router.post('/payment/merged', authenticateToken, checkPermission('contract'), checkDataPermission('contract', 'create_by'), validate(paymentMergedSchema), contractController.getMergedPayments);

// 客户对账汇总
router.post('/payment/summary', authenticateToken, checkPermission('contract'), checkDataPermission('contract', 'create_by'), validate(paymentSummarySchema), contractController.getPaymentSummary);

// 对账单导出
router.post('/payment/statement-export', authenticateToken, checkPermission('contract'), checkDataPermission('contract', 'create_by'), validate(statementExportSchema), contractController.exportStatement);

module.exports = router;
