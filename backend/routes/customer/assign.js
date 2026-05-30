const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');

const MODULE_NAME = '客户管理';

const { createRouteLogger } = require('../../middleware/logger');
const logAction = createRouteLogger(MODULE_NAME);

const router = express.Router();

// 分配客户负责人（单个）
router.post('/assign', authenticateToken, checkPermission('customer:assign'), async (req, res) => {
  try {
    const { customer_id, to_user_id, remark } = req.body;
    const userId = req.user.userId;

    if (!customer_id || !to_user_id) {
      return res.status(400).json({ code: 400, message: '客户ID和新负责人ID不能为空', data: null });
    }

    // 权限检查：只有 manageAll 或管理员可分配
    if (!(req.user.manageAll || req.user.roleId === 1 || req.user.roleId === 2)) {
      return res.status(403).json({ code: 403, message: '无权分配客户负责人', data: null });
    }

    const [customers] = await pool.query(
      'SELECT id, owner_id, company_name FROM crm_customer WHERE id = ? AND status != 0',
      [customer_id]
    );

    if (customers.length === 0) {
      return res.status(404).json({ code: 404, message: '客户不存在', data: null });
    }

    const customer = customers[0];
    const fromUserId = customer.owner_id;

    // 更新负责人
    await pool.query(
      'UPDATE crm_customer SET owner_id = ?, pool_status = 0, protect_until = NULL WHERE id = ?',
      [to_user_id, customer_id]
    );

    // 记录分配日志
    await pool.query(
      `INSERT INTO crm_assign_log (customer_id, from_user_id, to_user_id, operator_id, remark)
       VALUES (?, ?, ?, ?, ?)`,
      [customer_id, fromUserId, to_user_id, userId, remark || null]
    );

    await logAction(req, 'assign', `分配客户: ${customer.company_name} → 用户ID ${to_user_id}`);

    res.json({ code: 200, message: '分配成功', data: null });
  } catch (error) {
    console.error('分配客户错误:', error);
    res.status(500).json({ code: 500, message: '分配失败', data: null });
  }
});

// 批量分配客户负责人
// [安全修复] 添加事务保护和数量上限，防止部分失败导致数据不一致
router.post('/batch-assign', authenticateToken, checkPermission('customer:assign'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { customer_ids, to_user_id, remark } = req.body;
    const userId = req.user.userId;

    if (!customer_ids || !Array.isArray(customer_ids) || customer_ids.length === 0) {
      return res.status(400).json({ code: 400, message: '请选择要分配的客户', data: null });
    }
    if (!to_user_id) {
      return res.status(400).json({ code: 400, message: '请选择新负责人', data: null });
    }

    // 数量上限防止恶意提交
    if (customer_ids.length > 100) {
      return res.status(400).json({ code: 400, message: '单次批量操作不能超过100条', data: null });
    }

    if (!(req.user.manageAll || req.user.roleId === 1 || req.user.roleId === 2)) {
      return res.status(403).json({ code: 403, message: '无权批量分配客户', data: null });
    }

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
router.post('/assign-log', authenticateToken, async (req, res) => {
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
router.get('/sales-users', authenticateToken, async (req, res) => {
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

// 获取行业列表
router.get('/industries/list', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT DISTINCT industry FROM crm_customer WHERE industry IS NOT NULL AND industry != "" AND status != 0 ORDER BY industry'
    );
    res.json({ code: 200, message: '查询成功', data: rows.map(r => r.industry) });
  } catch (error) {
    console.error('获取行业列表错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 轮询自动分配：将公海客户均匀分配给销售团队
router.post('/auto-assign', authenticateToken, checkPermission('customer:assign'), async (req, res) => {
  if (!(req.user.manageAll || req.user.roleId === 1 || req.user.roleId === 2)) {
    return res.status(403).json({ code: 403, message: '无权执行自动分配', data: null });
  }

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
});

module.exports = router;
