/**
 * 回款核心服务层
 * 从 routes/contract.js 回款部分提取的业务逻辑，供路由层复用
 */

/**
 * 重新计算回款计划的 paid_amount / status / overdue_days
 * @param {object} pool
 * @param {number} planId
 */
async function recalculatePlanStatus(pool, planId) {
  const [plans] = await pool.query('SELECT plan_amount, plan_date FROM crm_payment_plan WHERE id = ?', [planId]);
  if (!plans.length) return;

  const plan = plans[0];

  // 计算已回金额（排除已删除的回款记录）
  const [sumRows] = await pool.query(
    'SELECT COALESCE(SUM(pay_amount), 0) as total FROM crm_payment WHERE plan_id = ? AND deleted_at IS NULL',
    [planId]
  );
  const paidAmount = parseFloat(sumRows[0].total);

  // 计算状态
  let status = 'pending';
  if (paidAmount >= parseFloat(plan.plan_amount)) {
    status = 'completed';
  } else if (paidAmount > 0) {
    status = 'partial';
  } else if (new Date(plan.plan_date) < new Date()) {
    status = 'overdue';
  }

  // 计算逾期天数
  let overdueDays = 0;
  if ((status === 'pending' || status === 'partial') && new Date(plan.plan_date) < new Date()) {
    overdueDays = Math.floor((Date.now() - new Date(plan.plan_date).getTime()) / 86400000);
  }

  await pool.query(
    'UPDATE crm_payment_plan SET paid_amount = ?, status = ?, overdue_days = ? WHERE id = ?',
    [paidAmount, status, overdueDays, planId]
  );
}

/**
 * 创建回款计划
 * @param {object} pool
 * @param {number} contractId
 * @param {Array} plans - [{ plan_date, plan_amount, remark }]
 * @returns {{ count: number }}
 */
async function createPaymentPlans(pool, contractId, plans) {
  if (!plans || plans.length === 0) return { count: 0 };

  const placeholders = plans.map(() => '(?, ?, ?, ?)').join(', ');
  const flatValues = plans.flatMap(p => [contractId, p.plan_date, p.plan_amount, p.remark || null]);

  const [result] = await pool.query(
    `INSERT INTO crm_payment_plan (contract_id, plan_date, plan_amount, remark) VALUES ${placeholders}`,
    flatValues
  );

  return { count: result.affectedRows };
}

/**
 * 重新计算回款计划状态（事务内版本，使用 conn 而非 pool）
 * @param {object} conn - 数据库连接（事务内）
 * @param {number} planId
 */
async function recalculatePlanStatusWithConn(conn, planId) {
  const [plans] = await conn.query('SELECT plan_amount, plan_date FROM crm_payment_plan WHERE id = ?', [planId]);
  if (!plans.length) return;

  const plan = plans[0];
  const [sumRows] = await conn.query(
    'SELECT COALESCE(SUM(pay_amount), 0) as total FROM crm_payment WHERE plan_id = ? AND deleted_at IS NULL',
    [planId]
  );
  const paidAmount = parseFloat(sumRows[0].total);

  let status = 'pending';
  let overdueDays = 0;
  if (paidAmount >= plan.plan_amount) {
    status = 'completed';
  } else if (paidAmount > 0) {
    status = 'partial';
  }
  if (status !== 'completed' && plan.plan_date) {
    const now = new Date();
    const planDate = new Date(plan.plan_date);
    const diffDays = Math.floor((now - planDate) / (1000 * 60 * 60 * 24));
    overdueDays = diffDays > 0 ? diffDays : 0;
  }

  await conn.query(
    'UPDATE crm_payment_plan SET paid_amount = ?, status = ?, overdue_days = ? WHERE id = ?',
    [paidAmount, status, overdueDays, planId]
  );
}

/**
 * 登记回款（匹配回款计划）
 * @param {object} pool
 * @param {object} data - { contract_id, plan_id, pay_date, pay_amount, pay_method, remark }
 * @returns {{ id: number }}
 */
