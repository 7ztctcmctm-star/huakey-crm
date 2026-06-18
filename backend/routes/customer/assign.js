const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { requireManager } = require('../../middleware/admin');
const { validate, Joi } = require('../../middleware/validate');

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

    const [customers] = await pool.query(
      'SELECT id, owner_id, company_name FROM crm_customer WHERE id = ? AND status != 0',
      [customer_id]
    );

    if (customers.length === 0) {
      return res.status(404).json({ code: 404, message: '客户不存在', data: null });
    }

    const customer = customers[0];
    const fromUserId = customer.owner_id;

    // 更新负责人（to_user_id 为 null 表示回收为无负责人）
    await pool.query(
      'UPDATE crm_customer SET owner_id = ?, pool_status = 0, protect_until = NULL WHERE id = ?',
      [to_user_id || null, customer_id]
    );

    // 记录分配日志
    await pool.query(
      'INSERT INTO crm_assign_log (customer_id, from_user_id, to_user_id, operator_id, remark) VALUES (?, ?, ?, ?, ?)',
      [customer_id, fromUserId, to_user_id || null, userId, remark || null]
    );

    const actionDesc = to_user_id ? `分配给用户ID ${to_user_id}` : '回收为待分配';
    await logAction(req, 'assign', `${actionDesc}: ${customer.company_name}`);

    res.json({ code: 200, message: to_user_id ? '分配成功' : '已回收为待分配', data: null });
  } catch (error) {
    console.error('分配客户错误:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 批量分配客户负责人
// [安全修复] 添加事务保护和数量上限，防止部分失败导致数据不一致
router.post('/batch-assign', authenticateToken, checkPermission('customer:assign'), requireManager, validate(batchAssignSchema), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { customer_ids, to_user_id, remark } = req.body;
    const userId = req.user.userId;

    await connection.beginTransaction();

    let successCount = 0;
    for (const customerId of customer_ids) {
      const [customers] = await connection.query(
        'SELECT id, company_name, owner_id FROM crm_customer WHERE id = ? AND status != 0',
        [customerId]
      );

      if (customers.length === 0) continue;
      const customer = customers[0];

      await connection.query(
        'UPDATE crm_customer SET owner_id = ?, pool_status = 0, protect_until = NULL WHERE id = ?',
        [to_user_id, customerId]
      );

      await connection.query(
        `INSERT INTO crm_assign_log (customer_id, from_user_id, to_user_id, operator_id, remark)
         VALUES (?, ?, ?, ?, ?)`,
        [customerId, customer.owner_id, to_user_id, userId, remark || null]
      );

      successCount++;
    }

    await connection.commit();

    await logAction(req, 'batch-assign', `批量分配 ${successCount} 个客户 → 用户ID ${to_user_id}`);

    res.json({ code: 200, message: `成功分配 ${successCount} 个客户`, data: { count: successCount } });
  } catch (error) {
    await connection.rollback();
    console.error('批量分配错误:', error);
    res.status(500).json({ code: 500, message: '批量分配失败', data: null });
  } finally {
    connection.release();
  }
});

