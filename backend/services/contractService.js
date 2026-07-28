/**
 * 合同核心服务层
 * 从 routes/contract.js 提取的业务逻辑，供路由层复用
 */

const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

// 合同状态映射
const STATUS_MAP = { 1: '待执行', 2: '执行中', 3: '已完成', 4: '已取消' };

// 回款状态子查询条件
const PAYMENT_STATUS_CLAUSE = {
  overdue: `EXISTS (SELECT 1 FROM crm_payment_plan pp WHERE pp.contract_id = c.id AND pp.status = 'overdue')`,
  partial: `EXISTS (SELECT 1 FROM crm_payment p WHERE p.contract_id = c.id AND p.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM crm_payment_plan pp WHERE pp.contract_id = c.id AND pp.status != 'completed')`,
  completed: `EXISTS (SELECT 1 FROM crm_payment_plan pp WHERE pp.contract_id = c.id) AND NOT EXISTS (SELECT 1 FROM crm_payment_plan pp WHERE pp.contract_id = c.id AND pp.status != 'completed')`,
  pending: `NOT EXISTS (SELECT 1 FROM crm_payment p WHERE p.contract_id = c.id AND p.deleted_at IS NULL)`
};

/**
 * 查询合同列表（分页、筛选）
 * @param {object} pool
 * @param {object} params - { page, pageSize, keyword, status, customer_id, approval_status, payment_status }
 * @param {object} [permission] - { clause, params } 数据权限片段
 * @returns {{ list: Array, total: number }}
 */