async function recordPayment(pool, data) {
  const { contract_id, plan_id, pay_date, pay_amount, pay_method, remark } = data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [contracts] = await conn.query(
      'SELECT id, status FROM crm_contract WHERE id = ? AND deleted_at IS NULL',
      [contract_id]
    );
    if (!contracts.length) {
      const err = new Error('所属合同不存在');
      err.code = 404;
      throw err;
    }

    const [result] = await conn.query(
      'INSERT INTO crm_payment (contract_id, plan_id, pay_date, pay_amount, pay_method, remark) VALUES (?, ?, ?, ?, ?, ?)',
      [contract_id, plan_id || null, pay_date, pay_amount, pay_method || null, remark || null]
    );

    await conn.query('UPDATE crm_contract SET status = 2 WHERE id = ? AND status = 1', [contract_id]);

    if (plan_id) {
      await recalculatePlanStatusWithConn(conn, plan_id);
    }

    await conn.commit();
    return { id: result.insertId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * 更新回款记录
 * @param {object} pool
 * @param {object} data - { id, pay_date, pay_amount, pay_method, remark }
 */
async function updatePayment(pool, data) {
  const { id, pay_date, pay_amount, pay_method, remark } = data;

  // 查找旧 plan_id 用于刷新
  const [oldPayment] = await pool.query('SELECT plan_id, contract_id FROM crm_payment WHERE id = ?', [id]);
  if (!oldPayment.length) {
    const err = new Error('回款记录不存在');
    err.code = 404;
    throw err;
  }

  await pool.query(
    'UPDATE crm_payment SET pay_date = ?, pay_amount = ?, pay_method = ?, remark = ? WHERE id = ?',
    [pay_date, pay_amount, pay_method, remark, id]
  );

  // 刷新回款计划状态
  if (oldPayment[0].plan_id) {
    await recalculatePlanStatus(pool, oldPayment[0].plan_id);
  }
}

/**
 * 删除回款记录（逻辑删除）
 * @param {object} pool
 * @param {number} paymentId
 */
async function deletePayment(pool, paymentId) {
  const [payments] = await pool.query(
    'SELECT contract_id, plan_id FROM crm_payment WHERE id = ? AND deleted_at IS NULL',
    [paymentId]
  );
  if (!payments.length) {
    const err = new Error('回款记录不存在');
    err.code = 404;
    throw err;
  }

  await pool.query('UPDATE crm_payment SET deleted_at = NOW() WHERE id = ?', [paymentId]);

  // 刷新回款计划状态
  if (payments[0].plan_id) {
    await recalculatePlanStatus(pool, payments[0].plan_id);
  }
}

/**
 * 逾期检测：获取所有逾期未足额到账的回款计划
 * @param {object} pool
 * @param {object} params - { page, pageSize, keyword }
 * @returns {{ list: Array, total: number }}
 */
async function getOverduePayments(pool, params = {}) {
  const { page = 1, pageSize = 20, keyword } = params;
  const offset = (page - 1) * pageSize;
  const queryParams = [];

  let where = 'WHERE pp.plan_date < CURRENT_DATE AND c.deleted_at IS NULL';
  if (keyword) {
    where += ' AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)';
    queryParams.push(`%${keyword}%`, `%${keyword}%`);
  }

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total
     FROM crm_payment_plan pp
     JOIN crm_contract c ON pp.contract_id = c.id
     JOIN crm_customer cu ON c.customer_id = cu.id
     LEFT JOIN (
       SELECT plan_id, COALESCE(SUM(pay_amount), 0) as paid
       FROM crm_payment WHERE deleted_at IS NULL GROUP BY plan_id
     ) p ON p.plan_id = pp.id
     ${where} AND COALESCE(p.paid, 0) < pp.plan_amount`,
    queryParams
  );

  const [list] = await pool.query(
    `SELECT pp.id as plan_id, pp.contract_id, c.contract_no, cu.company_name,
            pp.plan_date, pp.plan_amount,
            COALESCE(p.paid, 0) as paid_amount,
            (pp.plan_amount - COALESCE(p.paid, 0)) as remain_amount,
            DATEDIFF(CURRENT_DATE, pp.plan_date) as overdue_days
     FROM crm_payment_plan pp
     JOIN crm_contract c ON pp.contract_id = c.id
     JOIN crm_customer cu ON c.customer_id = cu.id
     LEFT JOIN (
       SELECT plan_id, COALESCE(SUM(pay_amount), 0) as paid
       FROM crm_payment WHERE deleted_at IS NULL GROUP BY plan_id
     ) p ON p.plan_id = pp.id
     ${where} AND COALESCE(p.paid, 0) < pp.plan_amount
     ORDER BY pp.plan_date ASC
     LIMIT ? OFFSET ?`,
    [...queryParams, parseInt(pageSize), parseInt(offset)]
  );

  return { list, total: countResult[0].total };
}

/**
 * 回款合并视图（计划+记录）
 * @param {object} pool
 * @param {object} params - { page, pageSize, keyword, start_date, end_date }
 * @returns {{ list: Array, total: number }}
 */
async function getMergedPayments(pool, params = {}) {
  const { page = 1, pageSize = 20, keyword, start_date, end_date } = params;
  const offset = (page - 1) * pageSize;
  const queryParams = [];

  let where = 'WHERE pp.deleted_at IS NULL';
  if (keyword) {
    where += ' AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)';
    queryParams.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (start_date) { where += ' AND pp.plan_date >= ?'; queryParams.push(start_date); }
  if (end_date) { where += ' AND pp.plan_date <= ?'; queryParams.push(end_date); }

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(DISTINCT pp.id) as total
     FROM crm_payment_plan pp
     JOIN crm_contract c ON pp.contract_id = c.id
     JOIN crm_customer cu ON c.customer_id = cu.id
     ${where}`, queryParams
  );

  const [rows] = await pool.query(`
    SELECT pp.id as plan_id, pp.contract_id, c.contract_no, cu.company_name,
           pp.plan_amount, pp.plan_date,
           COALESCE(SUM(p.pay_amount), 0) as paid_amount,
           (pp.plan_amount - COALESCE(SUM(p.pay_amount), 0)) as unpaid_amount,
           CASE
             WHEN COALESCE(SUM(p.pay_amount), 0) >= pp.plan_amount THEN 'completed'
             WHEN pp.plan_date < CURDATE() THEN 'overdue'
             ELSE 'pending'
           END as plan_status
    FROM crm_payment_plan pp
    JOIN crm_contract c ON pp.contract_id = c.id
    JOIN crm_customer cu ON c.customer_id = cu.id
    LEFT JOIN crm_payment p ON p.contract_id = pp.contract_id AND p.plan_id = pp.id AND p.deleted_at IS NULL
    ${where}
    GROUP BY pp.id
    ORDER BY pp.plan_date DESC
    LIMIT ? OFFSET ?
  `, [...queryParams, parseInt(pageSize), offset]);

  return { list: rows, total };
}

/**
 * 本月回款汇总
 * @param {object} pool
 * @returns {{ month_plan_total: number, month_paid_total: number, month_rate: number }}
 */
async function getMonthlySummary(pool) {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;

  const [[planTotal]] = await pool.query(
    "SELECT COALESCE(SUM(plan_amount), 0) as total FROM crm_payment_plan WHERE plan_date BETWEEN ? AND ? AND deleted_at IS NULL",
    [monthStart, monthEnd]
  );
  const [[paidTotal]] = await pool.query(
    "SELECT COALESCE(SUM(pay_amount), 0) as total FROM crm_payment WHERE pay_date BETWEEN ? AND ? AND deleted_at IS NULL",
    [monthStart, monthEnd]
  );

  const planVal = parseFloat(planTotal.total) || 0;
  const paidVal = parseFloat(paidTotal.total) || 0;
  const rate = planVal > 0 ? Math.round(paidVal / planVal * 100) : 0;

  return { month_plan_total: planVal, month_paid_total: paidVal, month_rate: rate };
}

/**
 * 客户对账汇总
 * @param {object} pool
 * @param {object} params - { page, pageSize, keyword }
 * @returns {{ list: Array, total: number }}
 */
async function getCustomerReconciliation(pool, params = {}) {
  const { page = 1, pageSize = 20, keyword } = params;
  const offset = (page - 1) * pageSize;
  const queryParams = [];

  let where = 'WHERE c.deleted_at IS NULL';
  if (keyword) {
    where += ' AND cu.company_name LIKE ?';
    queryParams.push(`%${keyword}%`);
  }

  const [countResult] = await pool.query(
    `SELECT COUNT(DISTINCT cu.id) as total
     FROM crm_contract c
     JOIN crm_customer cu ON c.customer_id = cu.id
     ${where}`,
    queryParams
  );

  const [list] = await pool.query(
    `SELECT cu.id as customer_id, cu.company_name,
            COUNT(DISTINCT c.id) as contract_count,
            COALESCE(SUM(c.amount), 0) as total_amount,
            COALESCE(SUM(cp.paid), 0) as paid_amount,
            COALESCE(SUM(c.amount), 0) - COALESCE(SUM(cp.paid), 0) as outstanding_amount
     FROM crm_contract c
     JOIN crm_customer cu ON c.customer_id = cu.id
     LEFT JOIN (
       SELECT contract_id, SUM(pay_amount) as paid
       FROM crm_payment WHERE deleted_at IS NULL
       GROUP BY contract_id
     ) cp ON cp.contract_id = c.id
     ${where}
     GROUP BY cu.id, cu.company_name
     HAVING total_amount > 0
     ORDER BY outstanding_amount DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, parseInt(pageSize), parseInt(offset)]
  );

  return { list, total: countResult[0].total };
}

module.exports = {
  recalculatePlanStatus,
  recalculatePlanStatusWithConn,
  createPaymentPlans,
  recordPayment,
  updatePayment,
  deletePayment,
  getOverduePayments,
  getMergedPayments,
  getMonthlySummary,
  getCustomerReconciliation
};
