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
  remark: Joi.string().max(500).allow('', null),
  idempotency_key: Joi.string().max(64).allow('', null)
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

// [A3 2026-10-19] 回款端点此前一律用只读的 `contract` 校验，连新增/修改/删除也只要
//   「能看合同」即可 ⇒ 销售（持有 contract / contract:edit）可任意登记、篡改、删除回款。
//   现拆分为独立 payment 域：写操作走 payment:edit，读操作走 payment:view。
//   角色矩阵见 scripts/init_role_permissions.js：boss/manager/finance 持有，sales 不持有。
router.post('/payment/add', authenticateToken, checkPermission('payment:edit'), checkDataPermission('contract', 'create_by'), validate(paymentAddSchema), contractController.addPayment);

router.post('/payment/update', authenticateToken, checkPermission('payment:edit'), checkDataPermission('contract', 'create_by'), validate(paymentUpdateSchema), contractController.updatePayment);

router.post('/payment/delete', authenticateToken, checkPermission('payment:edit'), checkDataPermission('contract', 'create_by'), validate(paymentDeleteSchema), contractController.deletePayment);

// 回款管理：回款列表 + 逾期未回款
router.post('/payment/list', authenticateToken, checkPermission('payment:view'), checkDataPermission('contract', 'create_by'), validate(paymentListSchema), contractController.listPayments);

// 回款合并视图（计划+记录）
router.post('/payment/merged', authenticateToken, checkPermission('payment:view'), checkDataPermission('contract', 'create_by'), validate(paymentMergedSchema), contractController.getMergedPayments);

// 客户对账汇总
router.post('/payment/summary', authenticateToken, checkPermission('payment:view'), checkDataPermission('contract', 'create_by'), validate(paymentSummarySchema), contractController.getPaymentSummary);

// 对账单导出
router.post('/payment/statement-export', authenticateToken, checkPermission('payment:view'), checkDataPermission('contract', 'create_by'), validate(statementExportSchema), contractController.exportStatement);

module.exports = router;
