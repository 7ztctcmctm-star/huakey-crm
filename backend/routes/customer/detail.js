const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { validate, Joi } = require('../../middleware/validate');
const { checkPermission, checkDataPermission, buildDataPermissionWhere } = require('../../middleware/permission');
const ROLES = require('../../config/roles');
const { cache } = require('../../middleware/cache');
const customerService = require('../../services/customerService');
const customerDetailService = require('../../services/customerDetailService');

const MODULE_NAME = '客户管理';

const customerListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  company_name: Joi.string().max(200).allow('', null),
  contact_name: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  source: Joi.string().valid(...customerDetailService.VALID_SOURCES, ...Object.keys(customerDetailService.SOURCE_PARENT_MAP)).allow('', null),
  level: Joi.string().valid('A', 'B', 'C').allow('', null),
  status: Joi.number().integer().valid(0, 1, 2, 3, 5).allow('', null),
  customer_type: Joi.string().valid('prospect', 'customer').allow('', null),
  lifecycle_status: Joi.string().valid('new', 'nurturing', 'intent', 'active', 'lost', 'inactive').allow('', null),
  owner_id: Joi.number().integer().positive().allow(null),
  start_date: Joi.string().isoDate().allow('', null),
  end_date: Joi.string().isoDate().allow('', null),
  overdue: Joi.boolean().allow(null),
  unassigned: Joi.boolean().allow(null),
  overdue_follow: Joi.boolean().allow(null),
  tag_id: Joi.number().integer().positive().allow('', null),
  sort: Joi.string().valid('create_time_desc', 'last_follow_time_asc', 'last_follow_time_desc').allow('', null)
});

const addCustomerSchema = Joi.object({
  company_name: Joi.string().required().max(200),
  contact_name: Joi.string().max(200).allow('', null),
  phone: Joi.string().pattern(/^\+?\d{7,20}$/).allow('', null),
  email: Joi.string().email().max(200).allow('', null),
  address: Joi.string().max(500).allow('', null),
  industry: Joi.string().max(200).allow('', null),
  source: Joi.string().valid(...customerDetailService.VALID_SOURCES).allow('', null),
  level: Joi.string().valid('A', 'B', 'C').default('C'),
  remark: Joi.string().max(2000).allow('', null)
});

const updateCustomerSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  company_name: Joi.string().max(200),
  contact_name: Joi.string().max(200).allow('', null),
  phone: Joi.string().pattern(/^\+?\d{7,20}$/).allow('', null),
  email: Joi.string().email().max(200).allow('', null),
  address: Joi.string().max(500).allow('', null),
  industry: Joi.string().max(200).allow('', null),
  source: Joi.string().valid(...customerDetailService.VALID_SOURCES).allow('', null),
  level: Joi.string().valid('A', 'B', 'C'),
  status: Joi.number().integer().valid(1, 2, 3, 5),
  remark: Joi.string().max(2000).allow('', null)
});

const deleteCustomerSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const { createRouteLogger } = require('../../middleware/logger');
const { logFieldChanges } = require('../../utils/fieldLog');
const logAction = createRouteLogger(MODULE_NAME);

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: 客户管理
 *     description: 客户 CRUD、详情、联系方式
 *
 * /api/customer:
 *   get:
 *     summary: 获取客户列表（分页 + 搜索）
 *     tags: [客户管理]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *         description: 搜索关键词（客户名称/电话/联系人）
 *     responses:
 *       200:
 *         description: 客户列表
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *
 * /api/customer/{id}:
 *   get:
 *     summary: 获取客户详情
 *     tags: [客户管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 客户详情（含联系人、商机、跟进记录）
 *       404:
 *         description: 客户不存在
 */

// 1. 获取客户列表（复用 customerService）
router.post('/list',
  authenticateToken,
  cache(60),
  checkDataPermission('customer', 'owner_id'),
  validate(customerListSchema),
  async (req, res) => {
  try {
    const { clause: permissionWhere, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'c');
    const result = await customerService.listCustomers(pool, req.body, { clause: permissionWhere, params: permParams });

    res.json({
      code: 200,
      message: '获取客户列表成功',
      data: {
        list: result.list,
        total: result.total,
        page: parseInt(req.body.page || 1),
        pageSize: parseInt(req.body.pageSize || 10)
      }
    });
  } catch (error) {
    console.error('获取客户列表错误:', error);
    res.status(500).json({ code: 500, message: '获取客户列表失败', data: null });
  }
});

// 2. 添加客户
router.post('/add', authenticateToken, checkPermission('customer:add'), validate(addCustomerSchema), async (req, res) => {
  try {
    const { company_name, source } = req.body;

    if (!company_name) {
      return res.status(400).json({ code: 400, message: '公司名称不能为空', data: null });
    }

    if (source && !customerDetailService.VALID_SOURCES.includes(source)) {
      return res.status(400).json({ code: 400, message: `无效的客户来源: ${source}`, data: null });
    }

    const result = await customerDetailService.addCustomer(pool, req.body, req.user.userId);

    await logAction(req, 'add', `新增客户: ${company_name}${result.assignedOwner ? '（已自动分配）' : ''}`);

    res.json({
      code: 200,
      message: result.possibleDuplicates
        ? `添加客户成功（注意：已有 ${result.possibleDuplicates.length} 个同名客户，可能重复）`
        : '添加客户成功',
      data: { id: result.id, possibleDuplicates: result.possibleDuplicates }
    });
  } catch (error) {
    console.error('添加客户错误:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ code: 409, message: '检测到重复客户（相同公司名和电话已存在），请核对后重试', data: null });
    }
    res.status(500).json({ code: 500, message: '添加客户失败', data: null });
  }
});

// 3. 修改客户
router.post('/update', authenticateToken, checkPermission('customer:edit'), validate(updateCustomerSchema), async (req, res) => {
  try {
    const { id, ...updateFields } = req.body;

    if (!id) {
      return res.status(400).json({ code: 400, message: '客户ID不能为空', data: null });
    }

    const result = await customerDetailService.updateCustomer(pool, id, updateFields, req.user);

    await logAction(req, 'update', `修改客户: ${result.customer.company_name}`);
    await logFieldChanges(req, {
      module: MODULE_NAME,
      action: '编辑',
      oldData: result.oldData,
      newData: updateFields,
      allowedFields: ['company_name', 'contact_name', 'phone', 'email', 'address', 'industry', 'source', 'level', 'status', 'remark'],
      description: `修改客户 "${result.customer.company_name}" 字段变更`
    });

    res.json({ code: 200, message: '修改客户成功', data: null });
  } catch (error) {
    console.error('修改客户错误:', error);
    if (error.code === 404) {
      return res.status(404).json({ code: 404, message: error.message, data: null });
    }
    if (error.code === 403) {
      return res.status(403).json({ code: 403, message: error.message, data: null });
    }
    if (error.code === 400) {
      return res.status(400).json({ code: 400, message: error.message, data: null });
    }
    if (error.code === 409) {
      return res.status(409).json({ code: 409, message: error.message, data: { possibleDuplicates: error.possibleDuplicates } });
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ code: 409, message: '检测到重复客户（相同公司名和电话已存在），请核对后重试', data: null });
    }
    res.status(500).json({ code: 500, message: '修改客户失败', data: null });
  }
});