async function listContracts(pool, params = {}, permission = null) {
  const {
    page = 1,
    pageSize = 10,
    keyword = '',
    status = '',
    customer_id = '',
    approval_status = '',
    payment_status = ''
  } = params;

  const offset = (page - 1) * pageSize;

  let permissionClause = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionClause = permission.clause;
    permParams = permission.params || [];
  }

  // 查询
  let sql = `SELECT c.id, c.contract_no, c.customer_id, c.opportunity_id, c.quote_id, c.amount, c.currency, c.exchange_rate,
    c.sign_date, c.delivery_date, c.payment_terms, c.status, c.approval_status, c.approver_id, c.approval_remark,
    c.remark, c.file_url, c.create_by, c.create_time, c.deleted_at,
    cu.company_name as customer_name, u.real_name as create_by_name,
    (SELECT COALESCE(SUM(p.pay_amount), 0) FROM crm_payment p WHERE p.contract_id = c.id AND p.deleted_at IS NULL) as paid_amount,
    (SELECT COALESCE(SUM(pp.plan_amount), 0) FROM crm_payment_plan pp WHERE pp.contract_id = c.id) as plan_total,
    cur.symbol as currency_symbol
    FROM crm_contract c
    LEFT JOIN crm_customer cu ON c.customer_id = cu.id
    LEFT JOIN sys_user u ON c.create_by = u.id
    LEFT JOIN crm_currency cur ON c.currency = cur.code COLLATE utf8mb4_unicode_ci
    WHERE c.deleted_at IS NULL AND ${permissionClause}`;

  const queryParams = [...permParams];

  if (keyword) {
    sql += ' AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)';
    queryParams.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (status) {
    sql += ' AND c.status = ?';
    queryParams.push(status);
  }
  if (customer_id) {
    sql += ' AND c.customer_id = ?';
    queryParams.push(customer_id);
  }
  if (approval_status) {
    sql += ' AND c.approval_status = ?';
    queryParams.push(approval_status);
  }
  if (payment_status && PAYMENT_STATUS_CLAUSE[payment_status]) {
    sql += ` AND ${PAYMENT_STATUS_CLAUSE[payment_status]}`;
  }

  sql += ' ORDER BY c.create_time DESC LIMIT ?, ?';
  queryParams.push(offset, pageSize);
  const [rows] = await pool.query(sql, queryParams);

  // 计数
  let countSql = `SELECT COUNT(*) as total FROM crm_contract c
    LEFT JOIN crm_customer cu ON c.customer_id = cu.id
    WHERE c.deleted_at IS NULL AND ${permissionClause}`;
  const countParams = [...permParams];

  if (keyword) {
    countSql += ' AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)';
    countParams.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (status) {
    countSql += ' AND c.status = ?';
    countParams.push(status);
  }
  if (customer_id) {
    countSql += ' AND c.customer_id = ?';
    countParams.push(customer_id);
  }
  if (approval_status) {
    countSql += ' AND c.approval_status = ?';
    countParams.push(approval_status);
  }
  if (payment_status && PAYMENT_STATUS_CLAUSE[payment_status]) {
    countSql += ` AND ${PAYMENT_STATUS_CLAUSE[payment_status]}`;
  }

  const [countResult] = await pool.query(countSql, countParams);

  return { list: rows, total: countResult[0].total };
}

/**
 * 获取合同详情（含回款计划、回款记录、已回金额）
 * @param {object} pool
 * @param {number} contractId
 * @returns {object|null}
 */
async function getContract(pool, contractId) {
  const [contract] = await pool.query(`
    SELECT c.id, c.contract_no, c.customer_id, c.opportunity_id, c.quote_id, c.amount, c.currency, c.exchange_rate,
      c.sign_date, c.delivery_date, c.payment_terms, c.status, c.approval_status, c.approver_id, c.approval_remark,
      c.remark, c.file_url, c.create_by, c.create_time, c.deleted_at,
      cu.company_name as customer_name, pc.name as contact, pc.phone, cu.address,
      u.real_name as create_by_name
    FROM crm_contract c
    LEFT JOIN crm_customer cu ON c.customer_id = cu.id
    LEFT JOIN crm_contact pc ON pc.customer_id = cu.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
    LEFT JOIN sys_user u ON c.create_by = u.id
    WHERE c.id = ? AND c.deleted_at IS NULL
  `, [contractId]);

  if (!contract.length) return null;

  const [plans] = await pool.query(
    `SELECT id, contract_id, plan_date, plan_amount, status, remark, create_time, update_time
     FROM crm_payment_plan WHERE contract_id = ? ORDER BY plan_date`,
    [contractId]
  );

  const [payments] = await pool.query(`
    SELECT p.id, p.contract_id, p.plan_id, p.pay_date, p.pay_amount, p.pay_method, p.remark, p.create_time, p.deleted_at,
      pp.plan_date, pp.plan_amount
    FROM crm_payment p
    LEFT JOIN crm_payment_plan pp ON p.plan_id = pp.id
    WHERE p.contract_id = ?
    ORDER BY p.pay_date DESC
  `, [contractId]);

  const paidTotal = payments.reduce((sum, p) => sum + parseFloat(p.pay_amount || 0), 0);
  const planTotal = plans.reduce((sum, p) => sum + parseFloat(p.plan_amount || 0), 0);

  return {
    ...contract[0],
    plans,
    payments,
    paid_amount: paidTotal,
    plan_total: planTotal
  };
}

/**
 * 创建合同（事务保护，含回款计划）
 * @param {object} pool
 * @param {object} data - { customer_id, opportunity_id, amount, sign_date, delivery_date, payment_terms, remark, plans }
 * @param {number} createBy
 * @returns {{ id: number, contract_no: string }}
 */
async function createContract(pool, data, createBy) {
  const { customer_id, opportunity_id, quote_id, amount, sign_date, delivery_date, payment_terms, remark, plans } = data;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 校验客户必须是正式客户（status=2）
    const [customerCheck] = await connection.query(
      'SELECT id, status, company_name FROM crm_customer WHERE id = ? AND status != 0',
      [customer_id]
    );
    if (customerCheck.length === 0) {
      throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND);
    }
    if (customerCheck[0].status !== 2) {
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '只能为正式客户创建合同，请先将客户转化为正式客户');
    }

    // 4-3-4: 传入 opportunity_id 时校验商机存在且属于同一客户
    if (opportunity_id) {
      const [opps] = await connection.query(
        'SELECT id, customer_id FROM crm_opportunity WHERE id = ? AND deleted_at IS NULL',
        [opportunity_id]
      );
      if (opps.length === 0) {
        throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '关联的商机不存在');
      }
      if (opps[0].customer_id !== customer_id) {
        throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '商机与客户不匹配，无法关联');
      }
    }

    // 生成合同编号
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const [count] = await connection.query('SELECT COUNT(*) as cnt FROM crm_contract WHERE contract_no LIKE ? FOR UPDATE', [`CON-${dateStr}-%`]);
    const seq = String(count[0].cnt + 1).padStart(3, '0');
    const contractNo = `CON-${dateStr}-${seq}`;

    const [result] = await connection.query(
      'INSERT INTO crm_contract (contract_no, customer_id, opportunity_id, quote_id, amount, sign_date, delivery_date, payment_terms, remark, create_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [contractNo, customer_id, opportunity_id || null, quote_id || null, amount, sign_date, delivery_date, payment_terms, remark, createBy]
    );

    const contractId = result.insertId;

    // 批量插入回款计划
    if (plans && plans.length > 0) {
      const placeholders = plans.map(() => '(?, ?, ?, ?)').join(', ');
      const flatValues = plans.flatMap(p => [contractId, p.plan_date, p.plan_amount, p.remark || null]);
      await connection.query(`INSERT INTO crm_payment_plan (contract_id, plan_date, plan_amount, remark) VALUES ${placeholders}`, flatValues);
    }

    await connection.commit();
    return { id: contractId, contract_no: contractNo };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 计算合同金额统计
 * @param {object} pool
 * @param {number} contractId
 * @returns {{ amount: number, paid_amount: number, plan_total: number, remaining: number, progress: number }}
 */
