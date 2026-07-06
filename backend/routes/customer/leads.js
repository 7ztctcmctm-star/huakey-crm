const express = require('express');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission, checkDataPermission } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const customerController = require('../../controllers/customerController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: 线索管理
 *     description: 线索列表、转化、批量转化、导入、领取、流失标记、统计
 *
 * /api/customer/leads/list:
 *   post:
 *     summary: 获取线索列表
 *     tags: [线索管理]
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
 *               company_name: { type: string }
 *               contact_name: { type: string }
 *               phone: { type: string }
 *               source: { type: string }
 *               lead_level: { type: string, enum: [A, B, C] }
 *               follow_status: { type: string }
 *               owner_id: { type: integer }
 *     responses:
 *       200:
 *         description: 线索列表
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
 * /api/customer/leads/convert:
 *   post:
 *     summary: 线索转化为潜客（status 5→1）
 *     tags: [线索管理]
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
 *         description: 转化成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 message: { type: string }
 *                 data: { type: object }
 *       400: { description: 参数错误或线索状态不允许转化 }
 *       401: { description: 未登录或 token 过期 }
 *       403: { description: 无权限访问 }
 *       500: { description: 服务器内部错误 }
 *
 * /api/customer/leads/batch-convert:
 *   post:
 *     summary: 批量转化线索
 *     tags: [线索管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 items: { type: integer }
 *     responses:
 *       200:
 *         description: 批量转化结果
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
 * /api/customer/leads/import:
 *   post:
 *     summary: 批量导入线索
 *     tags: [线索管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [leads]
 *             properties:
 *               leads:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     company_name: { type: string }
 *                     contact_name: { type: string }
 *                     phone: { type: string }
 *                     source: { type: string }
 *     responses:
 *       200:
 *         description: 导入成功
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
 * /api/customer/leads/claim:
 *   post:
 *     summary: 销售领取线索
 *     tags: [线索管理]
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
 *         description: 领取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 message: { type: string }
 *                 data: { type: object }
 *       400: { description: 参数错误或线索已被领取 }
 *       401: { description: 未登录或 token 过期 }
 *       403: { description: 无权限访问 }
 *       500: { description: 服务器内部错误 }
 *
 * /api/customer/leads/mark-lost:
 *   post:
 *     summary: 标记线索为已流失
 *     tags: [线索管理]
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
 *         description: 标记成功
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
 * /api/customer/leads/stats:
 *   get:
 *     summary: 线索统计
 *     tags: [线索管理]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 线索统计数据
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 message: { type: string }
 *                 data: { type: object }
 *       401: { description: 未登录或 token 过期 }
 *       403: { description: 无权限访问 }
 *       500: { description: 服务器内部错误 }
 */

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
router.post('/list', authenticateToken, checkPermission('leads'), checkDataPermission('leads', 'owner_id'), validate(leadsListSchema), customerController.listLeads);

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
