const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission, checkDataPermission, buildDataPermissionWhere } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const { cache, invalidateCache } = require('../../middleware/cache');
const { createRouteLogger } = require('../../middleware/logger');
const { logFieldChanges } = require('../../utils/fieldLog');
const contractService = require('../../services/contractService');
const contractCrudService = require('../../services/contractCrudService');

const MODULE_NAME = '合同管理';
const logAction = createRouteLogger(MODULE_NAME);

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

router.post('/list', authenticateToken, cache(60), checkPermission('contract'), checkDataPermission('contract', 'create_by'), validate(listSchema), async (req, res) => {
  try {
    const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'c');
    const result = await contractCrudService.listContracts(pool, req.body, { clause: permissionClause, params: permParams });
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    console.error('[合同] 合同列表错误:', error.message);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.get('/detail/:id', authenticateToken, checkDataPermission('contract', 'create_by'), async (req, res) => {
  const { id } = req.params;

  try {
    const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'c');
    const contract = await contractCrudService.getContractDetail(pool, id, { clause: permissionClause, params: permParams });
    if (!contract) {
      return res.status(404).json({ code: 404, message: '合同不存在', data: null });
    }

    res.json({ code: 200, message: '查询成功', data: contract });
  } catch (error) {
    console.error('[合同] 查询合同详情失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.post('/add', authenticateToken, checkPermission('contract:add'), validate(addContractSchema), async (req, res) => {
  const { customer_id, amount } = req.body;

  try {
    const result = await contractService.createContract(pool, req.body, req.user.userId);
    await logAction(req, 'add', `新增合同: ${result.contract_no}`);

    // 通知审批人（不影响主流程）
    await contractCrudService.createContractNotification(pool, result.id, result.contract_no, amount, customer_id, req.user.userId);

    res.json({ code: 200, message: '创建合同成功', data: result });
  } catch (error) {
    console.error('[合同] 创建合同失败:', error);
    const status = error.code || 500;
    res.status(status).json({ code: status, message: error.message || '创建合同失败', data: null });
  }
});

router.post('/update', authenticateToken, checkPermission('contract:edit'), validate(updateContractSchema), async (req, res) => {
  try {
    const oldData = await contractCrudService.updateContract(pool, req.body);
    await logAction(req, 'update', `修改合同: ID=${req.body.id}`);

    if (oldData) {
      const contractFields = ['customer_id', 'opportunity_id', 'amount', 'sign_date', 'delivery_date', 'payment_terms', 'status', 'remark'];
      const { id, customer_id, opportunity_id, amount, sign_date, delivery_date, payment_terms, status, remark } = req.body;
      const newData = { customer_id, opportunity_id, amount, sign_date, delivery_date, payment_terms, status, remark };
      await logFieldChanges(req, {
        module: MODULE_NAME,
        action: '编辑',
        oldData,
        newData,
        allowedFields: contractFields,
        description: `修改合同 #${id} 字段变更`
      });
    }

    await invalidateCache(['cache:*:/api/contract/*']);
    res.json({ code: 200, message: '修改合同成功', data: null });
  } catch (error) {
    console.error('[合同] 修改合同失败:', error);
    res.status(500).json({ code: 500, message: '修改合同失败', data: null });
  }
});

router.post('/delete', authenticateToken, checkPermission('contract:delete'), validate(deleteContractSchema), async (req, res) => {
  const { id } = req.body;

  try {
    const result = await contractCrudService.deleteContract(pool, id, req.user);
    if (result.code !== 200) {
      return res.status(result.code).json({ code: result.code, message: result.message, data: null });
    }

    await logAction(req, 'delete', `删除合同: ID=${id}`);
    await invalidateCache(['cache:*:/api/contract/*']);
    res.json({ code: 200, message: result.message, data: null });
  } catch (error) {
    console.error('[合同] 删除合同失败:', error);
    res.status(500).json({ code: 500, message: '删除合同失败', data: null });
  }
});

router.get('/opportunity-list', authenticateToken, checkDataPermission('opportunity', 'owner_id'), async (req, res) => {
  try {
    const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const rows = await contractCrudService.getOpportunityList(pool, { clause: permissionClause, params: permParams });
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[合同] 商机列表错误:', error.message);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 合同搜索（轻量级，供快速回款录入选择合同）
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { keyword } = req.query;
    const rows = await contractCrudService.searchContracts(pool, keyword);
    res.json({ code: 200, data: rows });
  } catch (error) {
    console.error('[合同] 合同搜索错误:', error);
    res.status(500).json({ code: 500, message: '搜索失败', data: null });
  }
});

module.exports = router;
