/**
 * 合同回款路由服务层
 * 从 routes/contract/payment.js 提取的业务逻辑，供路由层复用
 */

const ROLES = require('../config/roles');
const paymentService = require('./paymentService');
const XLSX = require('xlsx');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

/**
 * 检查用户对合同的操作权限
 * @param {object} pool
 * @param {number} contractId
 * @param {object} user - { manageAll, roleId, userId }
 * @param {string} action - 操作描述
 */
async function checkContractPermission(pool, contractId, user, action) {
  const [contracts] = await pool.query('SELECT create_by FROM crm_contract WHERE id=? AND deleted_at IS NULL', [contractId]);
  if (!contracts.length) {
    throw new AppError(ErrorCodes.CONTRACT_NOT_FOUND, '所属合同不存在');
  }
  const { manageAll, roleId, userId } = user;
  if (!manageAll && ![ROLES.ADMIN, ROLES.MANAGER].includes(roleId) && contracts[0].create_by !== userId) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, `无权${action}该回款记录`);
  }
  return contracts[0];
}

/**
 * 登记回款
 * @param {object} pool
 * @param {object} data - { contract_id, plan_id, pay_date, pay_amount, pay_method, remark }
 * @param {object} user
 */
async function addPayment(pool, data, user) {
  const { contract_id, plan_id, pay_date, pay_amount, pay_method, remark } = data;
  await checkContractPermission(pool, contract_id, user, '为该合同登记回款');
  await paymentService.recordPayment(pool, { contract_id, plan_id, pay_date, pay_amount, pay_method, remark });
}

/**
 * 修改回款记录
 * @param {object} pool
 * @param {object} data - { id, pay_date, pay_amount, pay_method, remark }
 * @param {object} user
 */
async function updatePayment(pool, data, user) {
  const { id, pay_date, pay_amount, pay_method, remark } = data;

  const [oldPayment] = await pool.query('SELECT plan_id, contract_id FROM crm_payment WHERE id = ? AND deleted_at IS NULL', [id]);
  if (oldPayment.length) {
    await checkContractPermission(pool, oldPayment[0].contract_id, user, '修改');
  }

  await paymentService.updatePayment(pool, { id, pay_date, pay_amount, pay_method, remark });
}

/**
 * 删除回款记录
 * @param {object} pool
 * @param {number|string} paymentId
 * @param {object} user
 */
async function deletePayment(pool, paymentId, user) {
  const [payments] = await pool.query('SELECT contract_id, plan_id FROM crm_payment WHERE id=? AND deleted_at IS NULL', [paymentId]);
  if (!payments.length) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '回款记录不存在');
  }

  await checkContractPermission(pool, payments[0].contract_id, user, '删除');

  await paymentService.deletePayment(pool, paymentId);
}

/**
 * 回款列表
 * @param {object} pool
 * @param {object} params - { page, pageSize, tab, keyword, start_date, end_date }
 * @returns {{ list: Array, total: number, summary?: object }}
 */
