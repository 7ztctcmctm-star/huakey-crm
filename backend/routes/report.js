const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const ROLES = require('../config/roles');
const { getOverdueDays } = require('../utils/config');
const { createRouteLogger } = require('../middleware/logger');
const logAction = createRouteLogger('报表管理');

// 销售漏斗统计
router.get('/sales-funnel', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateFilter = '';
    const params = [];

    if (startDate && endDate) {
      dateFilter = 'WHERE so.create_time BETWEEN ? AND ?';
      params.push(startDate, endDate + ' 23:59:59');
    }

    const [rows] = await pool.query(`
      SELECT
        so.stage,
        COUNT(so.id) as count,
        COALESCE(SUM(so.expected_amount), 0) as amount
      FROM crm_opportunity so
      ${dateFilter}
      GROUP BY so.stage
      ORDER BY so.stage ASC
    `, params);

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
  try {
  const { startDate, endDate } = req.query;

  let dateFilter = '';
  const params = [];
  
  if (startDate && endDate) {
    dateFilter = 'AND c.sign_date BETWEEN ? AND ?';
    params.push(startDate, endDate);
  } else {
    // [性能修复] 使用范围比较替代DATE_FORMAT，使索引生效
    dateFilter = `AND c.sign_date >= DATE_FORMAT(NOW(), '%Y-%m-01') AND c.sign_date < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH`;
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
  } catch (error) {
    console.error('[报表] 业绩统计错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 客户统计
router.get('/customer', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateFilter = '';
    const params = [];

    if (startDate && endDate) {
      dateFilter = 'AND c.create_time BETWEEN ? AND ?';
      params.push(startDate, endDate + ' 23:59:59');
    }

    // 本期新增客户数
    const [monthCount] = await pool.query(`
      SELECT COUNT(*) as count FROM crm_customer c
      WHERE 1=1 ${dateFilter || `AND create_time >= DATE_FORMAT(NOW(), '%Y-%m-01') AND create_time < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH`}
    `, params);

    // 客户来源分布
    const sourceParams = [...params];
    const [sourceDist] = await pool.query(`
      SELECT
        CASE
          WHEN source IN ('Facebook','Instagram','LinkedIn','独立站','其他网络渠道') THEN '网络'
          ELSE source
        END as source,
        COUNT(*) as count
      FROM crm_customer c
      WHERE status != 0 ${dateFilter}
      GROUP BY CASE
        WHEN source IN ('Facebook','Instagram','LinkedIn','独立站','其他网络渠道') THEN '网络'
        ELSE source
      END
      ORDER BY count DESC
    `, sourceParams);

    const [sourceDetailDist] = await pool.query(`
      SELECT source, COUNT(*) as count
      FROM crm_customer c
      WHERE status != 0 ${dateFilter}
      GROUP BY source
      ORDER BY count DESC
    `, [...params]);

    // 客户等级分布
    const [levelDist] = await pool.query(`
      SELECT level, COUNT(*) as count
      FROM crm_customer c
      WHERE 1=1 ${dateFilter}
      GROUP BY level
      ORDER BY CASE level WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5 END
    `, [...params]);

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
    const { startDate, endDate } = req.query;

    let planDateFilter, payDateFilter;
    const planParams = [], payParams = [];

    if (startDate && endDate) {
      planDateFilter = 'pp.plan_date BETWEEN ? AND ?';
      payDateFilter = 'p.pay_date BETWEEN ? AND ?';
      planParams.push(startDate, endDate);
      payParams.push(startDate, endDate);
    } else {
      // [性能修复] 范围比较替代DATE_FORMAT
      planDateFilter = `pp.plan_date >= DATE_FORMAT(NOW(), '%Y-%m-01') AND pp.plan_date < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH`;
      payDateFilter = `p.pay_date >= DATE_FORMAT(NOW(), '%Y-%m-01') AND p.pay_date < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH`;
    }

    // 计划回款
    const [planAmount] = await pool.query(`
      SELECT COALESCE(SUM(plan_amount), 0) as amount
      FROM crm_payment_plan pp
      WHERE ${planDateFilter}
    `, planParams);

    // 实际回款
    const [payAmount] = await pool.query(`
      SELECT COALESCE(SUM(pay_amount), 0) as amount
      FROM crm_payment p
      WHERE ${payDateFilter}
    `, payParams);

    // 逾期账款
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
      WHERE pp.plan_date < CURRENT_DATE
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

// 销售趋势
router.get('/sales-trend', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateFilter;
    const params = [];

    if (startDate && endDate) {
      dateFilter = 'c.sign_date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    } else {
      dateFilter = `c.sign_date >= NOW() - INTERVAL 12 MONTH`;
    }

    const [rows] = await pool.query(`
      SELECT
        DATE_FORMAT(c.sign_date, '%Y-%m') as month,
        COUNT(c.id) as contract_count,
        COALESCE(SUM(c.amount), 0) as amount
      FROM crm_contract c
      WHERE ${dateFilter}
      GROUP BY DATE_FORMAT(c.sign_date, '%Y-%m')
      ORDER BY month
    `, params);

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

    const isAdmin = roleId === ROLES.ADMIN || roleId === ROLES.MANAGER;

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

    // [性能优化] 并行执行所有独立查询
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
router.get('/today-tasks', authenticateToken, async (req, res) => {
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
      LEFT JOIN crm_customer cu ON f.customer_id = cu.id AND cu.status != 0
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
router.get('/quick-stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const roleId = req.user.roleId;
    const isAdmin = roleId === ROLES.ADMIN || roleId === ROLES.MANAGER;

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

// 8. 逾期跟进客户列表
router.post('/overdue', authenticateToken, checkPermission('report'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const roleId = req.user.roleId;
    const isAdmin = roleId === ROLES.ADMIN || roleId === ROLES.MANAGER;
    const isDeptManager = roleId === ROLES.MANAGER; // roleId 2=部门经理
    const { page = 1, pageSize = 20 } = req.body;
    const safePageSize = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
    const offset = (Math.max(1, parseInt(page) || 1) - 1) * safePageSize;
    const overdueDays = await getOverdueDays();

    let whereClause = `WHERE c.pool_status = 0 AND c.status != 0 AND c.owner_id IS NOT NULL
      AND ((c.last_follow_time IS NULL AND c.create_time < NOW() - INTERVAL ${overdueDays} DAY)
        OR c.last_follow_time < NOW() - INTERVAL ${overdueDays} DAY)`;

    if (!isAdmin) {
      if (isDeptManager) {
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
      [...params, safePageSize, parseInt(offset)]
    );

    res.json({
      code: 200, message: '查询成功',
      data: { list, total, page: parseInt(page), pageSize: safePageSize }
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
    const isAdmin = roleId === ROLES.ADMIN || roleId === ROLES.MANAGER;
    const overdueDays = await getOverdueDays();

    let whereClause = `c.pool_status = 0 AND c.status != 0 AND c.owner_id IS NOT NULL
      AND ((c.last_follow_time IS NULL AND c.create_time < NOW() - INTERVAL ${overdueDays} DAY)
        OR c.last_follow_time < NOW() - INTERVAL ${overdueDays} DAY)`;

    if (roleId === ROLES.MANAGER) {
      // 部门经理看本部门数据
      whereClause += ' AND c.owner_id IN (SELECT id FROM sys_user WHERE dept_id = (SELECT dept_id FROM sys_user WHERE id = ?))';
    } else if (roleId >= 3) {
      // 销售及其他角色只能看自己的
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

// 采购趋势（近12个月）
router.get('/purchase-trend', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateFilter;
    const params = [];

    if (startDate && endDate) {
      dateFilter = 'po.create_time BETWEEN ? AND ?';
      params.push(startDate, endDate + ' 23:59:59');
    } else {
      dateFilter = `po.create_time >= NOW() - INTERVAL 12 MONTH`;
    }

    const [rows] = await pool.query(`
      SELECT
        DATE_FORMAT(po.create_time, '%Y-%m') as month,
        COUNT(po.id) as order_count,
        COALESCE(SUM(po.total_with_tax), 0) as amount
      FROM crm_purchase_order po
      WHERE po.status != '已取消' AND po.deleted_at IS NULL AND ${dateFilter}
      GROUP BY DATE_FORMAT(po.create_time, '%Y-%m')
      ORDER BY month
    `, params);

    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 采购按供应商分布
router.get('/purchase-by-supplier', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateFilter = '';
    const params = [];

    if (startDate && endDate) {
      dateFilter = 'AND po.create_time BETWEEN ? AND ?';
      params.push(startDate, endDate + ' 23:59:59');
    }

    const [rows] = await pool.query(`
      SELECT s.name as supplier_name, COUNT(po.id) as order_count,
             COALESCE(SUM(po.total_with_tax), 0) as total_amount
      FROM crm_purchase_order po
      JOIN crm_supplier s ON po.supplier_id = s.id
      WHERE po.status != '已取消' AND po.deleted_at IS NULL ${dateFilter}
      GROUP BY s.name
      ORDER BY total_amount DESC
      LIMIT 10
    `, params);

    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

const XLSX = require('xlsx');

// 导出报表
router.post('/export', authenticateToken, checkPermission('report'), async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const dateFilter = startDate && endDate;
    const wb = XLSX.utils.book_new();

    // 业绩排行
    let perfDateFilter = '';
    const perfParams = [];
    if (dateFilter) {
      perfDateFilter = 'AND c.sign_date BETWEEN ? AND ?';
      perfParams.push(startDate, endDate);
    } else {
      perfDateFilter = `AND c.sign_date >= DATE_FORMAT(NOW(), '%Y-%m-01') AND c.sign_date < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH`;
    }
    const [perfRows] = await pool.query(`
      SELECT u.real_name as '销售姓名',
        COALESCE(SUM(c.amount), 0) as '成交金额',
        COALESCE(SUM(p.pay_amount), 0) as '回款金额'
      FROM sys_user u
      LEFT JOIN crm_contract c ON u.id = c.create_by ${perfDateFilter}
      LEFT JOIN crm_payment p ON c.id = p.contract_id
      WHERE u.status = 1
      GROUP BY u.id, u.real_name
      ORDER BY '成交金额' DESC
    `, perfParams);
    const perfSheet = XLSX.utils.json_to_sheet(perfRows.length > 0 ? perfRows : [{ '销售姓名': '暂无数据' }]);
    XLSX.utils.book_append_sheet(wb, perfSheet, '业绩排行');

    // 销售漏斗
    let funnelDateFilter = '';
    const funnelParams = [];
    if (dateFilter) {
      funnelDateFilter = 'WHERE so.create_time BETWEEN ? AND ?';
      funnelParams.push(startDate, endDate + ' 23:59:59');
    }
    const [funnelRows] = await pool.query(`
      SELECT so.stage as '阶段编码', COUNT(so.id) as '商机数量', COALESCE(SUM(so.expected_amount), 0) as '预期金额'
      FROM crm_opportunity so ${funnelDateFilter}
      GROUP BY so.stage ORDER BY so.stage
    `, funnelParams);
    const stageNames = { 1: '询盘', 2: '需求确认', 3: '方案报价', 4: '谈判', 5: '成交', 6: '失败' };
    const funnelData = funnelRows.map(r => ({ '阶段': stageNames[r['阶段编码']] || r['阶段编码'], '商机数量': r['商机数量'], '预期金额': r['预期金额'] }));
    const funnelSheet = XLSX.utils.json_to_sheet(funnelData.length > 0 ? funnelData : [{ '阶段': '暂无数据' }]);
    XLSX.utils.book_append_sheet(wb, funnelSheet, '销售漏斗');

    // 客户来源
    let custDateFilter = '';
    const custParams = [];
    if (dateFilter) {
      custDateFilter = 'AND c.create_time BETWEEN ? AND ?';
      custParams.push(startDate, endDate + ' 23:59:59');
    }
    const [sourceRows] = await pool.query(`
      SELECT source as '客户来源', COUNT(*) as '客户数量'
      FROM crm_customer c WHERE status != 0 ${custDateFilter}
      GROUP BY source ORDER BY '客户数量' DESC
    `, custParams);
    const sourceSheet = XLSX.utils.json_to_sheet(sourceRows.length > 0 ? sourceRows : [{ '客户来源': '暂无数据' }]);
    XLSX.utils.book_append_sheet(wb, sourceSheet, '客户来源');

    // 采购分析
    let purchaseDateFilter = '';
    const purchaseParams = [];
    if (dateFilter) {
      purchaseDateFilter = 'AND po.create_time BETWEEN ? AND ?';
      purchaseParams.push(startDate, endDate + ' 23:59:59');
    }
    const [purchaseRows] = await pool.query(`
      SELECT s.name as '供应商', COUNT(po.id) as '采购单数', COALESCE(SUM(po.total_with_tax), 0) as '采购总额'
      FROM crm_purchase_order po
      JOIN crm_supplier s ON po.supplier_id = s.id
      WHERE po.status != '已取消' AND po.deleted_at IS NULL ${purchaseDateFilter}
      GROUP BY s.name ORDER BY '采购总额' DESC
    `, purchaseParams);
    const purchaseSheet = XLSX.utils.json_to_sheet(purchaseRows.length > 0 ? purchaseRows : [{ '供应商': '暂无数据' }]);
    XLSX.utils.book_append_sheet(wb, purchaseSheet, '采购分析');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=report.xlsx');
    res.send(buf);
    // 审计日志：记录报表导出操作
    await logAction(req, 'export', `导出报表${dateFilter ? `(${startDate} ~ ${endDate})` : '(本月)'}`);
  } catch (error) {
    console.error('导出报表错误:', error);
    res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

// ============ 财务报表 ============

router.get('/finance', authenticateToken, checkPermission('report'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const now = new Date();
    const monthStart = start_date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthEnd = end_date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;

    // 本月/本季/本年时间范围
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const quarterStart = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}-01`;
    const yearStart = `${year}-01-01`;

    // 收入概览
    const [[monthContract]] = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM crm_contract WHERE deleted_at IS NULL AND sign_date BETWEEN ? AND ?",
      [monthStart, monthEnd]
    );
    const [[quarterContract]] = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM crm_contract WHERE deleted_at IS NULL AND sign_date BETWEEN ? AND ?",
      [quarterStart, monthEnd]
    );
    const [[yearContract]] = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM crm_contract WHERE deleted_at IS NULL AND sign_date BETWEEN ? AND ?",
      [yearStart, monthEnd]
    );

    // 回款金额
    const [[monthPayment]] = await pool.query(
      "SELECT COALESCE(SUM(pay_amount), 0) as total FROM crm_payment WHERE deleted_at IS NULL AND pay_date BETWEEN ? AND ?",
      [monthStart, monthEnd]
    );
    const [[quarterPayment]] = await pool.query(
      "SELECT COALESCE(SUM(pay_amount), 0) as total FROM crm_payment WHERE deleted_at IS NULL AND pay_date BETWEEN ? AND ?",
      [quarterStart, monthEnd]
    );
    const [[yearPayment]] = await pool.query(
      "SELECT COALESCE(SUM(pay_amount), 0) as total FROM crm_payment WHERE deleted_at IS NULL AND pay_date BETWEEN ? AND ?",
      [yearStart, monthEnd]
    );

    // 采购成本
    const [[monthPurchase]] = await pool.query(
      "SELECT COALESCE(SUM(total_amount), 0) as total FROM crm_purchase_order WHERE deleted_at IS NULL AND create_time BETWEEN ? AND ?",
      [monthStart, monthEnd + ' 23:59:59']
    );
    const [[quarterPurchase]] = await pool.query(
      "SELECT COALESCE(SUM(total_amount), 0) as total FROM crm_purchase_order WHERE deleted_at IS NULL AND create_time BETWEEN ? AND ?",
      [quarterStart, monthEnd + ' 23:59:59']
    );
    const [[yearPurchase]] = await pool.query(
      "SELECT COALESCE(SUM(total_amount), 0) as total FROM crm_purchase_order WHERE deleted_at IS NULL AND create_time BETWEEN ? AND ?",
      [yearStart, monthEnd + ' 23:59:59']
    );

    // 应收账款
    const [receivables] = await pool.query(`
      SELECT c.id, c.contract_no, cu.company_name as customer_name, c.amount as total_amount,
             COALESCE(SUM(p.pay_amount), 0) as paid_amount,
             (c.amount - COALESCE(SUM(p.pay_amount), 0)) as unpaid_amount,
             DATEDIFF(NOW(), COALESCE(c.delivery_date, c.sign_date)) as overdue_days
      FROM crm_contract c
      LEFT JOIN crm_customer cu ON c.customer_id = cu.id
      LEFT JOIN crm_payment p ON c.id = p.contract_id AND p.deleted_at IS NULL
      WHERE c.deleted_at IS NULL AND c.status IN (1, 2)
      GROUP BY c.id
      HAVING unpaid_amount > 0
      ORDER BY overdue_days DESC
      LIMIT 50
    `);

    // 收入趋势（最近12个月）
    const [trend] = await pool.query(`
      SELECT DATE_FORMAT(sign_date, '%Y-%m') as month,
             COALESCE(SUM(amount), 0) as contract_amount
      FROM crm_contract
      WHERE deleted_at IS NULL AND sign_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY month ORDER BY month
    `);

    const [paymentTrend] = await pool.query(`
      SELECT DATE_FORMAT(pay_date, '%Y-%m') as month,
             COALESCE(SUM(pay_amount), 0) as payment_amount
      FROM crm_payment
      WHERE deleted_at IS NULL AND pay_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY month ORDER BY month
    `);

    // 合并趋势数据
    const trendMap = {};
    trend.forEach(t => { trendMap[t.month] = { month: t.month, contract_amount: parseFloat(t.contract_amount), payment_amount: 0 }; });
    paymentTrend.forEach(t => {
      if (trendMap[t.month]) trendMap[t.month].payment_amount = parseFloat(t.payment_amount);
      else trendMap[t.month] = { month: t.month, contract_amount: 0, payment_amount: parseFloat(t.payment_amount) };
    });
    const trendData = Object.values(trendMap).sort((a, b) => a.month.localeCompare(b.month));

    res.json({
      code: 200, message: '查询成功',
      data: {
        overview: {
          month: { contract: parseFloat(monthContract.total), payment: parseFloat(monthPayment.total), purchase: parseFloat(monthPurchase.total), profit: parseFloat(monthContract.total) - parseFloat(monthPurchase.total) },
          quarter: { contract: parseFloat(quarterContract.total), payment: parseFloat(quarterPayment.total), purchase: parseFloat(quarterPurchase.total), profit: parseFloat(quarterContract.total) - parseFloat(quarterPurchase.total) },
          year: { contract: parseFloat(yearContract.total), payment: parseFloat(yearPayment.total), purchase: parseFloat(yearPurchase.total), profit: parseFloat(yearContract.total) - parseFloat(yearPurchase.total) },
          payment_rate: yearContract.total > 0 ? Math.round(yearPayment.total / yearContract.total * 100) : 0
        },
        receivables,
        trend: trendData
      }
    });
  } catch (error) {
    console.error('[报表] 财务报表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 财务报表导出CSV
router.get('/finance/export', authenticateToken, checkPermission('report'), async (req, res) => {
  try {
    const { type = 'receivable', start_date, end_date } = req.query;
    const now = new Date();
    const monthStart = start_date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthEnd = end_date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;

    let rows, headers, filename;

    if (type === 'receivable') {
      [rows] = await pool.query(`
        SELECT c.contract_no as '合同编号', cu.company_name as '客户名称', c.amount as '合同金额',
               COALESCE(SUM(p.pay_amount), 0) as '已回款', (c.amount - COALESCE(SUM(p.pay_amount), 0)) as '未回款',
               DATEDIFF(NOW(), COALESCE(c.delivery_date, c.sign_date)) as '逾期天数'
        FROM crm_contract c
        LEFT JOIN crm_customer cu ON c.customer_id = cu.id
        LEFT JOIN crm_payment p ON c.id = p.contract_id AND p.deleted_at IS NULL
        WHERE c.deleted_at IS NULL AND c.status IN (1, 2)
        GROUP BY c.id HAVING ` + '`未回款`' + ` > 0 ORDER BY ` + '`逾期天数`' + ` DESC
      `);
      filename = '应收账款.csv';
    } else if (type === 'income') {
      [rows] = await pool.query(`
        SELECT c.contract_no as '合同编号', cu.company_name as '客户名称', c.amount as '合同金额',
               c.sign_date as '签订日期', c.status as '状态'
        FROM crm_contract c LEFT JOIN crm_customer cu ON c.customer_id = cu.id
        WHERE c.deleted_at IS NULL AND c.sign_date BETWEEN ? AND ?
        ORDER BY c.sign_date DESC
      `, [monthStart, monthEnd]);
      filename = '收入报表.csv';
    } else {
      [rows] = await pool.query(`
        SELECT p.order_no as '采购单号', s.name as '供应商', p.total_amount as '采购金额',
               p.create_time as '采购日期', p.status as '状态'
        FROM crm_purchase_order p LEFT JOIN crm_supplier s ON p.supplier_id = s.id
        WHERE p.deleted_at IS NULL AND p.create_time BETWEEN ? AND ?
        ORDER BY p.create_time DESC
      `, [monthStart, monthEnd + ' 23:59:59']);
      filename = '成本报表.csv';
    }

    // 生成CSV
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '无数据可导出', data: null });
    }
    headers = Object.keys(rows[0]);
    const csv = [headers.join(',')].concat(rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(filename)}`);
    res.send('﻿' + csv);
  } catch (error) {
    console.error('[报表] 财务导出失败:', error);
    res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

// ============ 经营分析看板 ============

router.get('/business', authenticateToken, checkPermission('report'), async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const thisMonthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastMonthEnd = new Date(year, month - 1, 0);
    const lastMonthStart = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, '0')}-01`;
    const lastMonthEndStr = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, '0')}-31`;
    const lastYearStart = `${year - 1}-${String(month).padStart(2, '0')}-01`;
    const lastYearEnd = `${year - 1}-${String(month).padStart(2, '0')}-31`;

    // [性能优化] 核心KPI + 上月数据 并行查询
    const [
      [[customerTotal]],
      [[customerNew]],
      [[contractTotal]],
      [[paymentTotal]],
      [[contractCount]],
      [[oppTotal]],
      [[oppWon]],
      [[lastCustomerNew]],
      [[lastContractTotal]],
      [[lastPaymentTotal]]
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) as cnt FROM crm_customer WHERE deleted_at IS NULL"),
      pool.query("SELECT COUNT(*) as cnt FROM crm_customer WHERE deleted_at IS NULL AND create_time >= ?", [thisMonthStart]),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM crm_contract WHERE deleted_at IS NULL AND sign_date >= ?", [thisMonthStart]),
      pool.query("SELECT COALESCE(SUM(pay_amount), 0) as total FROM crm_payment WHERE deleted_at IS NULL AND pay_date >= ?", [thisMonthStart]),
      pool.query("SELECT COUNT(*) as cnt FROM crm_contract WHERE deleted_at IS NULL AND sign_date >= ?", [thisMonthStart]),
      pool.query("SELECT COUNT(*) as cnt FROM crm_opportunity WHERE deleted_at IS NULL"),
      pool.query("SELECT COUNT(*) as cnt FROM crm_opportunity WHERE deleted_at IS NULL AND stage = 5"),
      pool.query("SELECT COUNT(*) as cnt FROM crm_customer WHERE deleted_at IS NULL AND create_time BETWEEN ? AND ?", [lastMonthStart, lastMonthEndStr]),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM crm_contract WHERE deleted_at IS NULL AND sign_date BETWEEN ? AND ?", [lastMonthStart, lastMonthEndStr]),
      pool.query("SELECT COALESCE(SUM(pay_amount), 0) as total FROM crm_payment WHERE deleted_at IS NULL AND pay_date BETWEEN ? AND ?", [lastMonthStart, lastMonthEndStr])
    ]);

    const calcChange = (curr, prev) => prev > 0 ? Math.round((curr - prev) / prev * 100) : (curr > 0 ? 100 : 0);
    const avgUnitPrice = contractCount.cnt > 0 ? Math.round(contractTotal.total / contractCount.cnt) : 0;
    const conversionRate = oppTotal.cnt > 0 ? Math.round(oppWon.cnt / oppTotal.cnt * 100) : 0;

    // [性能优化] 团队排名、分布、趋势、预警 并行查询
    const overdueDays = await getOverdueDays();
    const [
      [teamRanking],
      [sellerDetails],
      [levelDist],
      [industryDist],
      [customerTrend],
      [contractTrend],
      [paymentTrend],
      [overduePayments],
      [overdueCustomers]
    ] = await Promise.all([
      pool.query(`
        SELECT u.id, u.real_name,
               COUNT(DISTINCT c.id) as contract_count,
               COALESCE(SUM(c.amount), 0) as contract_amount,
               (SELECT COALESCE(SUM(p.pay_amount), 0) FROM crm_payment p
                JOIN crm_contract c2 ON p.contract_id = c2.id
                WHERE c2.create_by = u.id AND p.deleted_at IS NULL AND p.pay_date >= ?) as payment_amount,
               (SELECT COUNT(*) FROM crm_customer cu WHERE cu.owner_id = u.id AND cu.deleted_at IS NULL AND cu.create_time >= ?) as new_customers
        FROM sys_user u
        LEFT JOIN crm_contract c ON c.create_by = u.id AND c.deleted_at IS NULL AND c.sign_date >= ?
        WHERE u.status = 1 AND u.role_id IN (1, 2, 3)
        GROUP BY u.id ORDER BY contract_amount DESC LIMIT 10
      `, [thisMonthStart, thisMonthStart, thisMonthStart]),
      pool.query(`
        SELECT u.id, u.real_name,
          COALESCE(SUM(c.amount), 0) as contract_amount,
          (SELECT COALESCE(SUM(p.pay_amount),0) FROM crm_payment p
           JOIN crm_contract c2 ON p.contract_id = c2.id
           WHERE c2.create_by = u.id AND p.pay_date >= ? AND p.deleted_at IS NULL) as payment_amount,
          (SELECT COUNT(DISTINCT cu.id) FROM crm_customer cu WHERE cu.owner_id = u.id AND cu.deleted_at IS NULL) as customer_count,
          (SELECT COUNT(*) FROM crm_opportunity o WHERE o.owner_id = u.id AND o.deleted_at IS NULL) as opp_count,
          COALESCE((SELECT target_amount FROM crm_sales_target st WHERE st.user_id = u.id AND st.year = YEAR(CURDATE()) AND st.month = MONTH(CURDATE())), 0) as target_amount
        FROM sys_user u
        LEFT JOIN crm_contract c ON c.create_by = u.id AND c.sign_date >= ? AND c.deleted_at IS NULL
        WHERE u.status = 1 AND u.role_id IN (1, 2, 3)
        GROUP BY u.id ORDER BY contract_amount DESC LIMIT 20
      `, [thisMonthStart, thisMonthStart]),
      pool.query(`SELECT level as name, COUNT(*) as value FROM crm_customer WHERE deleted_at IS NULL GROUP BY level`),
      pool.query(`SELECT COALESCE(industry, '未填写') as name, COUNT(*) as value FROM crm_customer WHERE deleted_at IS NULL GROUP BY industry ORDER BY value DESC LIMIT 10`),
      pool.query(`
        SELECT DATE_FORMAT(create_time, '%Y-%m') as month, COUNT(*) as count
        FROM crm_customer WHERE deleted_at IS NULL AND create_time >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY month ORDER BY month
      `),
      pool.query(`
        SELECT DATE_FORMAT(sign_date, '%Y-%m') as month, COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
        FROM crm_contract WHERE deleted_at IS NULL AND sign_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY month ORDER BY month
      `),
      pool.query(`
        SELECT DATE_FORMAT(pay_date, '%Y-%m') as month, COALESCE(SUM(pay_amount), 0) as amount
        FROM crm_payment WHERE deleted_at IS NULL AND pay_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY month ORDER BY month
      `),
      pool.query(`
        SELECT c.contract_no, cu.company_name, c.amount,
               COALESCE(SUM(p.pay_amount), 0) as paid,
               (c.amount - COALESCE(SUM(p.pay_amount), 0)) as unpaid,
               DATEDIFF(NOW(), c.sign_date) as days
        FROM crm_contract c
        LEFT JOIN crm_customer cu ON c.customer_id = cu.id
        LEFT JOIN crm_payment p ON c.id = p.contract_id AND p.deleted_at IS NULL
        WHERE c.deleted_at IS NULL AND c.status IN (1, 2)
        GROUP BY c.id HAVING unpaid > 0 AND days > 30
        ORDER BY days DESC LIMIT 10
      `),
      pool.query(`
        SELECT id, company_name, last_follow_time, DATEDIFF(NOW(), last_follow_time) as days
        FROM crm_customer WHERE deleted_at IS NULL AND status = 1
        AND (last_follow_time IS NULL OR last_follow_time < NOW() - INTERVAL 30 DAY)
        ORDER BY days DESC LIMIT 10
      `)
    ]);

    res.json({
      code: 200, message: '查询成功',
      data: {
        kpi: {
          customer_total: customerTotal.cnt,
          customer_new: customerNew.cnt, customer_new_change: calcChange(customerNew.cnt, lastCustomerNew.cnt),
          contract_amount: parseFloat(contractTotal.total), contract_amount_change: calcChange(parseFloat(contractTotal.total), parseFloat(lastContractTotal.total)),
          payment_rate: contractTotal.total > 0 ? Math.round(paymentTotal.total / contractTotal.total * 100) : 0,
          avg_unit_price: avgUnitPrice,
          conversion_rate: conversionRate
        },
        teamRanking,
        sellerDetails,
        distribution: { level: levelDist, industry: industryDist },
        trends: { customer: customerTrend, contract: contractTrend, payment: paymentTrend },
        warnings: { overdue_payments: overduePayments, overdue_customers: overdueCustomers }
      }
    });
  } catch (error) {
    console.error('[报表] 经营分析查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 自定义报表 ============

// 数据源字段映射
const SOURCE_FIELDS = {
  customer: { table: 'crm_customer', alias: 't', fields: { id: 'ID', company_name: '客户名称', contact_name: '联系人', phone: '电话', source: '来源', level: '等级', status: '状态', industry: '行业', owner_id: '负责人', create_time: '创建时间' } },
  contract: { table: 'crm_contract', alias: 't', join: 'LEFT JOIN crm_customer cu ON t.customer_id = cu.id', fields: { id: 'ID', contract_no: '合同编号', 'cu.company_name': '客户名称', amount: '合同金额', sign_date: '签订日期', status: '状态', create_time: '创建时间' } },
  payment: { table: 'crm_payment', alias: 't', join: 'LEFT JOIN crm_contract ct ON t.contract_id = ct.id', fields: { id: 'ID', 'ct.contract_no': '合同编号', pay_amount: '回款金额', pay_date: '回款日期', pay_method: '回款方式', create_time: '创建时间' } },
  purchase: { table: 'crm_purchase_order', alias: 't', join: 'LEFT JOIN crm_supplier s ON t.supplier_id = s.id', fields: { id: 'ID', order_no: '采购单号', 's.name': '供应商', total_amount: '采购金额', create_time: '采购日期', status: '状态' } },
  opportunity: { table: 'crm_opportunity', alias: 't', join: 'LEFT JOIN crm_customer cu ON t.customer_id = cu.id', fields: { id: 'ID', name: '商机名称', 'cu.company_name': '客户名称', expected_amount: '预期金额', stage: '阶段', win_rate: '赢率', create_time: '创建时间' } }
};

// 获取自定义报表列表
router.get('/custom', authenticateToken, checkPermission('report'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM crm_report_config WHERE (create_by = ? OR is_public = 1) AND deleted_at IS NULL ORDER BY create_time DESC",
      [req.user.userId]
    );
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[报表] 自定义报表列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建自定义报表
router.post('/custom', authenticateToken, checkPermission('report'), async (req, res) => {
  try {
    const { name, description, report_type, data_source, columns_config, filter_config, chart_config, is_public } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ code: 400, message: '报表名称不能为空', data: null });
    if (!report_type) return res.status(400).json({ code: 400, message: '报表类型不能为空', data: null });
    if (!data_source) return res.status(400).json({ code: 400, message: '数据来源不能为空', data: null });
    if (!SOURCE_FIELDS[data_source]) return res.status(400).json({ code: 400, message: '无效的数据来源', data: null });

    const [result] = await pool.query(
      'INSERT INTO crm_report_config (name, description, report_type, data_source, columns_config, filter_config, chart_config, is_public, create_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name.trim(), description || null, report_type, data_source, columns_config || null, filter_config || null, chart_config || null, is_public || 0, req.user.userId]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[报表] 创建自定义报表失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新自定义报表
router.put('/custom/:id', authenticateToken, checkPermission('report'), async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query('SELECT create_by FROM crm_report_config WHERE id = ? AND deleted_at IS NULL', [id]);
    if (existing.length === 0) return res.status(404).json({ code: 404, message: '报表不存在', data: null });
    if (existing[0].create_by !== req.user.userId && !req.user.manageAll) {
      return res.status(403).json({ code: 403, message: '无权修改此报表', data: null });
    }

    const { name, description, report_type, data_source, columns_config, filter_config, chart_config, is_public } = req.body;
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (report_type !== undefined) { fields.push('report_type = ?'); values.push(report_type); }
    if (data_source !== undefined) { fields.push('data_source = ?'); values.push(data_source); }
    if (columns_config !== undefined) { fields.push('columns_config = ?'); values.push(columns_config); }
    if (filter_config !== undefined) { fields.push('filter_config = ?'); values.push(filter_config); }
    if (chart_config !== undefined) { fields.push('chart_config = ?'); values.push(chart_config); }
    if (is_public !== undefined) { fields.push('is_public = ?'); values.push(parseInt(is_public)); }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    values.push(id);
    await pool.query(`UPDATE crm_report_config SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[报表] 更新自定义报表失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除自定义报表
router.delete('/custom/:id', authenticateToken, checkPermission('report'), async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query('SELECT create_by FROM crm_report_config WHERE id = ? AND deleted_at IS NULL', [id]);
    if (existing.length === 0) return res.status(404).json({ code: 404, message: '报表不存在', data: null });
    if (existing[0].create_by !== req.user.userId && !req.user.manageAll) {
      return res.status(403).json({ code: 403, message: '无权删除此报表', data: null });
    }
    await pool.query('UPDATE crm_report_config SET deleted_at = NOW() WHERE id = ?', [id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[报表] 删除自定义报表失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 获取可用字段列表
router.get('/custom/fields/:source', authenticateToken, checkPermission('report'), async (req, res) => {
  try {
  const src = SOURCE_FIELDS[req.params.source];
  if (!src) return res.status(400).json({ code: 400, message: '无效的数据来源', data: null });
  const fields = Object.entries(src.fields).map(([key, label]) => ({ key, label }));
  res.json({ code: 200, message: '查询成功', data: fields });
  } catch (error) {
    console.error('[报表] 获取字段列表错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 执行自定义报表
router.post('/custom/:id/run', authenticateToken, checkPermission('report'), async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, pageSize = 20, filters = {} } = req.body;

    const [configs] = await pool.query('SELECT * FROM crm_report_config WHERE id = ? AND deleted_at IS NULL', [id]);
    if (configs.length === 0) return res.status(404).json({ code: 404, message: '报表不存在', data: null });
    const config = configs[0];

    const src = SOURCE_FIELDS[config.data_source];
    if (!src) return res.status(400).json({ code: 400, message: '无效的数据来源', data: null });

    // 解析列配置
    let columns = [];
    try { columns = JSON.parse(config.columns_config || '[]'); } catch { columns = []; }
    if (columns.length === 0) {
      columns = Object.entries(src.fields).slice(0, 6).map(([key, label]) => ({ field: key, label, agg: null }));
    }

    // 构建SELECT
    const selectParts = columns.map(c => {
      if (c.agg === 'count') return `COUNT(${src.alias}.${c.field}) as \`${c.label}\``;
      if (c.agg === 'sum') return `COALESCE(SUM(${src.alias}.${c.field}), 0) as \`${c.label}\``;
      if (c.agg === 'avg') return `COALESCE(AVG(${src.alias}.${c.field}), 0) as \`${c.label}\``;
      return `${src.alias}.${c.field} as \`${c.label}\``;
    });

    let where = `${src.alias}.deleted_at IS NULL`;
    const params = [];

    // 应用筛选条件
    try {
      const filterConfig = JSON.parse(config.filter_config || '[]');
      for (const f of filterConfig) {
        const val = filters[f.field];
        if (val !== undefined && val !== '') {
          if (f.type === 'select') { where += ` AND ${src.alias}.${f.field} = ?`; params.push(val); }
          else if (f.type === 'date_range' && Array.isArray(val) && val.length === 2) { where += ` AND ${src.alias}.${f.field} BETWEEN ? AND ?`; params.push(val[0], val[1]); }
          else { where += ` AND ${src.alias}.${f.field} LIKE ?`; params.push(`%${val}%`); }
        }
      }
    } catch { /* */ }

    // 用户传入的额外筛选
    for (const [key, val] of Object.entries(filters)) {
      if (val !== undefined && val !== '' && !where.includes(key)) {
        where += ` AND ${src.alias}.${key} LIKE ?`;
        params.push(`%${val}%`);
      }
    }

    const hasGroupBy = columns.some(c => c.agg);
    const groupBy = hasGroupBy ? `GROUP BY ${columns.filter(c => !c.agg).map(c => `${src.alias}.${c.field}`).join(', ')}` : '';
    const join = src.join || '';

    // 计数
    const countSql = `SELECT COUNT(*) as total FROM ${src.table} ${src.alias} ${join} WHERE ${where}`;
    const [[{ total }]] = await pool.query(countSql, params);

    // 数据
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const dataSql = `SELECT ${selectParts.join(', ')} FROM ${src.table} ${src.alias} ${join} WHERE ${where} ${groupBy} LIMIT ? OFFSET ?`;
    const [rows] = await pool.query(dataSql, [...params, parseInt(pageSize), offset]);

    res.json({ code: 200, message: '查询成功', data: { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (error) {
    console.error('[报表] 执行自定义报表失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;
