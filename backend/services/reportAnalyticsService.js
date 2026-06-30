/**
 * 报表分析服务层
 * 从 routes/report/analytics.js 提取的业务逻辑，供路由层复用
 */

const XLSX = require('xlsx');

/**
 * 销售漏斗统计
 * @param {object} pool
 * @param {object} params - { startDate, endDate }
 * @returns {Array} 各阶段 [{ stage, count, amount }]
 */
async function getSalesFunnel(pool, params = {}) {
  const { startDate, endDate } = params;
  let dateFilter = '';
  const queryParams = [];

  if (startDate && endDate) {
    dateFilter = 'WHERE so.create_time BETWEEN ? AND ?';
    queryParams.push(startDate, endDate + ' 23:59:59');
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
  `, queryParams);

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

  return result;
}

/**
 * 业绩统计
 * @param {object} pool
 * @param {object} params - { startDate, endDate }
 * @returns {Array} 各销售 [{ user_id, name, contract_amount, payment_amount }]
 */
async function getPerformance(pool, params = {}) {
  const { startDate, endDate } = params;
  let dateFilter = '';
  const queryParams = [];

  if (startDate && endDate) {
    dateFilter = 'AND c.sign_date BETWEEN ? AND ?';
    queryParams.push(startDate, endDate);
  } else {
    dateFilter = `AND c.sign_date >= DATE_FORMAT(NOW(), '%Y-%m-01') AND c.sign_date < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH`;
  }

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
  `, queryParams);

  return rows;
}

/**
 * 客户统计（本月新增、来源分布、等级分布）
 * @param {object} pool
 * @param {object} params - { startDate, endDate }
 * @returns {{ month_new: number, source_dist: Array, source_detail_dist: Array, level_dist: Array }}
 */
async function getCustomerStats(pool, params = {}) {
  const { startDate, endDate } = params;
  let dateFilter = '';
  const queryParams = [];

  if (startDate && endDate) {
    dateFilter = 'AND c.create_time BETWEEN ? AND ?';
    queryParams.push(startDate, endDate + ' 23:59:59');
  }

  const [monthCount] = await pool.query(`
    SELECT COUNT(*) as count FROM crm_customer c
    WHERE 1=1 ${dateFilter || `AND create_time >= DATE_FORMAT(NOW(), '%Y-%m-01') AND create_time < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH`}
  `, queryParams);

  const sourceParams = [...queryParams];
  const [sourceDist] = await pool.query(`
    SELECT
      CASE
        WHEN source IN ('Facebook','Instagram','LinkedIn','独立站','其他网络渠道') THEN '网络'
        ELSE source
      END as source,
      COUNT(*) as count
    FROM crm_customer c
    WHERE deleted_at IS NULL ${dateFilter}
    GROUP BY CASE
      WHEN source IN ('Facebook','Instagram','LinkedIn','独立站','其他网络渠道') THEN '网络'
      ELSE source
    END
    ORDER BY count DESC
  `, sourceParams);

  const [sourceDetailDist] = await pool.query(`
    SELECT source, COUNT(*) as count
    FROM crm_customer c
    WHERE deleted_at IS NULL ${dateFilter}
    GROUP BY source
    ORDER BY count DESC
  `, [...queryParams]);

  const [levelDist] = await pool.query(`
    SELECT level, COUNT(*) as count
    FROM crm_customer c
    WHERE 1=1 ${dateFilter}
    GROUP BY level
    ORDER BY CASE level WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5 END
  `, [...queryParams]);

  return {
    month_new: monthCount[0].count,
    source_dist: sourceDist,
    source_detail_dist: sourceDetailDist,
    level_dist: levelDist
  };
}

/**
 * 回款统计（计划金额、实收金额、逾期金额）
 * @param {object} pool
 * @param {object} params - { startDate, endDate }
 * @returns {{ plan_amount: string, pay_amount: string, overdue_amount: string }}
 */