// 查询分配日志
router.post('/assign-log', authenticateToken, checkPermission('customer:assign'), async (req, res) => {
  try {
    const { customer_id, page = 1, pageSize = 20 } = req.body;
    const offset = (page - 1) * pageSize;
    const params = [];

    let whereClause = '1=1';
    if (customer_id) {
      whereClause += ' AND al.customer_id = ?';
      params.push(customer_id);
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_assign_log al WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const [list] = await pool.query(
      `SELECT al.*,
        c.company_name,
        u1.real_name as from_user_name,
        u2.real_name as to_user_name,
        u3.real_name as operator_name
      FROM crm_assign_log al
      LEFT JOIN crm_customer c ON al.customer_id = c.id
      LEFT JOIN sys_user u1 ON al.from_user_id = u1.id
      LEFT JOIN sys_user u2 ON al.to_user_id = u2.id
      LEFT JOIN sys_user u3 ON al.operator_id = u3.id
      WHERE ${whereClause}
      ORDER BY al.create_time DESC
      LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200, message: '查询成功',
      data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('查询分配日志错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 获取销售用户列表（供分配下拉选择）
router.get('/sales-users', authenticateToken, checkPermission('customer:assign'), async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT u.id, u.real_name, u.username, d.name as dept_name
       FROM sys_user u
       LEFT JOIN sys_dept d ON u.dept_id = d.id
       LEFT JOIN sys_role r ON u.role_id = r.id
       WHERE u.status = 1 AND r.code IN ('sales_manager', 'sales', 'tech')
       ORDER BY d.name, u.real_name`
    );
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
    const [users] = await pool.query(
      `SELECT u.id, u.real_name, u.username, d.name as dept_name
       FROM sys_user u
       LEFT JOIN sys_dept d ON u.dept_id = d.id
       WHERE u.status = 1 AND u.manager_id = ?
       ORDER BY d.name, u.real_name`,
      [userId]
    );
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
    const [list] = await pool.query(
      'SELECT * FROM crm_assign_rule ORDER BY priority DESC, id ASC'
    );
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

    const [result] = await pool.query(
      `INSERT INTO crm_assign_rule (rule_name, assign_type, source_value, region_value, user_ids, priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [rule_name, assign_type, source_value || null, region_value || null, JSON.stringify(user_ids), priority || 0]
    );
    await logAction(req, 'add-assign-rule', `添加分配规则: ${rule_name}`);
    res.json({ code: 200, message: '添加成功', data: { id: result.insertId } });
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

    const updates = [];
    const params = [];
    if (rule_name !== undefined) { updates.push('rule_name = ?'); params.push(rule_name); }
    if (assign_type !== undefined) { updates.push('assign_type = ?'); params.push(assign_type); }
    if (source_value !== undefined) { updates.push('source_value = ?'); params.push(source_value); }
    if (region_value !== undefined) { updates.push('region_value = ?'); params.push(region_value); }
    if (user_ids !== undefined) { updates.push('user_ids = ?'); params.push(JSON.stringify(user_ids)); }
    if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }

    if (updates.length === 0) return res.status(400).json({ code: 400, message: '无更新内容', data: null });

    params.push(id);
    await pool.query(`UPDATE crm_assign_rule SET ${updates.join(', ')} WHERE id = ?`, params);
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
    await pool.query('DELETE FROM crm_assign_rule WHERE id = ?', [id]);
    await logAction(req, 'delete-assign-rule', `删除分配规则ID: ${id}`);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('删除分配规则错误:', error);
    res.status(500).json({ code: 500, message: '删除失败', data: null });
  }
});

// 自动分配逻辑（供 detail.js 新增客户时调用）
async function autoAssignOwner(customer) {
  try {
    const [rules] = await pool.query(
      'SELECT * FROM crm_assign_rule WHERE is_active = 1 ORDER BY priority DESC'
    );
    if (rules.length === 0) return null;

    for (const rule of rules) {
      let matched = false;

      if (rule.assign_type === 'round_robin') {
        matched = true;
      } else if (rule.assign_type === 'by_source' && customer.source === rule.source_value) {
        matched = true;
      } else if (rule.assign_type === 'by_region' && customer.address && customer.address.includes(rule.region_value)) {
        matched = true;
      }

      if (matched) {
        let userIds;
        try {
          userIds = typeof rule.user_ids === 'string' ? JSON.parse(rule.user_ids) : rule.user_ids;
        } catch (error) {
          console.error('[客户分配] 解析用户ID失败:', error);
          continue;
        }
        if (!Array.isArray(userIds) || userIds.length === 0) continue;

        const lastIndex = rule.last_assigned_index || 0;
        const nextIndex = (lastIndex + 1) % userIds.length;

        await pool.query(
          'UPDATE crm_assign_rule SET last_assigned_index = ? WHERE id = ?',
          [nextIndex, rule.id]
        );

        return userIds[nextIndex];
      }
    }
    return null;
  } catch (error) {
    console.error('自动分配规则执行错误:', error);
    return null;
  }
}

module.exports = router;
module.exports.autoAssignOwner = autoAssignOwner;

// 轮询自动分配：将公海客户均匀分配给销售团队
router.post('/auto-assign', authenticateToken, checkPermission('customer:assign'), requireManager, async (req, res) => {
  try {
  const connection = await pool.getConnection();
  try {
    // 获取公海可分配客户（无负责人且不在保护期）
    const [customers] = await connection.query(
      `SELECT id, owner_id FROM crm_customer
       WHERE status != 0 AND owner_id IS NULL
         AND (protect_until IS NULL OR protect_until < NOW())
       ORDER BY create_time ASC
       LIMIT 500`
    );

    if (customers.length === 0) {
      return res.status(400).json({ code: 400, message: '没有可分配的客户', data: null });
    }

    // 获取活跃销售用户
    const [salesUsers] = await connection.query(
      `SELECT u.id FROM sys_user u
       LEFT JOIN sys_role r ON u.role_id = r.id
       WHERE u.status = 1 AND r.code IN ('sales_manager', 'sales', 'tech')
       ORDER BY u.id`
    );

    if (salesUsers.length === 0) {
      return res.status(400).json({ code: 400, message: '没有可用的销售人员', data: null });
    }

    await connection.beginTransaction();

    const userId = req.user.userId;
    let successCount = 0;

    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      const targetUser = salesUsers[i % salesUsers.length];

      await connection.query(
        'UPDATE crm_customer SET owner_id = ?, pool_status = 0, protect_until = NULL WHERE id = ?',
        [targetUser.id, customer.id]
      );

      await connection.query(
        `INSERT INTO crm_assign_log (customer_id, from_user_id, to_user_id, operator_id, remark)
         VALUES (?, ?, ?, ?, '轮询自动分配')`,
        [customer.id, customer.owner_id, targetUser.id, userId]
      );

      successCount++;
    }

    await connection.commit();

    await logAction(req, 'auto-assign', `轮询分配 ${successCount} 个客户给 ${salesUsers.length} 名销售`);

    res.json({
      code: 200,
      message: `已将 ${successCount} 个客户分配给 ${salesUsers.length} 名销售`,
      data: { count: successCount, sales_count: salesUsers.length }
    });
  } catch (error) {
    await connection.rollback();
    console.error('自动分配错误:', error);
    res.status(500).json({ code: 500, message: '自动分配失败', data: null });
  } finally {
    connection.release();
  }
  } catch (error) {
    console.error('自动分配错误:', error);
    res.status(500).json({ code: 500, message: '自动分配失败', data: null });
  }
});
