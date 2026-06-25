const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const approvalService = require('../services/approvalService');

// 获取所有审批流程
router.get('/workflows', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    const data = await approvalService.listWorkflows(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('[审批] 获取流程列表失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建审批流程
router.post('/workflows', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    const { name, type, description, steps } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ code: 400, message: '流程名称不能为空', data: null });
    if (!type) return res.status(400).json({ code: 400, message: '流程类型不能为空', data: null });
    if (!steps || steps.length === 0) return res.status(400).json({ code: 400, message: '至少需要一个审批步骤', data: null });
    const validTypes = ['quote', 'contract', 'purchase', 'discount'];
    if (!validTypes.includes(type)) return res.status(400).json({ code: 400, message: '无效的流程类型', data: null });

    const result = await approvalService.createWorkflow(pool, { name, type, description, steps }, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    console.error('[审批] 创建流程失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新审批流程
router.put('/workflows/:id', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, description, steps, status } = req.body;
    await approvalService.updateWorkflow(pool, id, { name, type, description, steps, status });
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[审批] 更新流程失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除审批流程（软删除）
router.delete('/workflows/:id', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    await approvalService.deleteWorkflow(pool, req.params.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[审批] 删除流程失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 提交审批
router.post('/submit', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    const { business_type, business_id } = req.body;
    if (!business_type || !business_id) return res.status(400).json({ code: 400, message: '业务类型和ID不能为空', data: null });
    await approvalService.submitApproval(pool, business_type, business_id, req.user.userId);
    res.json({ code: 200, message: '已提交审批', data: null });
  } catch (error) {
    const status = error.code || 500;
    console.error('[审批] 提交审批失败:', error);
    res.status(status).json({ code: status, message: error.message || '服务器内部错误', data: null });
  }
});

// 审批通过
router.post('/approve/:id', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    const result = await approvalService.approveRecord(pool, req.params.id, req.body.remark, req.user.userId, req.user.manageAll);
    res.json({ code: 200, message: '审批通过', data: result });
  } catch (error) {
    const status = error.code || 500;
    console.error('[审批] 审批通过失败:', error);
    res.status(status).json({ code: status, message: error.message || '服务器内部错误', data: null });
  }
});

// 审批驳回
router.post('/reject/:id', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    await approvalService.rejectRecord(pool, req.params.id, req.body.remark, req.user.userId, req.user.manageAll);
    res.json({ code: 200, message: '已驳回', data: null });
  } catch (error) {
    const status = error.code || 500;
    console.error('[审批] 驳回失败:', error);
    res.status(status).json({ code: status, message: error.message || '服务器内部错误', data: null });
  }
});

// 撤回审批
router.delete('/withdraw/:business_type/:business_id', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    const { business_type, business_id } = req.params;
    await approvalService.withdrawApproval(pool, business_type, business_id, req.user.userId);
    res.json({ code: 200, message: '审批已撤回', data: null });
  } catch (error) {
    const status = error.code || 500;
    console.error('[审批] 撤回审批失败:', error);
    res.status(status).json({ code: status, message: error.message || '服务器内部错误', data: null });
  }
});

// 获取审批详情
router.get('/detail/:business_type/:business_id', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    const { business_type, business_id } = req.params;
    const data = await approvalService.getApprovalDetail(pool, business_type, business_id);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('[审批] 获取审批详情失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 审批详情+客户历史
router.get('/detail-with-history/:business_type/:business_id', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    const { business_type, business_id } = req.params;
    const data = await approvalService.getDetailWithHistory(pool, business_type, business_id);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('[审批] 获取客户历史失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 我的待审批
router.get('/my-pending', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    const data = await approvalService.getMyPending(pool, req.user.userId);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('[审批] 获取待审批列表失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 我提交的审批
router.get('/my-submitted', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    const data = await approvalService.getMySubmitted(pool, req.user.userId);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('[审批] 获取已提交审批失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 批量通过
router.post('/batch-approve', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    const { ids, remark } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ code: 400, message: '请选择要审批的记录', data: null });
    const result = await approvalService.batchApprove(pool, ids, remark, req.user.userId, req.user.manageAll);
    res.json({ code: 200, message: `批量审批完成：成功${result.success}条，失败${result.failed}条`, data: result });
  } catch (error) {
    console.error('[审批] 批量通过错误:', error);
    res.status(500).json({ code: 500, message: '批量审批失败', data: null });
  }
});

// 批量驳回
router.post('/batch-reject', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    const { ids, remark } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ code: 400, message: '请选择要驳回的记录', data: null });
    const result = await approvalService.batchReject(pool, ids, remark, req.user.userId, req.user.manageAll);
    res.json({ code: 200, message: `批量驳回完成：成功${result.success}条，失败${result.failed}条`, data: result });
  } catch (error) {
    console.error('[审批] 批量驳回错误:', error);
    res.status(500).json({ code: 500, message: '批量驳回失败', data: null });
  }
});

module.exports = router;
