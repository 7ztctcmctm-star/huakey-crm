/**
 * 财务增强服务层
 * 从 routes/finance-enhanced.js 提取的业务逻辑
 */

// ============ 回款提醒 ============

/**
 * 提醒列表
 */
async function getReminders(pool, { status, page, pageSize }) {
  const offset = (page - 1) * pageSize;
  let where = 'WHERE 1=1';
  const params = [];
  if (status) { where += ' AND r.status = ?'; params.push(status); }

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_payment_reminder r ${where}`, params);
  const [rows] = await pool.query(`
    SELECT r.id, r.contract_id, r.plan_id, r.customer_id, r.remind_date, r.remind_type, r.remind_days, r.amount, r.status, r.remark, r.create_time,
           c.contract_no, cu.company_name as customer_name
    FROM crm_payment_reminder r
    JOIN crm_contract c ON r.contract_id = c.id
    JOIN crm_customer cu ON r.customer_id = cu.id
    ${where} ORDER BY r.remind_date ASC LIMIT ? OFFSET ?
  `, [...params, parseInt(pageSize), offset]);

  return { list: rows, total };
}

/**
 * 生成回款提醒
 */
async function generateReminders(pool) {
  let created = 0;

  const [upcoming] = await pool.query(`
    SELECT pp.id as plan_id, pp.contract_id, c.customer_id, pp.plan_date, pp.plan_amount,
           DATEDIFF(pp.plan_date, CURDATE()) as remind_days
    FROM crm_payment_plan pp
    JOIN crm_contract c ON pp.contract_id = c.id
    WHERE pp.status != 'completed' AND c.deleted_at IS NULL
      AND pp.plan_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
      AND NOT EXISTS (
        SELECT 1 FROM crm_payment_reminder pr
        WHERE pr.contract_id = pp.contract_id AND pr.plan_id = pp.id
          AND pr.remind_type = 'upcoming' AND pr.remind_date = CURDATE()
      )
  `);

  for (const r of upcoming) {
    await pool.query(
      'INSERT IGNORE INTO crm_payment_reminder (contract_id, plan_id, customer_id, remind_date, remind_type, remind_days, amount) VALUES (?, ?, ?, CURDATE(), ?, ?, ?)',
      [r.contract_id, r.plan_id, r.customer_id, 'upcoming', r.remind_days, r.plan_amount]
    );
    created++;
  }

  const [overdue] = await pool.query(`
    SELECT pp.id as plan_id, pp.contract_id, c.customer_id, pp.plan_date, pp.plan_amount,
           DATEDIFF(CURDATE(), pp.plan_date) as remind_days
    FROM crm_payment_plan pp
    JOIN crm_contract c ON pp.contract_id = c.id
    WHERE pp.status != 'completed' AND c.deleted_at IS NULL
      AND pp.plan_date < CURDATE()
      AND NOT EXISTS (
        SELECT 1 FROM crm_payment_reminder pr
        WHERE pr.contract_id = pp.contract_id AND pr.plan_id = pp.id
          AND pr.remind_type = 'overdue' AND pr.remind_date = CURDATE()
      )
  `);

  for (const r of overdue) {
    await pool.query(
      'INSERT IGNORE INTO crm_payment_reminder (contract_id, plan_id, customer_id, remind_date, remind_type, remind_days, amount) VALUES (?, ?, ?, CURDATE(), ?, ?, ?)',
      [r.contract_id, r.plan_id, r.customer_id, 'overdue', -r.remind_days, r.plan_amount]
    );
    created++;
  }

  return { created };
}

/**
 * 确认提醒
 */
async function acknowledgeReminder(pool, id) {
  await pool.query("UPDATE crm_payment_reminder SET status = 'acknowledged' WHERE id = ?", [id]);
}

/**
 * 提醒汇总
 */
async function getReminderSummary(pool) {
  const [[{ today_pending }]] = await pool.query("SELECT COUNT(*) as today_pending FROM crm_payment_reminder WHERE status = 'pending' AND remind_date = CURDATE()");
  const [[{ upcoming }]] = await pool.query("SELECT COUNT(*) as upcoming FROM crm_payment_reminder WHERE status = 'pending' AND remind_type = 'upcoming'");
  const [[{ overdue }]] = await pool.query("SELECT COUNT(*) as overdue FROM crm_payment_reminder WHERE status = 'pending' AND remind_type = 'overdue'");
  const [[{ overdue_amount }]] = await pool.query("SELECT COALESCE(SUM(amount), 0) as overdue_amount FROM crm_payment_reminder WHERE status = 'pending' AND remind_type = 'overdue'");

  return { today_pending, upcoming, overdue, overdue_amount: parseFloat(overdue_amount) };
}

// ============ 对账管理 ============

/**
 * 客户对账数据
 */
async function getCustomerReconciliation(pool, { customer_id, start_date, end_date }) {
  const now = new Date();
  const startDate = start_date || `${now.getFullYear()}-01-01`;
  const endDate = end_date || `${now.getFullYear()}-12-31`;

  const [[customer]] = await pool.query(`
    SELECT c.id, c.company_name, pc.name as contact_name, pc.phone
    FROM crm_customer c
    LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
    WHERE c.id = ? AND c.deleted_at IS NULL
  `, [customer_id]);
  if (!customer) return { error: 'not_found' };

  const [contracts] = await pool.query(`
    SELECT id, contract_no, amount, sign_date, status
    FROM crm_contract WHERE customer_id = ? AND deleted_at IS NULL
      AND sign_date BETWEEN ? AND ?
    ORDER BY sign_date
  `, [customer_id, startDate, endDate]);

  const [payments] = await pool.query(`
    SELECT p.id, p.pay_amount, p.pay_date, p.pay_method, ct.contract_no
    FROM crm_payment p
    JOIN crm_contract ct ON p.contract_id = ct.id
    WHERE ct.customer_id = ? AND ct.deleted_at IS NULL AND p.deleted_at IS NULL
      AND p.pay_date BETWEEN ? AND ?
    ORDER BY p.pay_date
  `, [customer_id, startDate, endDate]);

  const totalAmount = contracts.reduce((s, c) => s + parseFloat(c.amount || 0), 0);
  const paidAmount = payments.reduce((s, p) => s + parseFloat(p.pay_amount || 0), 0);

  return {
    customer, contracts, payments,
    summary: { total_amount: totalAmount, paid_amount: paidAmount, unpaid_amount: totalAmount - paidAmount }
  };
}

/**
 * 供应商对账数据
 */
async function getSupplierReconciliation(pool, { supplier_id, start_date, end_date }) {
  const now = new Date();
  const startDate = start_date || `${now.getFullYear()}-01-01`;
  const endDate = end_date || `${now.getFullYear()}-12-31`;

  const [[supplier]] = await pool.query('SELECT id, name, contact_person, phone FROM crm_supplier WHERE id = ? AND deleted_at IS NULL', [supplier_id]);
  if (!supplier) return { error: 'not_found' };

  const [orders] = await pool.query(`
    SELECT id, order_no, total_amount, create_time, status
    FROM crm_purchase_order WHERE supplier_id = ? AND deleted_at IS NULL
      AND create_time BETWEEN ? AND ?
    ORDER BY create_time
  `, [supplier_id, startDate, endDate + ' 23:59:59']);

  const totalAmount = orders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);

  return {
    supplier, orders, payments: [],
    summary: { total_amount: totalAmount, paid_amount: 0, unpaid_amount: totalAmount }
  };
}

/**
 * 生成对账单号
 */
async function generateReconNo(pool) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const [[{ cnt }]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_reconciliation WHERE recon_no LIKE ?", [`RC-${dateStr}-%`]);
  return `RC-${dateStr}-${String(cnt + 1).padStart(3, '0')}`;
}

/**
 * 保存对账单
 */
async function saveReconciliation(pool, data, userId) {
  const { recon_type, target_id, target_name, period_start, period_end, total_amount, paid_amount, unpaid_amount, detail_data } = data;
  const reconNo = await generateReconNo(pool);
  const [result] = await pool.query(
    'INSERT INTO crm_reconciliation (recon_no, recon_type, target_id, target_name, period_start, period_end, total_amount, paid_amount, unpaid_amount, detail_data, create_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [reconNo, recon_type, target_id, target_name || null, period_start, period_end, total_amount || 0, paid_amount || 0, unpaid_amount || 0, detail_data || null, userId]
  );
  return { id: result.insertId, recon_no: reconNo };
}

/**
 * 对账单列表
 */
async function getReconciliationList(pool, { recon_type, status, page, pageSize }) {
  const offset = (page - 1) * pageSize;
  let where = 'WHERE 1=1';
  const params = [];
  if (recon_type) { where += ' AND recon_type = ?'; params.push(recon_type); }
  if (status) { where += ' AND status = ?'; params.push(status); }

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_reconciliation ${where}`, params);
  const [rows] = await pool.query(`
    SELECT r.id, r.recon_no, r.recon_type, r.target_id, r.target_name, r.period_start, r.period_end, r.total_amount, r.paid_amount, r.unpaid_amount, r.status, r.detail_data, r.create_by, r.create_time,
           u.real_name as create_by_name
    FROM crm_reconciliation r LEFT JOIN sys_user u ON r.create_by = u.id
    ${where} ORDER BY r.create_time DESC LIMIT ? OFFSET ?
  `, [...params, parseInt(pageSize), offset]);

  return { list: rows, total };
}

