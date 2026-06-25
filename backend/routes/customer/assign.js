const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { requireManager } = require('../../middleware/admin');
const { validate, Joi } = require('../../middleware/validate');
const {
  getAssignRules,
  createRule,
  updateRule,
  deleteRule,
  applyRule,
  autoAssignOwner,
  manualAssign,
  batchAssign,
  getAssignLogs,
  getSalesUsers,
  getMySubordinates
} = require('../../services/assignService');

const MODULE_NAME = '客户管理';

const { createRouteLogger } = require('../../middleware/logger');
const logAction = createRouteLogger(MODULE_NAME);

const router = express.Router();

// Validation schemas
const assignSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  to_user_id: Joi.number().integer().positive().allow(null),
  remark: Joi.string().max(200).allow('', null)
});

const batchAssignSchema = Joi.object({
  customer_ids: Joi.array().items(Joi.number().integer().positive()).min(1).max(100).required(),
  to_user_id: Joi.number().integer().positive().allow(null),
  remark: Joi.string().max(200).allow('', null)
});

// 分配/回收客户负责人（支持设为"无负责人"）
// to_user_id 可以为 null，表示回收为无负责人状态
router.post('/assign', authenticateToken, checkPermission('customer:assign'), requireManager, validate(assignSchema), async (req, res) => {
  try {
    const { customer_id, to_user_id, remark } = req.body;
    const userId = req.user.userId;

    const result = await manualAssign(pool, customer_id, to_user_id, userId, remark);

    if (result.code === 404) {
      return res.status(404).json({ code: 404, message: result.message, data: null });
    }

    const actionDesc = to_user_id ? `分配给用户ID ${to_user_id}` : '回收为待分配';
    await logAction(req, 'assign', `${actionDesc}: ${result.company_name}`);

    res.json({ code: 200, message: result.message, data: null });
  } catch (error) {
    console.error('分配客户错误:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 批量分配客户负责人
router.post('/batch-assign', authenticateToken, checkPermission('customer:assign'), requireManager, validate(batchAssignSchema), async (req, res) => {
  try {
    const { customer_ids, to_user_id, remark } = req.body;
    const userId = req.user.userId;

    const result = await batchAssign(pool, customer_ids, to_user_id, userId, remark);

    await logAction(req, 'batch-assign', `批量分配 ${result.count} 个客户 → 用户ID ${to_user_id}`);

    res.json({ code: 200, message: `成功分配 ${result.count} 个客户`, data: { count: result.count } });
  } catch (error) {
    console.error('批量分配错误:', error);
    res.status(500).json({ code: 500, message: '批量分配失败', data: null });
  }
});

// 查询分配日志
router.post('/assign-log', authenticateToken, checkPermission('customer:assign'), async (req, res) => {
  try {
    const { customer_id, page = 1, pageSize = 20 } = req.body;
    const data = await getAssignLogs(pool, { customer_id, page, pageSize });

    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('查询分配日志错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 获取销售用户列表（供分配下拉选择）
router.get('/sales-users', authenticateToken, checkPermission('customer:assign'), async (req, res) => {
  try {
    const users = await getSalesUsers(pool);
    res.json({ code: 200, message: '查询成功', data: users });
  } catch (error) {
    console.error('获取销售用户列表错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 获取当前用户的下属列表（通过manager_id关联）
router.get('/my-subordinates', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const users = await getMySubordinates(pool, userId);
    res.json({ code: 200, message: '查询成功', data: users });
  } catch (error) {
    console.error('获取下属列表错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// ========== 分配规则管理 ==========

// 获取分配规则列表
router.get('/assign-rules', authenticateToken, requireManager, async (req, res) => {
  try {
    const list = await getAssignRules(pool);
    res.json({ code: 200, message: '查询成功', data: list });
  } catch (error) {
    console.error('查询分配规则错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 添加分配规则
router.post('/assign-rules/add', authenticateToken, requireManager, async (req, res) => {
  try {
    const { rule_name, assign_type, source_value, region_value, user_ids, priority } = req.body;
    if (!rule_name || !assign_type || !user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ code: 400, message: '规则名称、分配方式、用户列表为必填', data: null });
    }
    if (!['round_robin', 'by_source', 'by_region'].includes(assign_type)) {
      return res.status(400).json({ code: 400, message: '无效的分配方式', data: null });
    }
    if (assign_type === 'by_source' && !source_value) {
      return res.status(400).json({ code: 400, message: '按来源分配时必须指定来源值', data: null });
    }
    if (assign_type === 'by_region' && !region_value) {
      return res.status(400).json({ code: 400, message: '按区域分配时必须指定区域值', data: null });
    }

    const id = await createRule(pool, { rule_name, assign_type, source_value, region_value, user_ids, priority });
    await logAction(req, 'add-assign-rule', `添加分配规则: ${rule_name}`);
    res.json({ code: 200, message: '添加成功', data: { id } });
  } catch (error) {
    console.error('添加分配规则错误:', error);
    res.status(500).json({ code: 500, message: '添加失败', data: null });
  }
});

// 更新分配规则
router.post('/assign-rules/update', authenticateToken, requireManager, async (req, res) => {
  try {
    const { id, rule_name, assign_type, source_value, region_value, user_ids, priority, is_active } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '规则ID不能为空', data: null });

    const affectedRows = await updateRule(pool, id, { rule_name, assign_type, source_value, region_value, user_ids, priority, is_active });
    if (affectedRows === 0) {
      return res.status(400).json({ code: 400, message: '无更新内容', data: null });
    }

    await logAction(req, 'update-assign-rule', `更新分配规则ID: ${id}`);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('更新分配规则错误:', error);
    res.status(500).json({ code: 500, message: '更新失败', data: null });
  }
});

// 删除分配规则
router.post('/assign-rules/delete', authenticateToken, requireManager, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '规则ID不能为空', data: null });
    await deleteRule(pool, id);
    await logAction(req, 'delete-assign-rule', `删除分配规则ID: ${id}`);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('删除分配规则错误:', error);
    res.status(500).json({ code: 500, message: '删除失败', data: null });
  }
});

// 轮询自动分配：将公海客户均匀分配给销售团队
router.post('/auto-assign', authenticateToken, checkPermission('customer:assign'), requireManager, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await applyRule(pool, userId);

    if (result.count === 0) {
      return res.status(400).json({ code: 400, message: result.message, data: null });
    }

    await logAction(req, 'auto-assign', `轮询分配 ${result.count} 个客户给 ${result.sales_count} 名销售`);

    res.json({
      code: 200,
      message: `已将 ${result.count} 个客户分配给 ${result.sales_count} 名销售`,
      data: { count: result.count, sales_count: result.sales_count }
    });
  } catch (error) {
    console.error('自动分配错误:', error);
    res.status(500).json({ code: 500, message: '自动分配失败', data: null });
  }
});

module.exports = router;
module.exports.autoAssignOwner = autoAssignOwner;
