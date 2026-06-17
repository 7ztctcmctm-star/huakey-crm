const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const { SOURCE_PARENT_MAP } = require('./detail');

const MODULE_NAME = '客户管理';

const claimCustomerSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required()
});

const releaseCustomerSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required()
});

const { createRouteLogger } = require('../../middleware/logger');
const logAction = createRouteLogger(MODULE_NAME);

const router = express.Router();

// 公海客户列表
router.post('/pool', authenticateToken, checkPermission('customer:pool'), async (req, res) => {
  try {
    const { page = 1, pageSize = 10, company_name, industry, source, level, pool_type } = req.body;
    const offset = (page - 1) * pageSize;
    const params = [];

    // 公海准入：必须是已转化客户(status=2)，且负责人被置空
    let whereClause = 'WHERE c.pool_status = 1 AND c.status != 0';

    if (company_name) {
      whereClause += ' AND c.company_name LIKE ?';
      params.push(`%${company_name}%`);
    }
    if (industry) {
      whereClause += ' AND c.industry = ?';
      params.push(industry);
    }
    if (source) {
      if (SOURCE_PARENT_MAP[source]) {
        const children = SOURCE_PARENT_MAP[source];
        whereClause += ` AND c.source IN (${children.map(() => '?').join(',')})`;
        params.push(...children);
      } else {
        whereClause += ' AND c.source = ?';
        params.push(source);
      }
    }
    if (level) {
      whereClause += ' AND c.level = ?';
      params.push(level);
    }
    if (pool_type) {
      whereClause += ' AND c.pool_type = ?';
      params.push(pool_type);
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_customer c ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const [list] = await pool.query(
      `SELECT c.id, c.company_name, c.contact_name, c.phone, c.email,
        c.industry, c.source, c.level, c.status,
        c.pool_status, c.pool_type, c.protect_until, c.last_follow_time,
        c.create_time, c.update_time,
        u.real_name as owner_name
      FROM crm_customer c
      LEFT JOIN sys_user u ON c.owner_id = u.id
      ${whereClause}
      ORDER BY c.protect_until IS NULL ASC, c.protect_until ASC, c.create_time DESC
      LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200,
      message: '获取公海客户列表成功',
      data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('获取公海客户列表错误:', error);
    res.status(500).json({ code: 500, message: '获取公海客户列表失败', data: null });
  }
});

// 认领公海客户
router.post('/claim', authenticateToken, checkPermission('customer:pool'), validate(claimCustomerSchema), async (req, res) => {
  try {
    const { customer_id } = req.body;
    const userId = req.user.userId;

    if (!customer_id) {
      return res.status(400).json({ code: 400, message: '客户ID不能为空', data: null });
    }

    const [customers] = await pool.query(
      'SELECT id, pool_status, pool_type, protect_until, owner_id FROM crm_customer WHERE id = ? AND status != 0',
      [customer_id]
    );

    if (customers.length === 0) {
      return res.status(404).json({ code: 404, message: '客户不存在', data: null });
    }

    const customer = customers[0];

    // 检查是否在公海
    if (customer.pool_status !== 1) {
      return res.status(400).json({ code: 400, message: '该客户不在公海中', data: null });
    }

    // 私有池客户仅管理员可认领
    if (customer.pool_type === 'private' && !req.user.manageAll && req.user.roleId !== 1 && req.user.roleId !== 2) {
      return res.status(403).json({ code: 403, message: '私有池客户仅管理员可认领', data: null });
    }

    // 检查保护期
    if (customer.protect_until && new Date(customer.protect_until) > new Date()) {
      const remainDays = Math.ceil((new Date(customer.protect_until) - new Date()) / (1000 * 60 * 60 * 24));
      return res.status(400).json({
        code: 400,
        message: `该客户在保护期内，还需等待 ${remainDays} 天`,
        data: { protect_until: customer.protect_until }
      });
    }

    // 认领客户
    const protectUntil = new Date();
    protectUntil.setDate(protectUntil.getDate() + 7);

    await pool.query(
      'UPDATE crm_customer SET pool_status = 0, owner_id = ?, protect_until = ?, last_follow_time = NOW() WHERE id = ?',
      [userId, protectUntil, customer_id]
    );

    // 记录操作日志
    await pool.query(
      `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id)
       VALUES (?, 'claim', ?, ?)`,
      [customer_id, customer.owner_id, userId]
    );

    await logAction(req, 'claim', `认领客户: ${customer.company_name}`);

    res.json({ code: 200, message: '认领客户成功', data: { protect_until: protectUntil } });
  } catch (error) {
    console.error('认领客户错误:', error);
    res.status(500).json({ code: 500, message: '认领客户失败', data: null });
  }
});

// 批量认领公海客户
router.post('/batch-claim', authenticateToken, checkPermission('customer:pool'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { customer_ids } = req.body;
    const userId = req.user.userId;

    if (!customer_ids || !Array.isArray(customer_ids) || customer_ids.length === 0) {
      return res.status(400).json({ code: 400, message: '请选择要认领的客户', data: null });
    }

    if (customer_ids.length > 20) {
      return res.status(400).json({ code: 400, message: '单次批量认领不能超过20条', data: null });
    }

    await connection.beginTransaction();

    let claimed = 0;
    const skipped = [];
    const now = new Date();

    for (const customerId of customer_ids) {
      const [customers] = await connection.query(
        'SELECT id, pool_status, pool_type, protect_until, owner_id, company_name FROM crm_customer WHERE id = ? AND status != 0',
        [customerId]
      );

      if (customers.length === 0) { skipped.push(`${customerId}(不存在)`); continue; }
      const customer = customers[0];

      // 检查是否在公海
      if (customer.pool_status !== 1) { skipped.push(`${customer.company_name}(不在公海)`); continue; }

      // 私有池客户仅管理员可认领
      if (customer.pool_type === 'private' && !req.user.manageAll && req.user.roleId !== 1 && req.user.roleId !== 2) {
        skipped.push(`${customer.company_name}(私有池限制)`); continue;
      }

      // 检查保护期
      if (customer.protect_until && new Date(customer.protect_until) > now) {
        const remainDays = Math.ceil((new Date(customer.protect_until) - now) / (1000 * 60 * 60 * 24));
        skipped.push(`${customer.company_name}(保护期剩余${remainDays}天)`); continue;
      }

      // 认领
      const protectUntil = new Date(now);
      protectUntil.setDate(protectUntil.getDate() + 7);

      await connection.query(
        'UPDATE crm_customer SET pool_status = 0, owner_id = ?, protect_until = ?, last_follow_time = NOW() WHERE id = ?',
        [userId, protectUntil, customerId]
      );

      await connection.query(
        'INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id) VALUES (?, \'claim\', ?, ?)',
        [customerId, customer.owner_id, userId]
      );

      claimed++;
    }

    await connection.commit();

    await logAction(req, 'batch-claim', `批量认领 ${claimed} 个客户`);

    const msg = `成功认领 ${claimed} 个客户` + (skipped.length > 0 ? `，跳过: ${skipped.join('; ')}` : '');
    res.json({ code: 200, message: msg, data: { claimed, skipped: skipped.length > 0 ? skipped : null } });
  } catch (error) {
    await connection.rollback();
    console.error('批量认领错误:', error);
    res.status(500).json({ code: 500, message: '批量认领失败', data: null });
  } finally {
    connection.release();
  }
});

// 释放客户到公海
router.post('/release', authenticateToken, checkPermission('customer:pool'), validate(releaseCustomerSchema), async (req, res) => {
  try {
    const { customer_id } = req.body;
    const userId = req.user.userId;

    if (!customer_id) {
      return res.status(400).json({ code: 400, message: '客户ID不能为空', data: null });
    }

    const [customers] = await pool.query(
      'SELECT id, owner_id, company_name FROM crm_customer WHERE id = ? AND status != 0',
      [customer_id]
    );

    if (customers.length === 0) {
      return res.status(404).json({ code: 404, message: '客户不存在', data: null });
    }

    const customer = customers[0];

    // 权限检查：只能释放自己的客户（管理员/经理除外）
    if (req.user.roleId !== 1 && req.user.roleId !== 2 && req.user.roleId !== 3) {
      if (customer.owner_id !== userId) {
        return res.status(403).json({ code: 403, message: '无权释放该客户', data: null });
      }
    }

    // 释放到公海
    await pool.query(
      'UPDATE crm_customer SET pool_status = 1, owner_id = NULL, protect_until = NULL WHERE id = ?',
      [customer_id]
    );

    // 记录操作日志
    await pool.query(
      `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id)
       VALUES (?, 'release', ?, NULL)`,
      [customer_id, userId]
    );

    await logAction(req, 'release', `释放客户到公海: ${customer.company_name}`);

    res.json({ code: 200, message: '释放客户成功', data: null });
  } catch (error) {
    console.error('释放客户错误:', error);
    res.status(500).json({ code: 500, message: '释放客户失败', data: null });
  }
});

// 批量释放客户到公海
// [安全修复] 添加事务保护和数量上限，防止部分失败导致数据不一致
router.post('/batch-release', authenticateToken, checkPermission('customer:pool'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { customer_ids } = req.body;
    const userId = req.user.userId;

    if (!customer_ids || !Array.isArray(customer_ids) || customer_ids.length === 0) {
      return res.status(400).json({ code: 400, message: '请选择要释放的客户', data: null });
    }

    // 数量上限防止恶意提交
    if (customer_ids.length > 100) {
      return res.status(400).json({ code: 400, message: '单次批量操作不能超过100条', data: null });
    }

    await connection.beginTransaction();

    let successCount = 0;
    for (const customerId of customer_ids) {
      const [customers] = await connection.query(
        'SELECT id, owner_id, pool_status FROM crm_customer WHERE id = ? AND status != 0',
        [customerId]
      );

      if (customers.length === 0) continue;
      const customer = customers[0];

      // 权限检查
      if (req.user.roleId !== 1 && req.user.roleId !== 2 && req.user.roleId !== 3) {
        if (customer.owner_id !== userId) continue;
      }

      if (customer.pool_status === 1) continue; // 已经在公海

      await connection.query(
        'UPDATE crm_customer SET pool_status = 1, owner_id = NULL, protect_until = NULL WHERE id = ?',
        [customerId]
      );

      await connection.query(
        `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id)
         VALUES (?, 'release', ?, NULL)`,
        [customerId, userId]
      );

      successCount++;
    }

    await connection.commit();

    await logAction(req, 'batch-release', `批量释放 ${successCount} 个客户到公海`);

    res.json({ code: 200, message: `成功释放 ${successCount} 个客户`, data: { count: successCount } });
  } catch (error) {
    await connection.rollback();
    console.error('批量释放错误:', error);
    res.status(500).json({ code: 500, message: '批量释放失败', data: null });
  } finally {
    connection.release();
  }
});

// 获取公海操作日志
router.post('/pool-log', authenticateToken, checkPermission('customer:pool'), async (req, res) => {
  try {
    const { customer_id, page = 1, pageSize = 20 } = req.body;
    const offset = (page - 1) * pageSize;
    const params = [];

    let whereClause = '1=1';
    if (customer_id) {
      whereClause += ' AND pl.customer_id = ?';
      params.push(customer_id);
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_pool_log pl WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const [list] = await pool.query(
      `SELECT pl.*,
        cu.real_name as from_user_name,
        cu2.real_name as to_user_name,
        c.company_name
      FROM crm_pool_log pl
      LEFT JOIN crm_customer c ON pl.customer_id = c.id
      LEFT JOIN sys_user cu ON pl.from_user_id = cu.id
      LEFT JOIN sys_user cu2 ON pl.to_user_id = cu2.id
      WHERE ${whereClause}
      ORDER BY pl.create_time DESC
      LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200,
      message: '查询成功',
      data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('查询公海日志错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

module.exports = router;
