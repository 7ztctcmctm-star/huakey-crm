const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission, checkDataPermission, buildDataPermissionWhere, checkFieldPermission, stripRestrictedFields } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const { cache, invalidateCache } = require('../middleware/cache');

const { logFieldChanges } = require('../utils/fieldLog');
const ROLES = require('../config/roles');
const supplierService = require('../services/supplierService');

const MODULE_NAME = '供应商管理';
const { createRouteLogger } = require('../middleware/logger');
const logger = require('../config/logger');
const logAction = createRouteLogger(MODULE_NAME);

/**
 * @swagger
 * tags:
 *   - name: 供应商管理
 *     description: 供应商列表、新增、修改、删除、评分
 *
 * /api/supplier/list:
 *   get:
 *     summary: 获取供应商列表（GET 方式）
 *     tags: [供应商管理]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer }
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [生产, 贸易, 服务] }
 *       - in: query
 *         name: level
 *         schema: { type: string, enum: [核心, 重点, 普通, 备用] }
 *       - in: query
 *         name: status
 *         schema: { type: integer, enum: [1, 2, 3] }
 *     responses:
 *       200:
 *         description: 供应商列表
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
 *   post:
 *     summary: 获取供应商列表（POST 方式，支持分页和筛选）
 *     tags: [供应商管理]
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
 *               type: { type: string, enum: [生产, 贸易, 服务] }
 *               level: { type: string, enum: [核心, 重点, 普通, 备用] }
 *               status: { type: integer, enum: [1, 2, 3] }
 *     responses:
 *       200:
 *         description: 供应商列表
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
 * /api/supplier/add:
 *   post:
 *     summary: 新增供应商
 *     tags: [供应商管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: 示例供应商 }
 *               short_name: { type: string }
 *               type: { type: string, enum: [生产, 贸易, 服务] }
 *               industry: { type: string }
 *               level: { type: string, enum: [核心, 重点, 普通, 备用] }
 *               contact_person: { type: string }
 *               contact_phone: { type: string }
 *               contact_email: { type: string, format: email }
 *               address: { type: string }
 *               payment_terms: { type: string }
 *               delivery_days: { type: integer, minimum: 1, maximum: 365 }
 *               remark: { type: string }
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
 *
 * /api/supplier/update:
 *   post:
 *     summary: 修改供应商
 *     tags: [供应商管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id: { type: integer, example: 1 }
 *               name: { type: string }
 *               short_name: { type: string }
 *               type: { type: string, enum: [生产, 贸易, 服务] }
 *               industry: { type: string }
 *               level: { type: string, enum: [核心, 重点, 普通, 备用] }
 *               status: { type: integer, enum: [1, 2, 3] }
 *               contact_person: { type: string }
 *               contact_phone: { type: string }
 *               contact_email: { type: string, format: email }
 *               address: { type: string }
 *               payment_terms: { type: string }
 *               delivery_days: { type: integer, minimum: 1, maximum: 365 }
 *               remark: { type: string }
 *     responses:
 *       200:
 *         description: 修改成功
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
 *       403: { description: 无权限修改该供应商 }
 *       404: { description: 供应商不存在 }
 *       500: { description: 服务器内部错误 }
 *
 * /api/supplier/delete:
 *   post:
 *     summary: 删除供应商
 *     tags: [供应商管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: 删除成功
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
 *       403: { description: 无权限删除该供应商 }
 *       404: { description: 供应商不存在 }
 *       500: { description: 服务器内部错误 }
 *
 * /api/supplier/rating/add:
 *   post:
 *     summary: 供应商评分（质量/交期/服务/价格）
 *     tags: [供应商管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [supplier_id, quality_score, delivery_score, service_score, price_score, rating_period]
 *             properties:
 *               supplier_id: { type: integer, example: 1 }
 *               quality_score: { type: number, minimum: 0, maximum: 5, example: 4.5 }
 *               delivery_score: { type: number, minimum: 0, maximum: 5, example: 4.0 }
 *               service_score: { type: number, minimum: 0, maximum: 5, example: 4.2 }
 *               price_score: { type: number, minimum: 0, maximum: 5, example: 4.8 }
 *               rating_period: { type: string, example: '2026-Q2' }
 *               remark: { type: string }
 *     responses:
 *       200:
 *         description: 评分成功
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

// --- Joi schemas ---

const listSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  keyword: Joi.string().max(200).allow('', null),
  type: Joi.string().valid('生产', '贸易', '服务').allow('', null),
  level: Joi.string().valid('核心', '重点', '普通', '备用').allow('', null),
  status: Joi.number().integer().valid(1, 2, 3).allow('', null)
});

const addSupplierSchema = Joi.object({
  name: Joi.string().required().max(200),
  short_name: Joi.string().max(200).allow('', null),
  type: Joi.string().valid('生产', '贸易', '服务').default('贸易'),
  industry: Joi.string().max(200).allow('', null),
  level: Joi.string().valid('核心', '重点', '普通', '备用').default('普通'),
  contact_person: Joi.string().max(200).allow('', null),
  contact_phone: Joi.string().max(20).allow('', null),
  contact_email: Joi.string().email().max(200).allow('', null),
  address: Joi.string().max(500).allow('', null),
  payment_terms: Joi.string().max(200).allow('', null),
  delivery_days: Joi.number().integer().min(1).max(365).allow(null),
  remark: Joi.string().max(2000).allow('', null)
});

const updateSupplierSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  name: Joi.string().max(200),
  short_name: Joi.string().max(200).allow('', null),
  type: Joi.string().valid('生产', '贸易', '服务'),
  industry: Joi.string().max(200).allow('', null),
  level: Joi.string().valid('核心', '重点', '普通', '备用'),
  status: Joi.number().integer().valid(1, 2, 3),
  contact_person: Joi.string().max(200).allow('', null),
  contact_phone: Joi.string().max(20).allow('', null),
  contact_email: Joi.string().email().max(200).allow('', null),
  address: Joi.string().max(500).allow('', null),
  payment_terms: Joi.string().max(200).allow('', null),
  delivery_days: Joi.number().integer().min(1).max(365).allow(null),
  remark: Joi.string().max(2000).allow('', null)
});

const deleteSupplierSchema = Joi.object({ id: Joi.number().integer().positive().required() });

const addContactSchema = Joi.object({
  supplier_id: Joi.number().integer().positive().required(),
  name: Joi.string().required().max(50),
  position: Joi.string().max(200).allow('', null),
  department: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  mobile: Joi.string().pattern(/^\+?\d{7,20}$/).allow('', null),
  email: Joi.string().email().max(200).allow('', null),
  wechat: Joi.string().max(50).allow('', null),
  role: Joi.string().valid('决策人', '对接人', '财务', '技术', '其他').default('对接人'),
  is_primary: Joi.number().integer().valid(0, 1).default(0),
  remark: Joi.string().max(500).allow('', null)
});

const updateContactSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  name: Joi.string().max(50),
  position: Joi.string().max(200).allow('', null),
  department: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  mobile: Joi.string().max(20).allow('', null),
  email: Joi.string().email().max(200).allow('', null),
  wechat: Joi.string().max(50).allow('', null),
  role: Joi.string().valid('决策人', '对接人', '财务', '技术', '其他'),
  is_primary: Joi.number().integer().valid(0, 1),
  remark: Joi.string().max(500).allow('', null)
});

const addRatingSchema = Joi.object({
  supplier_id: Joi.number().integer().positive().required(),
  quality_score: Joi.number().min(0).max(5).required(),
  delivery_score: Joi.number().min(0).max(5).required(),
  service_score: Joi.number().min(0).max(5).required(),
  price_score: Joi.number().min(0).max(5).required(),
  rating_period: Joi.string().max(20).required(),
  remark: Joi.string().max(500).allow('', null)
});

const addQualificationSchema = Joi.object({
  supplier_id: Joi.number().integer().positive().required(),
  cert_type: Joi.string().max(50).allow('', null),
  cert_no: Joi.string().max(100).allow('', null),
  cert_name: Joi.string().max(200).required(),
  issue_date: Joi.date().iso().allow(null),
  expire_date: Joi.date().iso().allow(null),
  issuing_authority: Joi.string().max(200).allow('', null),
  remark: Joi.string().max(500).allow('', null)
});

const updateQualificationSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  cert_type: Joi.string().max(50).allow('', null),
  cert_no: Joi.string().max(100).allow('', null),
  cert_name: Joi.string().max(200),
  issue_date: Joi.date().iso().allow(null),
  expire_date: Joi.date().iso().allow(null),
  issuing_authority: Joi.string().max(200).allow('', null),
  remark: Joi.string().max(500).allow('', null)
});

const contactDeleteSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const qualificationDeleteSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

// --- Routes ---

// 字段级权限：供应商敏感信息仅管理员可见
router.use(checkFieldPermission('supplier'));

const supplierListHandler = async (req, res) => {
  try {
    const source = req.method === 'GET' ? req.query : req.body;
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 's');
    const result = await supplierService.listSuppliers(pool, source, { clause, params: permParams });
    result.list = stripRestrictedFields(result.list, req.restrictedFields);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[供应商] 供应商列表错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
};

router.get('/list', authenticateToken, checkPermission('supplier'), checkDataPermission('supplier', 'owner_id'), cache(300), supplierListHandler);
router.post('/list', authenticateToken, checkPermission('supplier'), checkDataPermission('supplier', 'owner_id'), cache(300), validate(listSchema), supplierListHandler);

router.get('/detail/:id', authenticateToken, checkDataPermission('supplier', 'owner_id'), async (req, res) => {
  try {
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 's');
    const data = await supplierService.getSupplier(pool, req.params.id, { clause, params: permParams });
    if (!data) return res.status(404).json({ code: 404, message: '供应商不存在', data: null });
    stripRestrictedFields(data, req.restrictedFields);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[供应商] 供应商详情错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.post('/add', authenticateToken, checkPermission('supplier:add'), validate(addSupplierSchema), async (req, res) => {
  try {
    const result = await supplierService.createSupplier(pool, req.body, req.user.userId);
    await logAction(req, 'add', `新增供应商: ${req.body.name}`);
    await invalidateCache(['cache:*:/api/supplier/*']);
    res.json({ code: 200, message: '创建供应商成功', data: result });
  } catch (error) {
    logger.error('[供应商] 添加供应商错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '创建供应商失败', data: null });
  }
});

router.post('/update', authenticateToken, checkPermission('supplier:edit'), validate(updateSupplierSchema), async (req, res) => {
  const { id, ...updateFields } = req.body;
  try {
    const oldData = await supplierService.getSupplierForEdit(pool, id);
    if (!oldData) return res.status(404).json({ code: 404, message: '供应商不存在', data: null });
    const { manageAll, userId } = req.user;
    if (!manageAll && !ROLES.ADMIN_ROLE_CODES.has(req.user.roleCode) && oldData.owner_id !== userId && oldData.create_by !== userId) {
      return res.status(403).json({ code: 403, message: '无权限修改该供应商', data: null });
    }
    await supplierService.updateSupplier(pool, id, updateFields);
    await logAction(req, 'update', `修改供应商: ID=${id}`);
    await logFieldChanges(req, { module: MODULE_NAME, action: '编辑供应商', oldData, newData: req.body, allowedFields: ['company_name', 'contact_name', 'phone', 'email', 'address', 'industry', 'level', 'status', 'remark', 'owner_id'], description: `编辑供应商: ${oldData.name || oldData.company_name}` });
    await invalidateCache(['cache:*:/api/supplier/*']);
    res.json({ code: 200, message: '修改供应商成功', data: null });
  } catch (error) {
    logger.error('[供应商] 更新供应商错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '修改供应商失败', data: null });
  }
});

router.post('/delete', authenticateToken, checkPermission('supplier:delete'), validate(deleteSupplierSchema), async (req, res) => {
  const { id } = req.body;
  try {
    const supplier = await supplierService.getSupplierForEdit(pool, id);
    if (!supplier) return res.status(404).json({ code: 404, message: '供应商不存在', data: null });
    const { manageAll, userId } = req.user;
    if (!manageAll && !ROLES.ADMIN_ROLE_CODES.has(req.user.roleCode) && supplier.owner_id !== userId && supplier.create_by !== userId) {
      return res.status(403).json({ code: 403, message: '无权限删除该供应商', data: null });
    }
    await supplierService.deleteSupplier(pool, id);
    await logAction(req, 'delete', `删除供应商: ID=${id}`);
    await invalidateCache(['cache:*:/api/supplier/*']);
    res.json({ code: 200, message: '删除供应商成功', data: null });
  } catch (error) {
    logger.error('[供应商] 删除供应商错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '删除供应商失败', data: null });
  }
});

router.post('/contact/add', authenticateToken, checkPermission('supplier:edit'), validate(addContactSchema), async (req, res) => {
  try {
    const result = await supplierService.addContact(pool, req.body);
    res.json({ code: 200, message: '添加联系人成功', data: result });
  } catch (error) {
    logger.error('[供应商] 添加联系人错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '添加联系人失败', data: null });
  }
});

router.get('/options', authenticateToken, async (req, res) => {
  try {
    const rows = await supplierService.getSupplierOptions(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[供应商] 查询供应商列表失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.post('/rating/add', authenticateToken, checkPermission('supplier:edit'), validate(addRatingSchema), async (req, res) => {
  try {
    const result = await supplierService.addRating(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '评分成功', data: result });
  } catch (error) {
    logger.error('[供应商] 添加评分错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '评分失败', data: null });
  }
});

router.post('/contact/update', authenticateToken, checkPermission('supplier:edit'), validate(updateContactSchema), async (req, res) => {
  try {
    const { id, ...fields } = req.body;
    await supplierService.updateContact(pool, id, fields);
    res.json({ code: 200, message: '修改联系人成功', data: null });
  } catch (error) {
    logger.error('[供应商] 更新联系人错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '修改联系人失败', data: null });
  }
});

router.post('/contact/delete', authenticateToken, checkPermission('supplier:edit'), validate(contactDeleteSchema), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '联系人ID不能为空', data: null });
    await supplierService.deleteContact(pool, id);
    res.json({ code: 200, message: '删除联系人成功', data: null });
  } catch (error) {
    logger.error('[供应商] 删除联系人错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '删除联系人失败', data: null });
  }
});

router.post('/qualification/add', authenticateToken, checkPermission('supplier:edit'), validate(addQualificationSchema), async (req, res) => {
  try {
    const result = await supplierService.addQualification(pool, req.body);
    res.json({ code: 200, message: '添加资质成功', data: result });
  } catch (error) {
    logger.error('[供应商] 添加资质错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '添加资质失败', data: null });
  }
});

router.post('/qualification/update', authenticateToken, checkPermission('supplier:edit'), validate(updateQualificationSchema), async (req, res) => {
  try {
    const { id, ...fields } = req.body;
    await supplierService.updateQualification(pool, id, fields);
    res.json({ code: 200, message: '修改资质成功', data: null });
  } catch (error) {
    logger.error('[供应商] 更新资质错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '修改资质失败', data: null });
  }
});

router.post('/qualification/delete', authenticateToken, checkPermission('supplier:edit'), validate(qualificationDeleteSchema), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '资质ID不能为空', data: null });
    await supplierService.deleteQualification(pool, id);
    res.json({ code: 200, message: '删除资质成功', data: null });
  } catch (error) {
    logger.error('[供应商] 删除资质错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '删除资质失败', data: null });
  }
});

router.get('/performance/:id', authenticateToken, async (req, res) => {
  try {
    const data = await supplierService.getPerformance(pool, req.params.id);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[供应商] 绩效统计错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.get('/ranking', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const rows = await supplierService.getRanking(pool, limit);
    stripRestrictedFields(rows, req.restrictedFields);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[供应商] 排行查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.get('/compare', authenticateToken, async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean);
    if (ids.length === 0) return res.status(400).json({ code: 400, message: '请选择供应商', data: null });
    const result = await supplierService.getComparison(pool, ids);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[供应商] 对比查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;
