const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// 老板团队跟单全景视图 API

// 1. 团队总览卡片数据
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const isBoss = req.user.viewAll || req.user.roleId === 1 || req.user.roleId === 2;

    let userFilter = '';
    const params = [];

    if (!isBoss) {
      userFilter = ' AND c.owner_id = ?';
      params.push(userId);
    }

    // 团队总客户数
    const [totalCustomers] = await pool.query(
      `SELECT COUNT(*) as count FROM crm_customer c WHERE c.status != 0 ${userFilter}`,
      params
    );

    // 本周新增客户
    const [weekNew] = await pool.query(
      `SELECT COUNT(*) as count FROM crm_customer c
       WHERE c.status != 0 AND YEARWEEK(c.create_time, 1) = YEARWEEK(NOW(), 1) ${userFilter}`,
      params
    );

    // 活跃商机数（非成交/失败阶段）
    const [activeOpps] = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(expected_amount), 0) as total_amount
       FROM crm_opportunity
       WHERE stage NOT IN (5, 6) ${isBoss ? '' : ' AND owner_id = ?'}`,
      isBoss ? [] : [userId]
    );

    // 即将逾期任务数（15天内未跟进的客户）
    const [overdueCount] = await pool.query(
      `SELECT COUNT(*) as count FROM crm_customer c
       WHERE c.status NOT IN (2, 3) AND c.status != 0
         AND (c.last_follow_time IS NULL
           OR c.last_follow_time < DATE_SUB(NOW(), INTERVAL 15 DAY))
         ${userFilter}`,
      params
    );

    res.json({
      code: 200, message: '查询成功',
      data: {
        total_customers: totalCustomers[0].count,
        week_new: weekNew[0].count,
        active_opportunities: activeOpps[0].count,
        active_opportunity_amount: activeOpps[0].total_amount?.toString() || '0',
        overdue_count: overdueCount[0].count
      }
    });
  } catch (error) {
    console.error('团队概览错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 2. 每个销售的实况卡片
router.get('/sales-breakdown', authenticateToken, async (req, res) => {
  try {
    const isBoss = req.user.viewAll || req.user.roleId === 1 || req.user.roleId === 2;

    let userFilter = '';
    let oppFilter = '';
    const params = [];

    if (!isBoss) {
      userFilter = 'WHERE u.id = ?';
      oppFilter = 'AND o.owner_id = ?';
      params.push(req.user.userId);
    }

    // 获取所有活跃销售用户
    const [salesUsers] = await pool.query(
      `SELECT u.id, u.real_name, u.username, d.name as dept_name
       FROM sys_user u
       LEFT JOIN sys_dept d ON u.dept_id = d.id
       LEFT JOIN sys_role r ON u.role_id = r.id
       WHERE u.status = 1 AND r.code IN ('sales_manager', 'sales', 'tech')
       ${userFilter}
       ORDER BY d.name, u.real_name`,
      params
    );

    if (salesUsers.length === 0) {
      return res.json({ code: 200, message: '查询成功', data: [] });
    }

    // 为每个销售查询统计数据
    const result = [];
    for (const user of salesUsers) {
      // 负责客户数
      const [customerCount] = await pool.query(
        'SELECT COUNT(*) as count FROM crm_customer WHERE owner_id = ? AND status != 0',
        [user.id]
      );

      // 活跃商机
      const [oppCount] = await pool.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(expected_amount), 0) as total_amount
         FROM crm_opportunity WHERE owner_id = ? AND stage NOT IN (5, 6)`,
        [user.id]
      );

      // 今日待办（今日需跟进的客户 + 今日工单）
      const [todayFollows] = await pool.query(
        `SELECT COUNT(*) as count FROM crm_follow_up
         WHERE create_by = ? AND next_time IS NOT NULL AND DATE(next_time) = CURDATE()`,
        [user.id]
      );
      const [todayServices] = await pool.query(
        `SELECT COUNT(*) as count FROM crm_service_order
         WHERE assignee_id = ? AND status IN (1, 2)`,
        [user.id]
      );

      // 近期无跟进客户数（15天）
      const [noFollowCount] = await pool.query(
        `SELECT COUNT(*) as count FROM crm_customer
         WHERE owner_id = ? AND status NOT IN (2, 3) AND status != 0
           AND (last_follow_time IS NULL
             OR last_follow_time < DATE_SUB(NOW(), INTERVAL 15 DAY))`,
        [user.id]
      );

      result.push({
        user_id: user.id,
        real_name: user.real_name,
        username: user.username,
        dept_name: user.dept_name,
        customer_count: customerCount[0].count,
        active_opp_count: oppCount[0].count,
        active_opp_amount: oppCount[0].total_amount?.toString() || '0',
        today_tasks: todayFollows[0].count + todayServices[0].count,
        no_follow_count: noFollowCount[0].count
      });
    }

    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    console.error('销售实况错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 3. 下钻：某个销售的逾期未跟进客户明细
router.post('/sales-overdue-customers', authenticateToken, async (req, res) => {
  try {
    const { user_id, page = 1, pageSize = 20 } = req.body;
    const offset = (page - 1) * pageSize;

    if (!user_id) {
      return res.status(400).json({ code: 400, message: '请指定销售人员', data: null });
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_customer
       WHERE owner_id = ? AND status NOT IN (2, 3) AND status != 0
         AND (last_follow_time IS NULL
           OR last_follow_time < DATE_SUB(NOW(), INTERVAL 15 DAY))`,
      [user_id]
    );

    const [list] = await pool.query(
      `SELECT id, company_name, contact_name, phone, level, status,
              last_follow_time, create_time,
              DATEDIFF(NOW(), COALESCE(last_follow_time, create_time)) as overdue_days
       FROM crm_customer
       WHERE owner_id = ? AND status NOT IN (2, 3) AND status != 0
         AND (last_follow_time IS NULL
           OR last_follow_time < DATE_SUB(NOW(), INTERVAL 15 DAY))
       ORDER BY overdue_days DESC
       LIMIT ? OFFSET ?`,
      [user_id, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200, message: '查询成功',
      data: { list, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('逾期客户错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 4. 下钻：某个销售的所有客户列表
router.post('/sales-customers', authenticateToken, async (req, res) => {
  try {
    const { user_id, page = 1, pageSize = 20 } = req.body;
    const offset = (page - 1) * pageSize;

    if (!user_id) {
      return res.status(400).json({ code: 400, message: '请指定销售人员', data: null });
    }

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM crm_customer WHERE owner_id = ? AND status != 0',
      [user_id]
    );

    const [list] = await pool.query(
      `SELECT id, company_name, contact_name, phone, source, level, status,
              last_follow_time, create_time
       FROM crm_customer
       WHERE owner_id = ? AND status != 0
       ORDER BY last_follow_time IS NULL ASC, last_follow_time DESC, create_time DESC
       LIMIT ? OFFSET ?`,
      [user_id, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200, message: '查询成功',
      data: { list, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('销售客户错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

module.exports = router;