// ============ 财务分析 ============

/**
 * 财务分析（利润、成本结构、账龄、现金流、收款效率、回款率趋势）
 */
async function getAnalysis(pool, { start_date, end_date }) {
  const now = new Date();
  const yearStart = start_date || `${now.getFullYear()}-01-01`;
  const yearEnd = end_date || `${now.getFullYear()}-12-31`;

  const [[income]] = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) as total FROM crm_contract WHERE deleted_at IS NULL AND sign_date BETWEEN ? AND ?", [yearStart, yearEnd]
  );
  const [[cost]] = await pool.query(
    "SELECT COALESCE(SUM(total_amount), 0) as total FROM crm_purchase_order WHERE deleted_at IS NULL AND create_time BETWEEN ? AND ?", [yearStart, yearEnd + ' 23:59:59']
  );
  const grossProfit = parseFloat(income.total) - parseFloat(cost.total);
  const grossMargin = parseFloat(income.total) > 0 ? (grossProfit / parseFloat(income.total) * 100).toFixed(1) : 0;

  const [costStructure] = await pool.query(`
    SELECT s.type as name, COALESCE(SUM(po.total_amount), 0) as value
    FROM crm_purchase_order po
    JOIN crm_supplier s ON po.supplier_id = s.id
    WHERE po.deleted_at IS NULL AND po.create_time BETWEEN ? AND ?
    GROUP BY s.type ORDER BY value DESC
  `, [yearStart, yearEnd + ' 23:59:59']);

  const [receivables] = await pool.query(`
    SELECT c.id, c.amount, COALESCE(SUM(p.pay_amount), 0) as paid,
           DATEDIFF(CURDATE(), COALESCE(c.sign_date, c.create_time)) as age_days
    FROM crm_contract c
    LEFT JOIN crm_payment p ON c.id = p.contract_id AND p.deleted_at IS NULL
    WHERE c.deleted_at IS NULL AND c.status IN (1, 2)
    GROUP BY c.id HAVING (c.amount - paid) > 0
  `);

  const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  receivables.forEach(r => {
    const unpaid = parseFloat(r.amount) - parseFloat(r.paid);
    if (r.age_days <= 30) aging['0-30'] += unpaid;
    else if (r.age_days <= 60) aging['31-60'] += unpaid;
    else if (r.age_days <= 90) aging['61-90'] += unpaid;
    else aging['90+'] += unpaid;
  });

  const [cashIn] = await pool.query(`
    SELECT DATE_FORMAT(pay_date, '%Y-%m') as month, COALESCE(SUM(pay_amount), 0) as amount
    FROM crm_payment WHERE deleted_at IS NULL AND pay_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
    GROUP BY month ORDER BY month
  `);
  const [cashOut] = await pool.query(`
    SELECT DATE_FORMAT(create_time, '%Y-%m') as month, COALESCE(SUM(total_amount), 0) as amount
    FROM crm_purchase_order WHERE deleted_at IS NULL AND create_time >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
    GROUP BY month ORDER BY month
  `);

  const [paymentCycle] = await pool.query(`
    SELECT AVG(DATEDIFF(p.pay_date, c.sign_date)) as avg_days
    FROM crm_payment p
    JOIN crm_contract c ON p.contract_id = c.id
    WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
      AND p.pay_date BETWEEN ? AND ? AND c.sign_date IS NOT NULL
  `, [yearStart, yearEnd]);

  const [collectionTrend] = await pool.query(`
    SELECT month, contract_amount, COALESCE(paid_amount, 0) as paid_amount FROM (
      SELECT DATE_FORMAT(c.sign_date, '%Y-%m') as month,
             COALESCE(SUM(c.amount), 0) as contract_amount
      FROM crm_contract c WHERE c.deleted_at IS NULL AND c.sign_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY month
    ) t1 LEFT JOIN (
      SELECT DATE_FORMAT(p.pay_date, '%Y-%m') as month,
             COALESCE(SUM(p.pay_amount), 0) as paid_amount
      FROM crm_payment p
      JOIN crm_contract c2 ON p.contract_id = c2.id
      WHERE p.deleted_at IS NULL AND c2.deleted_at IS NULL AND p.pay_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY month
    ) t2 USING (month)
    ORDER BY month
  `);

  const cashFlowMap = {};
  cashIn.forEach(r => { cashFlowMap[r.month] = { month: r.month, inflow: parseFloat(r.amount), outflow: 0 }; });
  cashOut.forEach(r => {
    if (cashFlowMap[r.month]) cashFlowMap[r.month].outflow = parseFloat(r.amount);
    else cashFlowMap[r.month] = { month: r.month, inflow: 0, outflow: parseFloat(r.amount) };
  });

  return {
    profit: { income: parseFloat(income.total), cost: parseFloat(cost.total), gross_profit: grossProfit, gross_margin: parseFloat(grossMargin) },
    costStructure,
    aging: Object.entries(aging).map(([label, amount]) => ({ label, amount })),
    cashFlow: Object.values(cashFlowMap).sort((a, b) => a.month.localeCompare(b.month)),
    collection: { avg_days: paymentCycle[0]?.avg_days ? Math.round(paymentCycle[0].avg_days) : 0, trend: collectionTrend }
  };
}