async function getPaymentStats(pool, params = {}) {
  const { startDate, endDate } = params;

  let planDateFilter, payDateFilter;
  const planParams = [], payParams = [];

  if (startDate && endDate) {
    planDateFilter = 'pp.plan_date BETWEEN ? AND ?';
    payDateFilter = 'p.pay_date BETWEEN ? AND ?';
    planParams.push(startDate, endDate);
    payParams.push(startDate, endDate);
  } else {
    planDateFilter = `pp.plan_date >= DATE_FORMAT(NOW(), '%Y-%m-01') AND pp.plan_date < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH`;
    payDateFilter = `p.pay_date >= DATE_FORMAT(NOW(), '%Y-%m-01') AND p.pay_date < DATE_FORMAT(NOW(), '%Y-%m-01') + INTERVAL 1 MONTH`;
  }

  const [planAmount] = await pool.query(`
    SELECT COALESCE(SUM(plan_amount), 0) as amount
    FROM crm_payment_plan pp
    WHERE ${planDateFilter}
  `, planParams);

  const [payAmount] = await pool.query(`
    SELECT COALESCE(SUM(pay_amount), 0) as amount
    FROM crm_payment p
    WHERE ${payDateFilter}
  `, payParams);

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

  return {
    plan_amount: planAmount[0].amount?.toString() || '0.00',
    pay_amount: payAmount[0].amount?.toString() || '0.00',
    overdue_amount: overdueTotal.toFixed(2)
  };
}

/**
 * 销售趋势（按月统计合同金额）
 * @param {object} pool
 * @param {object} params - { startDate, endDate }
 * @returns {Array} [{ month, contract_count, amount }]
 */
async function getSalesTrend(pool, params = {}) {
  const { startDate, endDate } = params;
  let dateFilter;
  const queryParams = [];

  if (startDate && endDate) {
    dateFilter = 'c.sign_date BETWEEN ? AND ?';
    queryParams.push(startDate, endDate);
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
  `, queryParams);

  return rows;
}

/**
 * 逾期跟进客户列表
 * @param {object} pool
 * @param {object} params - { page, pageSize }
 * @param {number} userId
 * @param {number} roleId
 * @returns {{ list: Array, total: number, page: number, pageSize: number }}
 */
async function getOverdueCustomers(pool, params = {}, userId, roleId) {
  const ROLES = require('../config/roles');
  const { getOverdueDays } = require('../utils/config');

  const { page = 1, pageSize = 20 } = params;
  const safePageSize = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
  const offset = (Math.max(1, parseInt(page) || 1) - 1) * safePageSize;
  const overdueDays = await getOverdueDays();

  const isAdmin = roleId === ROLES.ADMIN || roleId === ROLES.MANAGER;
  const isDeptManager = roleId === ROLES.MANAGER;

  let whereClause = `WHERE c.pool_status = 0 AND c.deleted_at IS NULL AND c.owner_id IS NOT NULL
    AND ((c.last_follow_time IS NULL AND c.create_time < NOW() - INTERVAL ${overdueDays} DAY)
      OR c.last_follow_time < NOW() - INTERVAL ${overdueDays} DAY)`;

  if (!isAdmin) {
    if (isDeptManager) {
      whereClause += ' AND c.owner_id IN (SELECT id FROM sys_user WHERE dept_id = (SELECT dept_id FROM sys_user WHERE id = ?))';
    } else {
      whereClause += ' AND c.owner_id = ?';
    }
  }

  const queryParams = isAdmin ? [] : [userId];

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_customer c ${whereClause}`, queryParams
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
    [...queryParams, safePageSize, parseInt(offset)]
  );

  return { list, total, page: parseInt(page), pageSize: safePageSize };
}

/**
 * 采购趋势（按月统计采购金额）
 * @param {object} pool
 * @param {object} params - { startDate, endDate }
 * @returns {Array} [{ month, order_count, amount }]
 */
