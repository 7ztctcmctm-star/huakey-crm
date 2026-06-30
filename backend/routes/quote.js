const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission, checkDataPermission, buildDataPermissionWhere } = require('../middleware/permission');
const { logFieldChanges } = require('../utils/fieldLog');
const ROLES = require('../config/roles');
const quoteService = require('../services/quoteService');

const MODULE_NAME = '报价管理';

const router = express.Router();

// 1. 创建报价单
router.post('/add', authenticateToken, checkPermission('quotation:add'), async (req, res) => {
  try {
    const { customer_id, items } = req.body;
    if (!customer_id) return res.status(400).json({ code: 400, message: '客户ID不能为空', data: null });
    if (!items || items.length === 0) return res.status(400).json({ code: 400, message: '报价项不能为空', data: null });

    const result = await quoteService.createQuote(pool, req.body, req.user.userId);
    if (result.error) return res.status(result.code).json({ code: result.code, message: result.error, data: null });
    res.json({ code: 200, message: '创建报价单成功', data: result });
  } catch (error) {
    console.error('[报价] 创建报价单错误:', error);
    res.status(500).json({ code: 500, message: '创建报价单失败', data: null });
  }
});

// 2. 报价单列表
router.post('/list', authenticateToken, checkPermission('quotation'), checkDataPermission('quote', 'create_by'), async (req, res) => {
  try {
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'q');
    const result = await quoteService.listQuotes(pool, req.body, { clause, params: permParams });
    res.json({ code: 200, message: '获取报价单列表成功', data: result });
  } catch (error) {
    console.error('获取报价单列表错误:', error);
    res.status(500).json({ code: 500, message: '获取报价单列表失败', data: null });
  }
});

// 3. 报价单详情
router.get('/detail/:id', authenticateToken, checkDataPermission('quote', 'create_by'), async (req, res) => {
  try {
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'q');
    const data = await quoteService.getQuote(pool, req.params.id, { clause, params: permParams });
    if (!data) return res.status(404).json({ code: 404, message: '报价单不存在', data: null });
    res.json({ code: 200, message: '获取报价单详情成功', data });
  } catch (error) {
    console.error('获取报价单详情错误:', error);
    res.status(500).json({ code: 500, message: '获取报价单详情失败', data: null });
  }
});

// 4. 修改报价单
router.post('/update', authenticateToken, checkPermission('quotation:edit'), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '报价单ID不能为空', data: null });

    const result = await quoteService.updateQuote(pool, req.body);
    if (result.error) return res.status(result.code).json({ code: result.code, message: result.error, data: null });

    await logFieldChanges(req, {
      module: MODULE_NAME,
      action: '编辑报价单',
      oldData: result.existingQuote,
      newData: req.body,
      allowedFields: ['quote_no', 'customer_id', 'status', 'approval_status', 'total_amount', 'remark', 'delivery_date'],
      description: `编辑报价单: ${result.existingQuote.quote_no || id}`
    });

    res.json({ code: 200, message: '修改报价单成功', data: null });
  } catch (error) {
    console.error('修改报价单错误:', error);
    res.status(500).json({ code: 500, message: '修改报价单失败', data: null });
  }
});

// 5. 删除报价单
router.post('/delete', authenticateToken, checkPermission('quotation:delete'), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '报价单ID不能为空', data: null });

    const result = await quoteService.deleteQuote(pool, id, req.user);
    if (result.error) return res.status(result.code).json({ code: result.code, message: result.error, data: null });
    res.json({ code: 200, message: '删除报价单成功', data: null });
  } catch (error) {
    console.error('删除报价单错误:', error);
    res.status(500).json({ code: 500, message: '删除报价单失败', data: null });
  }
});

// 6. 报价转合同
router.post('/to-contract', authenticateToken, checkPermission('quotation:edit'), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '报价单ID不能为空', data: null });

    const result = await quoteService.convertToContract(pool, id, req.user.userId);
    if (result.error) return res.status(result.code).json({ code: result.code, message: result.error, data: null });
    res.json({ code: 200, message: '转合同成功', data: result });
  } catch (error) {
    console.error('报价转合同失败:', error);
    res.status(500).json({ code: 500, message: '转合同失败', data: null });
  }
});

// 审批报价单（仅管理员）
router.post('/approve', authenticateToken, async (req, res) => {
  try {
    const { id, approval_status, approval_remark } = req.body;
    if (!req.user.manageAll && !ROLES.ADMIN_ROLE_CODES.has(req.user.roleCode)) {
      return res.status(403).json({ code: 403, message: '无审批权限', data: null });
    }
    if (!id || ![2, 3].includes(approval_status)) {
      return res.status(400).json({ code: 400, message: '参数错误: id必填, approval_status为2(通过)或3(拒绝)', data: null });
    }

    const result = await quoteService.approveQuote(pool, id, approval_status, approval_remark, req.user.userId);
    if (result.error) return res.status(result.code).json({ code: result.code, message: result.error, data: null });
    res.json({ code: 200, message: approval_status === 2 ? '审批通过' : '已拒绝', data: null });
  } catch (error) {
    console.error('审批报价单错误:', error);
    res.status(500).json({ code: 500, message: '审批失败', data: null });
  }
});

module.exports = router;
