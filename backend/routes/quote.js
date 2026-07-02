const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission, checkDataPermission, checkFieldPermission } = require('../middleware/permission');
const quoteController = require('../controllers/quoteController');
const { validate, Joi } = require('../middleware/validate');

const router = express.Router();

// Joi schemas
const quoteItemSchema = Joi.object({
  product_id: Joi.number().integer().positive().required(),
  quantity: Joi.number().integer().min(1).optional(),
  unit_price: Joi.number().min(0).optional(),
  remark: Joi.string().max(500).allow('', null)
});

const addQuoteSchema = Joi.object({
  customer_id: Joi.number().integer().positive().optional(),
  opportunity_id: Joi.number().integer().positive().allow(null),
  items: Joi.array().items(quoteItemSchema).optional(),
  discount: Joi.number().min(0).max(1).optional(),
  valid_days: Joi.number().integer().min(1).optional(),
  remark: Joi.string().max(2000).allow('', null),
  currency: Joi.string().max(10).optional(),
  exchange_rate: Joi.number().min(0).optional()
});

const listQuoteSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).optional(),
  quote_no: Joi.string().max(100).allow('', null),
  customer_name: Joi.string().max(200).allow('', null),
  status: Joi.number().integer().valid(1, 2, 3, 4).allow('', null),
  approval_status: Joi.number().integer().valid(1, 2, 3).allow('', null)
});

const updateQuoteSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  customer_id: Joi.number().integer().positive().optional(),
  items: Joi.array().items(quoteItemSchema).min(1).optional(),
  discount: Joi.number().min(0).max(1).optional(),
  valid_days: Joi.number().integer().min(1).optional(),
  remark: Joi.string().max(2000).allow('', null),
  status: Joi.number().integer().valid(1, 2, 3, 4).optional()
});

const idOnlySchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const approveQuoteSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  approval_status: Joi.number().integer().valid(2, 3).required(),
  approval_remark: Joi.string().max(1000).allow('', null)
});

// 字段级权限：报价成本价仅管理员可见
router.use(checkFieldPermission('quote'));

// 1. 创建报价单
router.post('/add', authenticateToken, checkPermission('quotation:add'), validate(addQuoteSchema), quoteController.add);

// 2. 报价单列表
router.post('/list', authenticateToken, checkPermission('quotation'), checkDataPermission('quote', 'create_by'), validate(listQuoteSchema), quoteController.list);

// 3. 报价单详情
router.get('/detail/:id', authenticateToken, checkDataPermission('quote', 'create_by'), quoteController.detail);

// 4. 修改报价单
router.post('/update', authenticateToken, checkPermission('quotation:edit'), validate(updateQuoteSchema), quoteController.update);

// 5. 删除报价单
router.post('/delete', authenticateToken, checkPermission('quotation:delete'), validate(idOnlySchema), quoteController.remove);

// 6. 报价转合同
router.post('/to-contract', authenticateToken, checkPermission('quotation:edit'), validate(idOnlySchema), quoteController.toContract);

// 审批报价单（仅管理员）
router.post('/approve', authenticateToken, validate(approveQuoteSchema), quoteController.approve);

module.exports = router;