async function getPurchaseTrend(pool, params = {}) {
  const { startDate, endDate } = params;
  let dateFilter;
  const queryParams = [];

  if (startDate && endDate) {
    dateFilter = 'po.create_time BETWEEN ? AND ?';
    queryParams.push(startDate, endDate + ' 23:59:59');
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
  `, queryParams);

  return rows;
}

/**
 * 采购按供应商分布
 * @param {object} pool
 * @param {object} params - { startDate, endDate }
 * @returns {Array} [{ supplier_name, order_count, total_amount }]
 */
async function getPurchaseBySupplier(pool, params = {}) {
  const { startDate, endDate } = params;
  let dateFilter = '';
  const queryParams = [];

  if (startDate && endDate) {
    dateFilter = 'AND po.create_time BETWEEN ? AND ?';
    queryParams.push(startDate, endDate + ' 23:59:59');
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
  `, queryParams);

  return rows;
}

/**
 * 导出报表（业绩排行 + 销售漏斗 + 客户来源 + 采购分析，多Sheet）
 * @param {object} pool
 * @param {object} params - { startDate, endDate }
 * @returns {Buffer} XLSX 文件 buffer
 */
async function exportReport(pool, params = {}) {
  const { startDate, endDate } = params;
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
    FROM crm_customer c WHERE deleted_at IS NULL ${custDateFilter}
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

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * 财务报表（月/季/年合同、回款、采购汇总 + 应收账款 + 趋势）
 * @param {object} pool
 * @param {object} params - { start_date, end_date }
 * @returns {object} { overview, receivables, trend }
 */
async function getFinanceReport(pool, params = {}) {
  const { start_date, end_date } = params;
  const now = new Date();
  const monthStart = start_date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = end_date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;

  const year = now.getFullYear();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  const quarterStart = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}-01`;
  const yearStart = `${year}-01-01`;

  const [
    [[monthContract]],
    [[quarterContract]],
    [[yearContract]],
    [[monthPayment]],
    [[quarterPayment]],
    [[yearPayment]],
    [[monthPurchase]],
    [[quarterPurchase]],
    [[yearPurchase]]
  ] = await Promise.all([
    pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM crm_contract WHERE deleted_at IS NULL AND sign_date BETWEEN ? AND ?", [monthStart, monthEnd]),
    pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM crm_contract WHERE deleted_at IS NULL AND sign_date BETWEEN ? AND ?", [quarterStart, monthEnd]),
    pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM crm_contract WHERE deleted_at IS NULL AND sign_date BETWEEN ? AND ?", [yearStart, monthEnd]),
    pool.query("SELECT COALESCE(SUM(pay_amount), 0) as total FROM crm_payment WHERE deleted_at IS NULL AND pay_date BETWEEN ? AND ?", [monthStart, monthEnd]),
    pool.query("SELECT COALESCE(SUM(pay_amount), 0) as total FROM crm_payment WHERE deleted_at IS NULL AND pay_date BETWEEN ? AND ?", [quarterStart, monthEnd]),
    pool.query("SELECT COALESCE(SUM(pay_amount), 0) as total FROM crm_payment WHERE deleted_at IS NULL AND pay_date BETWEEN ? AND ?", [yearStart, monthEnd]),
    pool.query("SELECT COALESCE(SUM(total_amount), 0) as total FROM crm_purchase_order WHERE deleted_at IS NULL AND create_time BETWEEN ? AND ?", [monthStart, monthEnd + ' 23:59:59']),
    pool.query("SELECT COALESCE(SUM(total_amount), 0) as total FROM crm_purchase_order WHERE deleted_at IS NULL AND create_time BETWEEN ? AND ?", [quarterStart, monthEnd + ' 23:59:59']),
    pool.query("SELECT COALESCE(SUM(total_amount), 0) as total FROM crm_purchase_order WHERE deleted_at IS NULL AND create_time BETWEEN ? AND ?", [yearStart, monthEnd + ' 23:59:59'])
  ]);

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

  const trendMap = {};
  trend.forEach(t => { trendMap[t.month] = { month: t.month, contract_amount: parseFloat(t.contract_amount), payment_amount: 0 }; });
  paymentTrend.forEach(t => {
    if (trendMap[t.month]) trendMap[t.month].payment_amount = parseFloat(t.payment_amount);
    else trendMap[t.month] = { month: t.month, contract_amount: 0, payment_amount: parseFloat(t.payment_amount) };
  });
  const trendData = Object.values(trendMap).sort((a, b) => a.month.localeCompare(b.month));

  return {
    overview: {
      month: { contract: parseFloat(monthContract.total), payment: parseFloat(monthPayment.total), purchase: parseFloat(monthPurchase.total), profit: parseFloat(monthContract.total) - parseFloat(monthPurchase.total) },
      quarter: { contract: parseFloat(quarterContract.total), payment: parseFloat(quarterPayment.total), purchase: parseFloat(quarterPurchase.total), profit: parseFloat(quarterContract.total) - parseFloat(quarterPurchase.total) },
      year: { contract: parseFloat(yearContract.total), payment: parseFloat(yearPayment.total), purchase: parseFloat(yearPurchase.total), profit: parseFloat(yearContract.total) - parseFloat(yearPurchase.total) },
      payment_rate: yearContract.total > 0 ? Math.round(yearPayment.total / yearContract.total * 100) : 0
    },
    receivables,
    trend: trendData
  };
}

/**
 * 财务报表导出CSV
 * @param {object} pool
 * @param {object} params - { type, start_date, end_date }
 * @returns {{ rows: Array, headers: Array, filename: string }}
 */
async function exportFinance(pool, params = {}) {
  const { type = 'receivable', start_date, end_date } = params;
  const now = new Date();
  const monthStart = start_date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = end_date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;

  let rows, filename;

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

  return { rows, filename };
}

/**
 * 经营分析看板（KPI、团队排名、分布、趋势、预警）
 * @param {object} pool
 * @returns {object} { kpi, teamRanking, sellerDetails, distribution, trends, warnings }
 */
async function getBusinessDashboard(pool) {
  const { getOverdueDays } = require('../utils/config');

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const thisMonthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastMonthEnd = new Date(year, month - 1, 0);
  const lastMonthStart = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, '0')}-01`;
  const lastMonthEndStr = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, '0')}-31`;

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

  return {
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
  };
}

/**
 * 采购成本分析
 * 按月份、产品分类统计采购金额
 * @param {object} pool
 * @param {object} params - { start_date, end_date }
 * @returns {object} { summary, by_category, monthly }
 */
async function getPurchaseCost(pool, params = {}) {
  const { start_date, end_date } = params;
  let dateFilter = '';
  const queryParams = [];

  if (start_date && end_date) {
    dateFilter = 'AND po.create_time BETWEEN ? AND ?';
    queryParams.push(start_date, end_date + ' 23:59:59');
  }

  const [[totalRow]] = await pool.query(`
    SELECT COALESCE(SUM(po.total_with_tax), 0) as total,
           COUNT(DISTINCT DATE_FORMAT(po.create_time, '%Y-%m')) as month_count
    FROM crm_purchase_order po
    WHERE po.status != '已取消' AND po.deleted_at IS NULL ${dateFilter}
  `, queryParams);

  const total = parseFloat(totalRow.total) || 0;
  const monthCount = parseInt(totalRow.month_count) || 1;

  const [categoryRows] = await pool.query(`
    SELECT
      COALESCE(p.category, '未分类') as category,
      COALESCE(SUM(pi.amount), 0) as amount
    FROM crm_purchase_order po
    JOIN crm_purchase_item pi ON pi.order_id = po.id AND pi.deleted_at IS NULL
    LEFT JOIN crm_product p ON p.name = pi.product_name AND p.deleted_at IS NULL
    WHERE po.status != '已取消' AND po.deleted_at IS NULL ${dateFilter}
    GROUP BY COALESCE(p.category, '未分类')
    ORDER BY amount DESC
  `, [...queryParams]);

  const [monthlyRows] = await pool.query(`
    SELECT
      DATE_FORMAT(po.create_time, '%Y-%m') as month,
      COALESCE(SUM(po.total_with_tax), 0) as amount
    FROM crm_purchase_order po
    WHERE po.status != '已取消' AND po.deleted_at IS NULL ${dateFilter}
    GROUP BY DATE_FORMAT(po.create_time, '%Y-%m')
    ORDER BY month
  `, queryParams);

  return {
    summary: {
      total,
      avg_monthly: Math.round(total / monthCount)
    },
    by_category: categoryRows.map(r => ({ category: r.category, amount: parseFloat(r.amount) || 0 })),
    monthly: monthlyRows.map(r => ({ month: r.month, amount: parseFloat(r.amount) || 0 }))
  };
}

/**
 * 供应商绩效分析
 * 统计供应商采购金额、准时交付率、质量评分
 * @param {object} pool
 * @param {object} params - { start_date, end_date, supplier_id }
 * @returns {object} { top_suppliers }
 */
async function getSupplierPerformance(pool, params = {}) {
  const { start_date, end_date, supplier_id } = params;
  let dateFilter = '';
  let supplierFilter = '';
  const queryParams = [];

  if (start_date && end_date) {
    dateFilter = 'AND po.create_time BETWEEN ? AND ?';
    queryParams.push(start_date, end_date + ' 23:59:59');
  }

  if (supplier_id) {
    supplierFilter = 'AND s.id = ?';
    queryParams.push(supplier_id);
  }

  const [amountRows] = await pool.query(`
    SELECT
      s.id,
      s.name,
      COALESCE(SUM(po.total_with_tax), 0) as amount,
      COUNT(po.id) as order_count
    FROM crm_supplier s
    JOIN crm_purchase_order po ON po.supplier_id = s.id
    WHERE po.status != '已取消' AND po.deleted_at IS NULL ${dateFilter} ${supplierFilter}
    GROUP BY s.id, s.name
    ORDER BY amount DESC
  `, queryParams);

  if (amountRows.length === 0) {
    return { top_suppliers: [] };
  }

  const supplierIds = amountRows.map(r => r.id);
  const placeholders = supplierIds.map(() => '?').join(',');

  const [ratingRows] = await pool.query(`
    SELECT
      r.supplier_id,
      AVG(r.quality_score) as avg_quality,
      AVG(r.delivery_rate) as on_time_rate
    FROM crm_supplier_rating r
    WHERE r.supplier_id IN (${placeholders})
      AND r.deleted_at IS NULL
      AND r.rating_period = (
        SELECT r2.rating_period
        FROM crm_supplier_rating r2
        WHERE r2.supplier_id = r.supplier_id AND r2.deleted_at IS NULL
        ORDER BY r2.rating_period DESC, r2.create_time DESC
        LIMIT 1
      )
    GROUP BY r.supplier_id
  `, supplierIds);

  const ratingMap = new Map(ratingRows.map(r => [r.supplier_id, r]));

  return {
    top_suppliers: amountRows.map(r => {
      const rating = ratingMap.get(r.id) || {};
      return {
        id: r.id,
        name: r.name,
        amount: parseFloat(r.amount) || 0,
        order_count: r.order_count,
        on_time_rate: rating.on_time_rate ? parseFloat(rating.on_time_rate) / 100 : null,
        avg_quality: rating.avg_quality ? parseFloat(rating.avg_quality) : null
      };
    })
  };
}

module.exports = {
  getSalesFunnel,
  getPerformance,
  getCustomerStats,
  getPaymentStats,
  getSalesTrend,
  getOverdueCustomers,
  getPurchaseTrend,
  getPurchaseBySupplier,
  exportReport,
  getFinanceReport,
  exportFinance,
  getBusinessDashboard,
  getPurchaseCost,
  getSupplierPerformance
};
