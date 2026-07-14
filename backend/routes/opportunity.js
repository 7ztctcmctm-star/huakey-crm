const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { validate, Joi } = require('../middleware/validate');
const { checkPermission, checkDataPermission } = require('../middleware/permission');
const opportunityController = require('../controllers/opportunityController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: 商机管理
 *     description: 商机 CRUD、阶段管理、成交/丢单
 *
 * /api/opportunity/list:
 *   post:
 *     summary: 获取商机列表（分页 + 筛选）
 *     tags: [商机管理]
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
 *               stage: { type: integer, enum: [1, 2, 3, 4, 5, 6], description: '1=初步接洽 2=需求分析 3=方案报价 4=谈判 5=成交 6=丢单' }
 *               customer_id: { type: integer }
 *     responses:
 *       200:
 *         description: 商机列表
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
 * /api/opportunity/add:
 *   post:
 *     summary: 新增商机
 *     tags: [商机管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, customer_id]
 *             properties:
 *               name: { type: string, example: 年度框架合同 }
 *               customer_id: { type: integer, example: 1 }
 *               expected_amount: { type: number, example: 50000 }
 *               expected_date: { type: string, format: date }
 *               stage: { type: integer, enum: [1, 2, 3, 4, 5, 6], default: 1 }
 *               win_rate: { type: integer, minimum: 0, maximum: 100 }
 *               remark: { type: string }
 *               owner_id: { type: integer }
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

const opportunityListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  keyword: Joi.string().max(200).allow('', null),
  stage: Joi.number().integer().valid(1, 2, 3, 4, 5, 6).allow('', null),
  customer_id: Joi.number().integer().positive().allow('', null)
});

const addOpportunitySchema = Joi.object({
  name: Joi.string().required().max(200),
  customer_id: Joi.number().integer().positive().required(),
  expected_amount: Joi.number().precision(2).min(0).allow(null),
  expected_date: Joi.date().iso().allow(null),
  stage: Joi.number().integer().valid(1, 2, 3, 4, 5, 6).default(1),
  win_rate: Joi.number().integer().min(0).max(100).allow(null),
  remark: Joi.string().max(2000).allow('', null),
  owner_id: Joi.number().integer().positive().allow(null)
});

const updateOpportunitySchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  name: Joi.string().max(200),
  customer_id: Joi.number().integer().positive(),
  expected_amount: Joi.number().precision(2).min(0).allow(null),
  expected_date: Joi.date().iso().allow(null),
  stage: Joi.number().integer().valid(1, 2, 3, 4, 5, 6),
  win_rate: Joi.number().integer().min(0).max(100).allow(null),
  remark: Joi.string().max(2000).allow('', null),
  owner_id: Joi.number().integer().positive().allow(null)
});

const updateStageSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  stage: Joi.number().integer().valid(1, 2, 3, 4, 5, 6).required()
});

const deleteOpportunitySchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

// 1. 商机列表
router.post('/list', authenticateToken, checkDataPermission('opportunity', 'owner_id'), validate(opportunityListSchema), opportunityController.list);

// 2. 添加商机
router.post('/add', authenticateToken, checkPermission('opportunity:add'), validate(addOpportunitySchema), opportunityController.add);

// 3. 修改商机
router.post('/update', authenticateToken, checkPermission('opportunity:edit'), checkDataPermission('opportunity', 'owner_id'), validate(updateOpportunitySchema), opportunityController.update);

// 4. 推进阶段
router.post('/update-stage', authenticateToken, checkPermission('opportunity:edit'), checkDataPermission('opportunity', 'owner_id'), validate(updateStageSchema), opportunityController.updateStage);

// 4.1 获取商机阶段日志
router.get('/stage-log/:id', authenticateToken, opportunityController.stageLog);

// 4.2 商机阶段停留时间统计
router.get('/stage-stats/:id', authenticateToken, opportunityController.stageStats);

// 5. 删除商机
router.post('/delete', authenticateToken, checkPermission('opportunity:delete'), validate(deleteOpportunitySchema), opportunityController.delete);

// 6. 商机详情
router.get('/detail/:id', authenticateToken, checkDataPermission('opportunity', 'owner_id'), opportunityController.detail);

// 7. 销售漏斗统计
router.get('/funnel', authenticateToken, checkDataPermission('opportunity', 'owner_id'), opportunityController.funnel);

// 8. 商机阶段变更日志（带数据权限）
router.get('/stage-log/:id', authenticateToken, checkDataPermission('opportunity', 'owner_id'), opportunityController.stageLogWithPermission);

// 9. 商机销售时间轴（Prompt 4-3-7）
router.get('/timeline/:id', authenticateToken, checkDataPermission('opportunity', 'owner_id'), opportunityController.timeline);

module.exports = router;
