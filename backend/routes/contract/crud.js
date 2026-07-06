const express = require('express');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: 合同管理
 *     description: 合同 CRUD、审批、回款、导出
 *
 * /api/contract/list:
 *   post:
 *     summary: 获取合同列表（分页 + 筛选）
 *     tags: [合同管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page: { type: integer, example: 1 }
 *               pageSize: { type: integer, example: 20 }
 *               keyword: { type: string }
 *               status: { type: integer, enum: [1, 2, 3, 4], description: '1=执行中 2=已完结 3=已终止 4=待审批' }
 *               customer_id: { type: integer }
 *               approval_status: { type: integer, enum: [1, 2, 3] }
 *               payment_status: { type: string, enum: [overdue, partial, completed, pending] }
 *     responses:
 *       200:
 *         description: 合同列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     list: { type: array, items: { type: object } }
 *                     total: { type: integer }
 *       401: { description: 未登录或 token 过期 }
 *       403: { description: 无权限访问 }
 *       500: { description: 服务器内部错误 }
 *
 * /api/contract/add:
 *   post:
 *     summary: 新建合同
 *     tags: [合同管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customer_id, amount]
 *             properties:
 *               customer_id: { type: integer, example: 1 }
 *               opportunity_id: { type: integer }
 *               amount: { type: number, example: 100000 }
 *               sign_date: { type: string, format: date }
 *               delivery_date: { type: string, format: date }
 *               payment_terms: { type: string }
 *               remark: { type: string }
 *               plans:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     plan_date: { type: string, format: date }
 *                     plan_amount: { type: number }
 *                     remark: { type: string }
 *     responses:
 *       200:
 *         description: 创建成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 message: { type: string }
 *                 data: { type: object }
 *       400: { description: 参数错误 }
 *       401: { description: 未登录或 token 过期 }
 *       403: { description: 无权限访问 }
 *       500: { description: 服务器内部错误 }
 */
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission, checkDataPermission, checkFieldPermission } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const { cache } = require('../../middleware/cache');
const contractController = require('../../controllers/contractController');

// 字段级权限：合同金额仅管理员可见
router.use(checkFieldPermission('contract'));

// --- Joi schemas ---

const listSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  keyword: Joi.string().max(200).allow('', null),
  status: Joi.number().integer().valid(1, 2, 3, 4).allow('', null),
  customer_id: Joi.number().integer().positive().allow('', null),
  approval_status: Joi.number().integer().valid(1, 2, 3).allow('', null),
  payment_status: Joi.string().valid('overdue', 'partial', 'completed', 'pending').allow('', null)
});

const addContractSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  opportunity_id: Joi.number().integer().positive().allow(null),
  amount: Joi.number().precision(2).min(0).required(),
  sign_date: Joi.date().iso().allow(null),
  delivery_date: Joi.date().iso().allow(null),
  payment_terms: Joi.string().max(500).allow('', null),
  remark: Joi.string().max(2000).allow('', null),
  plans: Joi.array().items(Joi.object({
    plan_date: Joi.date().iso().required(),
    plan_amount: Joi.number().precision(2).min(0).required(),
    remark: Joi.string().max(500).allow('', null)
  })).allow(null)
});

const updateContractSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  customer_id: Joi.number().integer().positive().required(),
  opportunity_id: Joi.number().integer().positive().allow(null),
  amount: Joi.number().precision(2).min(0).required(),
  sign_date: Joi.date().iso().allow(null),
  delivery_date: Joi.date().iso().allow(null),
  payment_terms: Joi.string().max(500).allow('', null),
  status: Joi.number().integer().valid(1, 2, 3, 4),
  remark: Joi.string().max(2000).allow('', null),
  plans: Joi.array().items(Joi.object({
    id: Joi.number().integer().positive().allow(null),
    plan_date: Joi.date().iso().required(),
    plan_amount: Joi.number().precision(2).min(0).required(),
    remark: Joi.string().max(500).allow('', null)
  })).allow(null),
  delete_plan_ids: Joi.array().items(Joi.number().integer().positive()).allow(null)
});

const deleteContractSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

// --- Routes ---

router.post('/list', authenticateToken, cache(60), checkPermission('contract'), checkDataPermission('contract', 'create_by'), validate(listSchema), contractController.listContracts);

router.get('/detail/:id', authenticateToken, checkDataPermission('contract', 'create_by'), contractController.getContractDetail);

router.post('/add', authenticateToken, checkPermission('contract:add'), validate(addContractSchema), contractController.createContract);

router.post('/update', authenticateToken, checkPermission('contract:edit'), validate(updateContractSchema), contractController.updateContract);

router.post('/delete', authenticateToken, checkPermission('contract:delete'), validate(deleteContractSchema), contractController.deleteContract);

router.get('/opportunity-list', authenticateToken, checkDataPermission('opportunity', 'owner_id'), contractController.getOpportunityList);

// 合同搜索（轻量级，供快速回款录入选择合同）
router.get('/search', authenticateToken, contractController.searchContracts);

module.exports = router;