// 4. 删除客户（逻辑删除）
router.post('/delete', authenticateToken, checkPermission('customer:delete'), validate(deleteCustomerSchema), async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ code: 400, message: '客户ID不能为空', data: null });
    }

    await customerDetailService.deleteCustomer(pool, id, req.user);

    await logAction(req, 'delete', `删除客户: ID=${id}`);

    res.json({ code: 200, message: '删除客户成功', data: null });
  } catch (error) {
    console.error('删除客户错误:', error);
    if (error.code === 404) {
      return res.status(404).json({ code: 404, message: error.message, data: null });
    }
    if (error.code === 403) {
      return res.status(403).json({ code: 403, message: error.message, data: null });
    }
    res.status(500).json({ code: 500, message: '删除客户失败', data: null });
  }
});

// 5. 获取客户详情
router.get('/detail/:id', authenticateToken, checkDataPermission('customer', 'owner_id'), async (req, res) => {
  try {
    const { clause: permissionWhere, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'c');
    const data = await customerDetailService.getCustomerDetail(pool, req.params.id, { clause: permissionWhere, params: permParams });

    res.json({ code: 200, message: '获取客户详情成功', data });
  } catch (error) {
    console.error('获取客户详情错误:', error);
    if (error.code === 404) {
      return res.status(404).json({ code: 404, message: error.message, data: null });
    }
    res.status(500).json({ code: 500, message: '获取客户详情失败', data: null });
  }
});

// 5.5 客户360度视图
router.get('/:id/360', authenticateToken, checkPermission('customer:list'), async (req, res) => {
  try {
    const data = await customerDetailService.getCustomer360(pool, req.params.id);

    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('获取客户360视图错误:', error);
    if (error.code === 404) {
      return res.status(404).json({ code: 404, message: error.message, data: null });
    }
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 6. 导出客户列表
router.post('/export', authenticateToken, checkPermission('customer:list'), checkDataPermission('customer', 'owner_id'), async (req, res) => {
  try {
    const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'c');
    const buf = await customerDetailService.exportCustomers(pool, req.body, { clause: permissionClause, params: permParams });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=customers.xlsx');
    res.send(buf);

    await logAction(req, 'export', `导出客户列表`);
  } catch (error) {
    console.error('导出客户错误:', error);
    res.status(500).json({ code: 500, message: '导出客户失败', data: null });
  }
});

// 客户状态转化（复用 customerService）
router.post('/convert', authenticateToken, async (req, res) => {
  try {
    const { customer_id, action } = req.body;
    const userId = req.user.userId;

    if (!ROLES.ADMIN_ROLE_CODES.has(req.user.roleCode)) {
      return res.status(403).json({ code: 403, message: '仅管理者可执行转化操作', data: null });
    }

    if (!customer_id) {
      return res.status(400).json({ code: 400, message: '请指定客户', data: null });
    }

    const result = await customerService.convertStatus(pool, customer_id, action);

    const { logAction: logActionFn, getIpAddress } = require('../../middleware/logger');
    await logActionFn({
      module: MODULE_NAME, action: action,
      method: 'POST', url: '/api/customer/convert',
      params: { customer_id, action },
      ipAddress: getIpAddress(req), userId, userName: req.user.username,
      description: `客户转化操作`, status: 1
    });

    res.json({ code: 200, message: '转化成功', data: result });
  } catch (error) {
    console.error('客户转化错误:', error);
    if (error.code) {
      return res.status(error.code).json({ code: error.code, message: error.message, data: null });
    }
    res.status(500).json({ code: 500, message: '转化失败', data: null });
  }
});

module.exports = router;
module.exports.VALID_SOURCES = customerDetailService.VALID_SOURCES;
module.exports.SOURCE_PARENT_MAP = customerDetailService.SOURCE_PARENT_MAP;
module.exports.canManageCustomer = (user, ownerId) => customerDetailService.canManageCustomer(pool, user, ownerId);