async function calculateAmount(pool, contractId) {
  const [contracts] = await pool.query(
    'SELECT amount FROM crm_contract WHERE id = ? AND deleted_at IS NULL',
    [contractId]
  );
  if (!contracts.length) return null;

  const amount = parseFloat(contracts[0].amount || 0);

  const [paidRows] = await pool.query(
    'SELECT COALESCE(SUM(pay_amount), 0) as total FROM crm_payment WHERE contract_id = ? AND deleted_at IS NULL',
    [contractId]
  );
  const paidAmount = parseFloat(paidRows[0].total);

  const [planRows] = await pool.query(
    'SELECT COALESCE(SUM(plan_amount), 0) as total FROM crm_payment_plan WHERE contract_id = ?',
    [contractId]
  );
  const planTotal = parseFloat(planRows[0].total);

  const remaining = amount - paidAmount;
  const progress = amount > 0 ? Math.round((paidAmount / amount) * 100) : 0;

  return { amount, paid_amount: paidAmount, plan_total: planTotal, remaining, progress };
}

/**
 * 合同状态流转（状态码变更）
 * @param {object} pool
 * @param {number} contractId
 * @param {number} newStatus - 1:待执行 2:执行中 3:已完成 4:已取消
 * @returns {boolean}
 */
async function updateContractStatus(pool, contractId, newStatus) {
  const [contracts] = await pool.query(
    'SELECT id, status FROM crm_contract WHERE id = ? AND deleted_at IS NULL',
    [contractId]
  );
  if (!contracts.length) {
    throw new AppError(ErrorCodes.CONTRACT_NOT_FOUND);
  }

  if (contracts[0].status === 3 && newStatus !== 3) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '已完成的合同不能变更状态');
  }

  await pool.query('UPDATE crm_contract SET status = ? WHERE id = ?', [newStatus, contractId]);
  return true;
}

/**
 * 回款进度计算：统计指定合同的回款完成率
 * @param {object} pool
 * @param {number} contractId
 * @returns {{ plans: Array, total_plan: number, total_paid: number, rate: number, overdue_count: number }}
 */
async function getPaymentProgress(pool, contractId) {
  const [plans] = await pool.query(
    `SELECT id, contract_id, plan_date, plan_amount, status, remark, create_time, update_time
     FROM crm_payment_plan WHERE contract_id = ? ORDER BY plan_date`,
    [contractId]
  );

  const totalPlan = plans.reduce((sum, p) => sum + parseFloat(p.plan_amount || 0), 0);

  const [paidRows] = await pool.query(
    'SELECT COALESCE(SUM(pay_amount), 0) as total FROM crm_payment WHERE contract_id = ? AND deleted_at IS NULL',
    [contractId]
  );
  const totalPaid = parseFloat(paidRows[0].total);

  const rate = totalPlan > 0 ? Math.round((totalPaid / totalPlan) * 100) : 0;

  const overdueCount = plans.filter(p =>
    p.status !== 'completed' && new Date(p.plan_date) < new Date()
  ).length;

  return { plans, total_plan: totalPlan, total_paid: totalPaid, rate, overdue_count: overdueCount };
}

module.exports = {
  STATUS_MAP,
  PAYMENT_STATUS_CLAUSE,
  listContracts,
  getContract,
  createContract,
  calculateAmount,
  updateContractStatus,
  getPaymentProgress
};