/**
 * 财务分析导出CSV
 */
async function getAnalysisExport(pool, { start_date, end_date }) {
  const now = new Date();
  const yearStart = start_date || `${now.getFullYear()}-01-01`;
  const yearEnd = end_date || `${now.getFullYear()}-12-31`;

  const [rows] = await pool.query(`
    SELECT c.contract_no as '合同编号', cu.company_name as '客户名称', c.amount as '合同金额',
           c.sign_date as '签订日期', COALESCE(SUM(p.pay_amount), 0) as '已回款',
           (c.amount - COALESCE(SUM(p.pay_amount), 0)) as '未回款'
    FROM crm_contract c
    LEFT JOIN crm_customer cu ON c.customer_id = cu.id
    LEFT JOIN crm_payment p ON c.id = p.contract_id AND p.deleted_at IS NULL
    WHERE c.deleted_at IS NULL AND c.sign_date BETWEEN ? AND ?
    GROUP BY c.id ORDER BY c.sign_date DESC
  `, [yearStart, yearEnd]);

  return rows;
}

module.exports = {
  getReminders,
  generateReminders,
  acknowledgeReminder,
  getReminderSummary,
  getCustomerReconciliation,
  getSupplierReconciliation,
  saveReconciliation,
  getReconciliationList,
  getAnalysis,
  getAnalysisExport
};
