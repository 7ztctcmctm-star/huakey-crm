const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { cache } = require('../../middleware/cache');
const ROLES = require('../../config/roles');
const { getOverdueDays } = require('../../utils/config');

// 概览数据（首页仪表盘）
router.get('/overview', authenticateToken, checkPermission('report'), cache(300), async (req, res) => {
  try {
    const userId = req.user.userId;
    const roleId = req.user.roleId;

    const isAdmin = roleId === ROLES.ADMIN || roleId === ROLES.MANAGER;

    let customerFilter = '';
    let contractFilter = '';

    if (!isAdmin) {
      customerFilter = ' AND owner_id = ?';
      contractFilter = ' AND create_by = ?';
    }

    const params = isAdmin ? [] : [userId];

    const [
      [monthSales],
      [monthCustomers],
      [monthContracts],
      [monthPayments],
      [opportunityAmount],
      [monthLeads],
      [monthConverted]
    ] = await Promise.all([
      pool.query(`
        SELECT COALESCE(SUM(amount), 0) as amount
        FROM crm_contract
        WHERE sign_date >= DATE_FORMAT(NOW(), '%Y-%m-01') AND sign_date < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH ${contractFilter}
      `, params),
      pool.query(`
        SELECT COUNT(*) as count
        FROM crm_customer
        WHERE create_time >= DATE_FORMAT(NOW(), '%Y-%m-01') AND create_time < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH ${customerFilter}
      `, params),
      pool.query(`
        SELECT COUNT(*) as count
        FROM crm_contract
        WHERE create_time >= DATE_FORMAT(NOW(), '%Y-%m-01') AND create_time < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH ${contractFilter}
      `, params),
      pool.query(`
        SELECT COALESCE(SUM(p.pay_amount), 0) as amount
        FROM crm_payment p
        LEFT JOIN crm_contract c ON p.contract_id = c.id
        WHERE p.pay_date >= DATE_FORMAT(NOW(), '%Y-%m-01') AND p.pay_date < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH ${isAdmin ? '' : ' AND c.create_by = ?'}
      `, isAdmin ? [] : [userId]),
      pool.query(`
        SELECT COALESCE(SUM(expected_amount), 0) as amount
        FROM crm_opportunity
        WHERE stage NOT IN (5, 6) ${isAdmin ? '' : ' AND owner_id = ?'}
      `, isAdmin ? [] : [userId]),
      pool.query(
        `SELECT COUNT(*) as count FROM crm_customer WHERE create_time >= DATE_FORMAT(NOW(), '%Y-%m-01') AND create_time < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH AND status = 1 ${customerFilter}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*) as count FROM crm_customer WHERE converted_at >= NOW() - INTERVAL 30 DAY ${customerFilter.replace('owner_id', 'owner_id')}`,
        isAdmin ? [] : [userId]
      )
    ]);

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
router.get('/today-tasks', authenticateToken, checkPermission('report'), cache(30), async (req, res) => {
  try {
    const userId = req.user.userId;
    const roleId = req.user.roleId;
    const isAdmin = roleId === ROLES.ADMIN || roleId === ROLES.MANAGER;

    let followFilter = isAdmin ? '1=1' : 'f.create_by = ?';
    let serviceFilter = isAdmin ? '1=1' : 'so.assignee_id = ?';

    const followParams = isAdmin ? [] : [userId];
    const serviceParams = isAdmin ? [] : [userId];

    const [followList] = await pool.query(`
      SELECT f.id, f.customer_id, f.follow_type, f.content, f.next_time,
             cu.company_name
      FROM crm_follow_up f
      LEFT JOIN crm_customer cu ON f.customer_id = cu.id AND cu.deleted_at IS NULL
      WHERE ${followFilter}
        AND f.next_time IS NOT NULL
        AND DATE(f.next_time) = CURRENT_DATE
      ORDER BY f.next_time ASC
      LIMIT 50
    `, followParams);

    const [followTotal] = await pool.query(`
      SELECT COUNT(*) as total
      FROM crm_follow_up f
      WHERE ${followFilter}
        AND f.next_time IS NOT NULL
        AND DATE(f.next_time) = CURRENT_DATE
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
      LIMIT 50
    `, serviceParams);

    const [serviceTotal] = await pool.query(`
      SELECT COUNT(*) as total
      FROM crm_service_order so
      WHERE ${serviceFilter}
        AND so.status IN (1, 2, 3)
    `, serviceParams);

    res.json({
      code: 200,
      message: '查询成功',
      data: {
        follow_list: followList,
        follow_count: followTotal[0].total,
        service_list: serviceList,
        service_count: serviceTotal[0].total
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 快捷操作统计
router.get('/quick-stats', authenticateToken, checkPermission('report'), cache(120), async (req, res) => {
  try {
    const userId = req.user.userId;
    const roleId = req.user.roleId;
    const isAdmin = roleId === ROLES.ADMIN || roleId === ROLES.MANAGER;

    const [customerPool] = await pool.query(`
      SELECT COUNT(*) as count FROM crm_customer WHERE pool_status = 1 AND deleted_at IS NULL ${isAdmin ? '' : ' AND owner_id = ?'}
    `, isAdmin ? [] : [userId]);

    const [pendingContract] = await pool.query(`
      SELECT COUNT(*) as count FROM crm_contract WHERE status = 1 ${isAdmin ? '' : ' AND create_by = ?'}
    `, isAdmin ? [] : [userId]);

    const [pendingPayment] = await pool.query(`
      SELECT COUNT(*) as count
      FROM crm_payment_plan pp
      LEFT JOIN crm_contract c ON pp.contract_id = c.id
      WHERE pp.plan_date <= CURRENT_DATE
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

// 逾期统计（仪表盘用）
router.get('/overdue-stats', authenticateToken, checkPermission('report'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const roleId = req.user.roleId;
    const isAdmin = roleId === ROLES.ADMIN || roleId === ROLES.MANAGER;
    const overdueDays = await getOverdueDays();

    let whereClause = `c.pool_status = 0 AND c.deleted_at IS NULL AND c.owner_id IS NOT NULL
      AND ((c.last_follow_time IS NULL AND c.create_time < NOW() - INTERVAL ${overdueDays} DAY)
        OR c.last_follow_time < NOW() - INTERVAL ${overdueDays} DAY)`;

    if (roleId === ROLES.MANAGER) {
      whereClause += ' AND c.owner_id IN (SELECT id FROM sys_user WHERE dept_id = (SELECT dept_id FROM sys_user WHERE id = ?))';
    } else if (roleId >= 3) {
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
