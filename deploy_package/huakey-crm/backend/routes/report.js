const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// 销售漏斗统计
router.get('/sales-funnel', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        so.stage,
        COUNT(so.id) as count,
        COALESCE(SUM(so.expected_amount), 0) as amount
      FROM crm_opportunity so
      GROUP BY so.stage
      ORDER BY so.stage ASC
    `);

    const stageNames = ['', '询盘', '需求确认', '方案报价', '谈判', '成交', '失败'];
    const result = [];
    for (let i = 1; i <= 6; i++) {
      const row = rows.find(r => Number(r.stage) === i);
      result.push({
        stage: stageNames[i],
        count: row?.count || 0,
        amount: row?.amount?.toString() || '0.00'
      });
    }

    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 业绩统计
router.get('/performance', authenticateToken, async (req, res) => {
  const { startDate, endDate } = req.query;
  
  let dateFilter = '';
  const params = [];
  
  if (startDate && endDate) {
    dateFilter = 'AND c.sign_date BETWEEN ? AND ?';
    params.push(startDate, endDate);
  } else {
    dateFilter = 'AND DATE_FORMAT(c.sign_date, "%Y-%m") = DATE_FORMAT(NOW(), "%Y-%m")';
  }

  try {
    const [rows] = await pool.query(`
      SELECT 
        u.id as user_id,
        u.real_name as name,
        COALESCE(SUM(c.amount), 0) as contract_amount,
        COALESCE(SUM(p.pay_amount), 0) as payment_amount
      FROM sys_user u
      LEFT JOIN crm_contract c ON u.id = c.create_by ${dateFilter}
      LEFT JOIN crm_payment p ON c.id = p.contract_id
      WHERE u.status = 1
      GROUP BY u.id, u.real_name
      ORDER BY contract_amount DESC
    `, params);

    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 客户统计
router.get('/customer', authenticateToken, async (req, res) => {
  try {
    // 本月新增客户数
    const [monthCount] = await pool.query(`
      SELECT COUNT(*) as count FROM crm_customer 
      WHERE DATE_FORMAT(create_time, "%Y-%m") = DATE_FORMAT(NOW(), "%Y-%m")
    `);

    // 客户来源分布（按父分组汇总，网络子渠道归入"网络"）
    const [sourceDist] = await pool.query(`
      SELECT
        CASE
          WHEN source IN ('Facebook','Instagram','LinkedIn','独立站','其他网络渠道') THEN '网络'
          ELSE source
        END as source,
        COUNT(*) as count
      FROM crm_customer
      WHERE status != 0
      GROUP BY CASE
        WHEN source IN ('Facebook','Instagram','LinkedIn','独立站','其他网络渠道') THEN '网络'
        ELSE source
      END
      ORDER BY count DESC
    `);

    // 客户来源明细分布（含网络子渠道，用于明细报表）
    const [sourceDetailDist] = await pool.query(`
      SELECT source, COUNT(*) as count
      FROM crm_customer
      WHERE status != 0
      GROUP BY source
      ORDER BY count DESC
    `);

    // 客户等级分布
    const [levelDist] = await pool.query(`
      SELECT level, COUNT(*) as count 
      FROM crm_customer 
      GROUP BY level 
      ORDER BY FIELD(level, 'A', 'B', 'C', 'D')
    `);

    res.json({
      code: 200,
      message: '查询成功',
      data: {
        month_new: monthCount[0].count,
        source_dist: sourceDist,
        source_detail_dist: sourceDetailDist,
        level_dist: levelDist
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 回款统计
router.get('/payment', authenticateToken, async (req, res) => {
  try {
    // 本月计划回款
    const [planAmount] = await pool.query(`
      SELECT COALESCE(SUM(plan_amount), 0) as amount 
      FROM crm_payment_plan 
      WHERE DATE_FORMAT(plan_date, "%Y-%m") = DATE_FORMAT(NOW(), "%Y-%m")
    `);

    // 本月实际回款
    const [payAmount] = await pool.query(`
      SELECT COALESCE(SUM(pay_amount), 0) as amount 
      FROM crm_payment 
      WHERE DATE_FORMAT(pay_date, "%Y-%m") = DATE_FORMAT(NOW(), "%Y-%m")
    `);

    // 逾期账款（计划日期已过但未完全回款的金额）
    const [overdueRows] = await pool.query(`
      SELECT COALESCE(SUM(
        GREATEST(pp.plan_amount - COALESCE(paid.total, 0), 0)
      ), 0) as amount
      FROM crm_payment_plan pp
      LEFT JOIN (
        SELECT plan_id, SUM(pay_amount) as total
        FROM crm_payment
        GROUP BY plan_id
      ) paid ON pp.id = paid.plan_id
      WHERE pp.plan_date < CURDATE()
    `);

    const overdueTotal = parseFloat(overdueRows[0].amount) || 0;

    res.json({
      code: 200,
      message: '查询成功',
      data: {
        plan_amount: planAmount[0].amount?.toString() || '0.00',
        pay_amount: payAmount[0].amount?.toString() || '0.00',
        overdue_amount: overdueTotal.toFixed(2)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 销售趋势（近12个月）
router.get('/sales-trend', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        DATE_FORMAT(c.sign_date, "%Y-%m") as month,
        COUNT(c.id) as contract_count,
        COALESCE(SUM(c.amount), 0) as amount
      FROM crm_contract c
      WHERE c.sign_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(c.sign_date, "%Y-%m")
      ORDER BY month
    `);

    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 概览数据（首页仪表盘）
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const roleId = req.user.roleId;

    const isAdmin = roleId === 1 || roleId === 2;

    let customerFilter = '';
    let contractFilter = '';
    let paymentFilter = '';
    let followFilter = '';

    if (!isAdmin) {
      customerFilter = ' AND owner_id = ?';
      contractFilter = ' AND create_by = ?';
      followFilter = ' AND create_by = ?';
    }

    const params = isAdmin ? [] : [userId];

    const [monthSales] = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as amount 
      FROM crm_contract 
      WHERE DATE_FORMAT(sign_date, "%Y-%m") = DATE_FORMAT(NOW(), "%Y-%m") ${contractFilter}
    `, params);

    const [monthCustomers] = await pool.query(`
      SELECT COUNT(*) as count 
      FROM crm_customer 
      WHERE DATE_FORMAT(create_time, "%Y-%m") = DATE_FORMAT(NOW(), "%Y-%m") ${customerFilter}
    `, params);

    const [monthContracts] = await pool.query(`
      SELECT COUNT(*) as count 
      FROM crm_contract 
      WHERE DATE_FORMAT(create_time, "%Y-%m") = DATE_FORMAT(NOW(), "%Y-%m") ${contractFilter}
    `, params);

    const [monthPayments] = await pool.query(`
      SELECT COALESCE(SUM(p.pay_amount), 0) as amount 
      FROM crm_payment p
      LEFT JOIN crm_contract c ON p.contract_id = c.id
      WHERE DATE_FORMAT(p.pay_date, "%Y-%m") = DATE_FORMAT(NOW(), "%Y-%m") ${isAdmin ? '' : ' AND c.create_by = ?'}
    `, isAdmin ? [] : [userId]);

    const [opportunityAmount] = await pool.query(`
      SELECT COALESCE(SUM(expected_amount), 0) as amount 
      FROM crm_opportunity 
      WHERE stage NOT IN (5, 6) ${isAdmin ? '' : ' AND owner_id = ?'}
    `, isAdmin ? [] : [userId]);

    // 线索统计
    const [monthLeads] = await pool.query(
      `SELECT COUNT(*) as count FROM crm_customer WHERE DATE_FORMAT(create_time, "%Y-%m") = DATE_FORMAT(NOW(), "%Y-%m") AND status = 1 ${customerFilter}`,
      params
    );
    const [monthConverted] = await pool.query(
      `SELECT COUNT(*) as count FROM crm_customer WHERE converted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) ${customerFilter.replace('owner_id', 'owner_id')}`,
      isAdmin ? [] : [userId]
    );

    res.json({
      code: 200,
      message: '查询成功',
      data: {
        month_sales: monthSales[0].amount?.toString() || '0.00',
        month_customers: monthCustomers[0].count,
        month_leads: monthLeads[0].count,
        month_converted: monthConverted[0].count,
        month_contracts: monthContracts[0].count,
        month_payments: monthPayments[0].amount?.toString() || '0.00',
        opportunity_amount: opportunityAmount[0].amount?.toString() || '0.00'
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 今日待办
router.get('/today-tasks', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const roleId = req.user.roleId;
    const isAdmin = roleId === 1 || roleId === 2;

    let followFilter = isAdmin ? '1=1' : 'f.create_by = ?';
    let serviceFilter = isAdmin ? '1=1' : 'so.assignee_id = ?';

    const followParams = isAdmin ? [] : [userId];
    const serviceParams = isAdmin ? [] : [userId];

    const [followList] = await pool.query(`
      SELECT f.id, f.customer_id, f.follow_type, f.content, f.next_time,
             cu.company_name
      FROM crm_follow_up f
      LEFT JOIN crm_customer cu ON f.customer_id = cu.id AND cu.status != 0
      WHERE ${followFilter}
        AND f.next_time IS NOT NULL
        AND DATE(f.next_time) = CURDATE()
      ORDER BY f.next_time ASC
      LIMIT 10
    `, followParams);

    const [serviceList] = await pool.query(`
      SELECT so.id, so.order_no, so.title, so.type, so.priority, so.status,
             cu.company_name as customer_name
      FROM crm_service_order so
      LEFT JOIN crm_customer cu ON so.customer_id = cu.id
      WHERE ${serviceFilter}
        AND so.status IN (1, 2, 3)
      ORDER BY 
        CASE so.priority 
          WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 3 WHEN 4 THEN 4 
        END ASC,
        so.create_time ASC
      LIMIT 10
    `, serviceParams);

    res.json({
      code: 200,
      message: '查询成功',
      data: {
        follow_list: followList,
        follow_count: followList.length,
        service_list: serviceList,
        service_count: serviceList.length
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 快捷操作统计
router.get('/quick-stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const roleId = req.user.roleId;
    const isAdmin = roleId === 1 || roleId === 2;

    const [customerPool] = await pool.query(`
      SELECT COUNT(*) as count FROM crm_customer WHERE pool_status = 1 AND status != 0 ${isAdmin ? '' : ' AND owner_id = ?'}
    `, isAdmin ? [] : [userId]);

    const [pendingContract] = await pool.query(`
      SELECT COUNT(*) as count FROM crm_contract WHERE status = 1 ${isAdmin ? '' : ' AND create_by = ?'}
    `, isAdmin ? [] : [userId]);

    const [pendingPayment] = await pool.query(`
      SELECT COUNT(*) as count 
      FROM crm_payment_plan pp
      LEFT JOIN crm_contract c ON pp.contract_id = c.id
      WHERE pp.plan_date <= CURDATE() 
        AND pp.id NOT IN (
          SELECT COALESCE(plan_id, 0) FROM crm_payment WHERE plan_id IS NOT NULL
        )
        ${isAdmin ? '' : ' AND c.create_by = ?'}
    `, isAdmin ? [] : [userId]);

    res.json({
      code: 200,
      message: '查询成功',
      data: {
        customer_pool: customerPool[0].count,
        pending_contract: pendingContract[0].count,
        pending_payment: pendingPayment[0].count
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 8. 逾期跟进客户列表
router.post('/overdue', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const roleId = req.user.roleId;
    const isAdmin = roleId === 1 || roleId === 2;
    const isManager = roleId === 3;
    const { page = 1, pageSize = 20 } = req.body;
    const offset = (page - 1) * pageSize;
    const overdueDays = 15;

    let whereClause = `WHERE c.pool_status = 0 AND c.status != 0 AND c.owner_id IS NOT NULL
      AND ((c.last_follow_time IS NULL AND c.create_time < DATE_SUB(NOW(), INTERVAL ${overdueDays} DAY))
        OR c.last_follow_time < DATE_SUB(NOW(), INTERVAL ${overdueDays} DAY))`;

    if (!isAdmin) {
      if (isManager) {
        // 部门经理看部门
        whereClause += ' AND c.owner_id IN (SELECT id FROM sys_user WHERE dept_id = (SELECT dept_id FROM sys_user WHERE id = ?))';
      } else {
        // 普通销售看自己
        whereClause += ' AND c.owner_id = ?';
      }
    }

    const params = isAdmin ? [] : [userId];

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_customer c ${whereClause}`, params
    );
    const total = countResult[0].total || 0;

    const [list] = await pool.query(
      `SELECT c.id, c.company_name, c.contact_name, c.phone, c.industry,
        c.owner_id, c.last_follow_time, c.create_time,
        u.real_name as owner_name,
        DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) as overdue_days
      FROM crm_customer c
      LEFT JOIN sys_user u ON c.owner_id = u.id
      ${whereClause}
      ORDER BY overdue_days DESC
      LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200, message: '查询成功',
      data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 9. 逾期统计（仪表盘用）
router.get('/overdue-stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const roleId = req.user.roleId;
    const isAdmin = roleId === 1 || roleId === 2;
    const overdueDays = 15;

    let whereClause = `c.pool_status = 0 AND c.status != 0 AND c.owner_id IS NOT NULL
      AND ((c.last_follow_time IS NULL AND c.create_time < DATE_SUB(NOW(), INTERVAL ${overdueDays} DAY))
        OR c.last_follow_time < DATE_SUB(NOW(), INTERVAL ${overdueDays} DAY))`;

    if (roleId === 3) {
      whereClause += ' AND c.owner_id IN (SELECT id FROM sys_user WHERE dept_id = (SELECT dept_id FROM sys_user WHERE id = ?))';
    } else if (roleId >= 4) {
      whereClause += ' AND c.owner_id = ?';
    }

    const params = isAdmin ? [] : [userId];

    const [result] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_customer c WHERE ${whereClause}`, params
    );

    res.json({
      code: 200, message: '查询成功',
      data: { overdue_count: result[0].total || 0, overdue_days: overdueDays }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

module.exports = router;
