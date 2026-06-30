const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validate, Joi } = require('../middleware/validate');
const { checkPermission, checkDataPermission, buildDataPermissionWhere } = require('../middleware/permission');
const { logFieldChanges } = require('../utils/fieldLog');
const ROLES = require('../config/roles');
const opportunityService = require('../services/opportunityService');

const MODULE_NAME = '商机管理';
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
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page: { type: integer, default: 1 }
 *               pageSize: { type: integer, default: 10 }
 *               keyword: { type: string }
 *               stage: { type: integer, enum: [1, 2, 3, 4, 5, 6], description: '1=初步接洽 2=需求分析 3=方案报价 4=谈判 5=成交 6=丢单' }
 *     responses:
 *       200:
 *         description: 商机列表
 *
 * /api/opportunity:
 *   post:
 *     summary: 新增商机
 *     tags: [商机管理]
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
 *               stage: { type: integer, default: 1 }
 *     responses:
 *       200:
 *         description: 创建成功
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

// 1. 商机列表
router.post('/list', authenticateToken, checkDataPermission('opportunity', 'owner_id'), validate(opportunityListSchema), async (req, res) => {
  try {
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const result = await opportunityService.listOpportunities(pool, req.body, { clause, params: permParams });
    res.json({ code: 200, message: '获取商机列表成功', data: { ...result, page: parseInt(req.body.page) || 1, pageSize: parseInt(req.body.pageSize) || 10 } });
  } catch (error) {
    console.error('获取商机列表错误:', error);
    res.status(500).json({ code: 500, message: '获取商机列表失败', data: null });
  }
});

// 2. 添加商机
router.post('/add', authenticateToken, checkPermission('opportunity:add'), validate(addOpportunitySchema), async (req, res) => {
  try {
    const result = await opportunityService.createOpportunity(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '添加商机成功', data: result });
  } catch (error) {
    const status = error.code || 500;
    console.error('添加商机错误:', error);
    res.status(status).json({ code: status, message: error.message || '添加商机失败', data: null });
  }
});

// 3. 修改商机
router.post('/update', authenticateToken, checkPermission('opportunity:edit'), checkDataPermission('opportunity', 'owner_id'), validate(updateOpportunitySchema), async (req, res) => {
  try {
    const { id, ...data } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '商机ID不能为空', data: null });

    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const existing = await opportunityService.getOpportunityWithPermission(pool, id, { clause, params: permParams });
    if (!existing) return res.status(403).json({ code: 403, message: '无权修改该商机', data: null });

    const oldData = await opportunityService.updateOpportunity(pool, id, data);

    const oppFields = ['customer_id', 'name', 'expected_amount', 'expected_date', 'stage', 'win_rate', 'remark', 'owner_id'];
    await logFieldChanges(req, { module: MODULE_NAME, action: '编辑', oldData, newData: req.body, allowedFields: oppFields, description: `修改商机 "${oldData.name}" 字段变更` });
    res.json({ code: 200, message: '修改商机成功', data: null });
  } catch (error) {
    console.error('修改商机错误:', error);
    res.status(500).json({ code: 500, message: '修改商机失败', data: null });
  }
});

// 4. 推进阶段
router.post('/update-stage', authenticateToken, checkPermission('opportunity:edit'), checkDataPermission('opportunity', 'owner_id'), async (req, res) => {
  try {
    const { id, stage } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '商机ID不能为空', data: null });

    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const existing = await opportunityService.getOpportunityWithPermission(pool, id, { clause, params: permParams });
    if (!existing) return res.status(403).json({ code: 403, message: '无权修改该商机', data: null });

    const result = await opportunityService.advanceStage(pool, id, stage, req.user.userId);
    res.json({ code: 200, message: `阶段已从"${opportunityService.STAGE_MAP[result.oldStage]}"推进至"${result.stageName}"`, data: null });
  } catch (error) {
    const status = error.code || 500;
    console.error('推进阶段错误:', error);
    res.status(status).json({ code: status, message: error.message || '推进阶段失败', data: null });
  }
});

// 4.1 获取商机阶段日志
router.get('/stage-log/:id', authenticateToken, async (req, res) => {
  try {
    const logs = await opportunityService.getStageLog(pool, req.params.id);
    res.json({ code: 200, message: '查询成功', data: logs });
  } catch (error) {
    console.error('查询阶段日志错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 4.2 商机阶段停留时间统计
router.get('/stage-stats/:id', authenticateToken, async (req, res) => {
  try {
    const data = await opportunityService.getStageStats(pool, req.params.id);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('阶段统计错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 5. 删除商机
router.post('/delete', authenticateToken, checkPermission('opportunity:delete'), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '商机ID不能为空', data: null });

    const opp = await opportunityService.getOpportunityForPermission(pool, id);
    if (!opp) return res.status(404).json({ code: 404, message: '商机不存在', data: null });

    const { manageAll, userId } = req.user;
    if (!manageAll && !ROLES.ADMIN_ROLE_CODES.has(req.user.roleCode) && opp.owner_id !== userId) {
      return res.status(403).json({ code: 403, message: '无权删除该商机', data: null });
    }

    await opportunityService.deleteOpportunity(pool, id);
    res.json({ code: 200, message: '删除商机成功', data: null });
  } catch (error) {
    console.error('删除商机错误:', error);
    res.status(500).json({ code: 500, message: '删除商机失败', data: null });
  }
});

// 6. 商机详情
router.get('/detail/:id', authenticateToken, checkDataPermission('opportunity', 'owner_id'), async (req, res) => {
  try {
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const data = await opportunityService.getOpportunityWithPermission(pool, req.params.id, { clause, params: permParams });
    if (!data) return res.status(404).json({ code: 404, message: '商机不存在', data: null });
    res.json({ code: 200, message: '获取商机详情成功', data });
  } catch (error) {
    console.error('获取商机详情错误:', error);
    res.status(500).json({ code: 500, message: '获取商机详情失败', data: null });
  }
});

// 7. 销售漏斗统计
router.get('/funnel', authenticateToken, checkDataPermission('opportunity', 'owner_id'), async (req, res) => {
  try {
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const data = await opportunityService.getFunnelStats(pool, { clause, params: permParams });
    res.json({ code: 200, message: '获取销售漏斗成功', data });
  } catch (error) {
    console.error('获取销售漏斗错误:', error);
    res.status(500).json({ code: 500, message: '获取销售漏斗失败', data: null });
  }
});

// 8. 商机阶段变更日志（带数据权限）
router.get('/stage-log/:id', authenticateToken, checkDataPermission('opportunity', 'owner_id'), async (req, res) => {
  try {
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const existing = await opportunityService.getOpportunityWithPermission(pool, req.params.id, { clause, params: permParams });
    if (!existing) return res.status(404).json({ code: 404, message: '商机不存在', data: null });
    const logs = await opportunityService.getStageLog(pool, req.params.id);
    res.json({ code: 200, message: '查询成功', data: logs.map(l => ({ ...l, from_stage_name: opportunityService.STAGE_MAP[l.from_stage], to_stage_name: opportunityService.STAGE_MAP[l.to_stage] })) });
  } catch (error) {
    console.error('获取阶段变更日志错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

module.exports = router;