async function listPayments(pool, params = {}) {
  const { page = 1, pageSize = 20, tab = 'all', keyword, start_date, end_date } = params;
  const offset = (page - 1) * pageSize;
  const queryParams = [];

  if (tab === 'overdue') {
    const result = await paymentService.getOverduePayments(pool, { page, pageSize, keyword });
    return { list: result.list, total: result.total, page: parseInt(page), pageSize: parseInt(pageSize) };
  }

  if (tab === 'summary') {
    const summary = await paymentService.getMonthlySummary(pool);
    return { list: [], total: 0, page: 1, pageSize: 1, summary };
  }

  // tab === 'all'
  let where = 'WHERE p.deleted_at IS NULL';
  if (keyword) {
    where += ' AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)';
    queryParams.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (start_date) {
    where += ' AND p.pay_date >= ?';
    queryParams.push(start_date);
  }
  if (end_date) {
    where += ' AND p.pay_date <= ?';
    queryParams.push(end_date);
  }

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total
     FROM crm_payment p
     JOIN crm_contract c ON p.contract_id = c.id
     JOIN crm_customer cu ON c.customer_id = cu.id
     ${where}`, queryParams
  );

  const [list] = await pool.query(
    `SELECT p.id, p.contract_id, c.contract_no, cu.company_name,
            p.pay_date, p.pay_amount, p.pay_method, p.remark, p.create_time
     FROM crm_payment p
     JOIN crm_contract c ON p.contract_id = c.id
     JOIN crm_customer cu ON c.customer_id = cu.id
     ${where}
     ORDER BY p.pay_date DESC, p.id DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, parseInt(pageSize), parseInt(offset)]
  );

  return { list, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

/**
 * 回款合并视图
 * @param {object} pool
 * @param {object} params - { page, pageSize, keyword, start_date, end_date }
 * @returns {{ list: Array, total: number }}
 */
async function getMergedPayments(pool, params = {}) {
  return paymentService.getMergedPayments(pool, params);
}

/**
 * 回款列表导出
 * @param {object} pool
 * @param {object} params - { keyword, start_date, end_date }
 * @returns {Buffer} XLSX buffer
 */
async function exportPayments(pool, params = {}) {
  const { keyword, start_date, end_date } = params;
  const queryParams = [];

  let where = 'WHERE p.deleted_at IS NULL';
  if (keyword) {
    where += ' AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)';
    queryParams.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (start_date) { where += ' AND p.pay_date >= ?'; queryParams.push(start_date); }
  if (end_date) { where += ' AND p.pay_date <= ?'; queryParams.push(end_date); }

  const [rows] = await pool.query(
    `SELECT c.contract_no, cu.company_name,
            p.pay_date, p.pay_amount, p.pay_method, p.remark
     FROM crm_payment p
     JOIN crm_contract c ON p.contract_id = c.id
     JOIN crm_customer cu ON c.customer_id = cu.id
     ${where}
     ORDER BY p.pay_date DESC`,
    queryParams
  );

  const data = rows.map(r => ({
    '合同编号': r.contract_no,
    '客户名称': r.company_name,
    '回款日期': r.pay_date,
    '回款金额': parseFloat(r.pay_amount),
    '回款方式': r.pay_method || '',
    '备注': r.remark || ''
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, '回款列表');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * 本月回款汇总
 * @param {object} pool
 * @returns {{ month_plan_total: number, month_paid_total: number, month_rate: number }}
 */
async function getSummary(pool) {
  return paymentService.getMonthlySummary(pool);
}

/**
 * 对账单导出
 * @param {object} pool
 * @param {object} params - { keyword, start_date, end_date }
 * @returns {Buffer} XLSX buffer
 */
async function getStatementExport(pool, params = {}) {
  const { keyword, start_date, end_date } = params;

  let where = 'WHERE c.deleted_at IS NULL AND c.status IN (1,2,3)';
  const queryParams = [];
  if (keyword) {
    where += ' AND cu.company_name LIKE ?';
    queryParams.push(`%${keyword}%`);
  }

  const [summaryRows] = await pool.query(
    `SELECT cu.company_name, pc.name as contact_name, pc.phone,
            COUNT(DISTINCT c.id) as contract_count,
            COALESCE(SUM(c.amount), 0) as total_amount,
            COALESCE(SUM(cp.paid), 0) as paid_amount,
            COALESCE(SUM(c.amount), 0) - COALESCE(SUM(cp.paid), 0) as outstanding_amount
     FROM crm_contract c
     JOIN crm_customer cu ON c.customer_id = cu.id
     LEFT JOIN crm_contact pc ON pc.customer_id = cu.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
     LEFT JOIN (
       SELECT contract_id, SUM(pay_amount) as paid
       FROM crm_payment WHERE deleted_at IS NULL GROUP BY contract_id
     ) cp ON cp.contract_id = c.id
     ${where}
     GROUP BY cu.id, cu.company_name, pc.name, pc.phone
     HAVING total_amount > 0
     ORDER BY outstanding_amount DESC`,
    queryParams
  );

  const summaryData = summaryRows.map(r => ({
    '客户名称': r.company_name,
    '联系人': r.contact_name || '',
    '电话': r.phone || '',
    '合同数': r.contract_count,
    '合同总额': parseFloat(r.total_amount),
    '已回款': parseFloat(r.paid_amount),
    '未回款': parseFloat(r.outstanding_amount),
    '回款率': r.total_amount > 0 ? Math.round(parseFloat(r.paid_amount) / parseFloat(r.total_amount) * 100) + '%' : '100%'
  }));

  let detailWhere = 'WHERE c.deleted_at IS NULL AND p.deleted_at IS NULL';
  const detailParams = [];
  if (keyword) {
    detailWhere += ' AND cu.company_name LIKE ?';
    detailParams.push(`%${keyword}%`);
  }
  if (start_date) {
    detailWhere += ' AND p.pay_date >= ?';
    detailParams.push(start_date);
  }
  if (end_date) {
    detailWhere += ' AND p.pay_date <= ?';
    detailParams.push(end_date);
  }

  const [detailRows] = await pool.query(
    `SELECT cu.company_name, c.contract_no, c.amount as contract_amount,
            pp.plan_date, pp.plan_amount,
            p.pay_date, p.pay_amount, p.pay_method, p.remark
     FROM crm_payment p
     JOIN crm_contract c ON p.contract_id = c.id
     JOIN crm_customer cu ON c.customer_id = cu.id
     LEFT JOIN crm_payment_plan pp ON p.plan_id = pp.id
     ${detailWhere}
     ORDER BY cu.company_name, c.contract_no, p.pay_date`,
    detailParams
  );

  const detailData = detailRows.map(r => ({
    '客户名称': r.company_name,
    '合同编号': r.contract_no,
    '合同金额': parseFloat(r.contract_amount),
    '计划日期': r.plan_date || '-',
    '计划金额': r.plan_amount ? parseFloat(r.plan_amount) : '-',
    '回款日期': r.pay_date,
    '回款金额': parseFloat(r.pay_amount),
    '回款方式': r.pay_method || '',
    '备注': r.remark || ''
  }));

  const wb = XLSX.utils.book_new();
  if (summaryData.length > 0) {
    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws1, '客户汇总');
  }
  if (detailData.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(detailData);
    XLSX.utils.book_append_sheet(wb, ws2, '回款明细');
  }

  return { buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), summaryCount: summaryRows.length, detailCount: detailRows.length };
}

module.exports = {
  addPayment,
  updatePayment,
  deletePayment,
  listPayments,
  getMergedPayments,
  exportPayments,
  getSummary,
  getStatementExport
};
