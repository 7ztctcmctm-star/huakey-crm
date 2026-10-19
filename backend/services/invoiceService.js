/**
 * 发票管理服务层
 * 从 routes/invoice.js 提取的业务逻辑
 */
const XLSX = require('xlsx');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

const { buildDataPermissionWhere } = require('../middleware/permission');
const { logFieldChanges } = require('../utils/fieldLog');
// 【P1-1】金额一律走 money 工具，禁止原生浮点运算。
const money = require('../utils/money');

const MODULE_NAME = '发票管理';
const { createRouteLogger } = require('../middleware/logger');
const logAction = createRouteLogger(MODULE_NAME);

/**
 * 获取发票列表
 */
async function listInvoices(pool, { page = 1, pageSize = 10, keyword, status, type, start_date, end_date }, dataPermission) {
  const offset = (page - 1) * pageSize;

  const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'i');

  let sql = `SELECT i.id, i.invoice_no, i.contract_id, i.customer_id, i.type, i.amount, i.tax_rate, i.tax_amount, i.invoice_date, i.status, i.remark, i.create_by, i.create_time, i.update_time, i.deleted_at, cu.company_name as customer_name, u.real_name as create_by_name
    FROM crm_invoice i
    LEFT JOIN crm_customer cu ON i.customer_id = cu.id
    LEFT JOIN sys_user u ON i.create_by = u.id
    WHERE i.deleted_at IS NULL AND ${permissionClause}`;
  const params = [...permParams];

  if (keyword) {
    sql += ' AND i.invoice_no LIKE ?';
    params.push(`%${keyword}%`);
  }
  if (status) {
    sql += ' AND i.status = ?';
    params.push(status);
  }
  if (type) {
    sql += ' AND i.type = ?';
    params.push(type);
  }
  if (start_date) {
    sql += ' AND i.invoice_date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    sql += ' AND i.invoice_date <= ?';
    params.push(end_date);
  }

  const countSql = sql.replace(/SELECT[\s\S]*FROM/, 'SELECT COUNT(*) as total FROM').replace(/ORDER BY[\s\S]*/, '');
  const [countResult] = await pool.query(countSql, params);

  sql += ' ORDER BY i.create_time DESC LIMIT ?, ?';
  params.push(offset, pageSize);

  const [rows] = await pool.query(sql, params);

  return { list: rows, total: countResult[0].total };
}

/**
 * 获取发票详情
 */
async function getInvoice(pool, id) {
  const [rows] = await pool.query(
    `SELECT i.id, i.invoice_no, i.contract_id, i.customer_id, i.type, i.amount, i.tax_rate, i.tax_amount, i.invoice_date, i.status, i.remark, i.create_by, i.create_time, i.update_time, i.deleted_at, cu.company_name as customer_name, u.real_name as create_by_name
     FROM crm_invoice i
     LEFT JOIN crm_customer cu ON i.customer_id = cu.id
     LEFT JOIN sys_user u ON i.create_by = u.id
     WHERE i.id = ? AND i.deleted_at IS NULL`,
    [id]
  );

  if (rows.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '发票不存在');
  }

  return rows[0];
}

// 发票编号冲突时的重算重试次数（见 createInvoice 说明）
const INVOICE_NO_MAX_ATTEMPTS = 3;

/**
 * 生成当日下一个发票编号 INV-YYMMDD-NNN
 *
 * 用「当日已用最大序号 + 1」而非 COUNT + 1：中间编号被删除/作废后，
 * COUNT + 1 会重新撞上仍然存在的编号（如 001/002/003 删掉 002 后 COUNT=2 → 生成 003）。
 * FOR UPDATE 对当日编号区间加 next-key lock，串行化并发分配。
 *
 * @param {object} connection - 事务连接
 * @param {string} dateStr - YYMMDD
 * @returns {Promise<string>} 发票编号
 */
async function nextInvoiceNo(connection, dateStr) {
  const [rows] = await connection.query(
    'SELECT invoice_no FROM crm_invoice WHERE invoice_no LIKE ? FOR UPDATE',
    [`INV-${dateStr}-%`]
  );
  let maxSeq = 0;
  for (const row of rows || []) {
    const seq = parseInt(String(row.invoice_no).split('-').pop(), 10);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }
  return `INV-${dateStr}-${String(maxSeq + 1).padStart(3, '0')}`;
}

/**
 * 服务端校验并归一化发票金额三元组（amount / tax_rate / tax_amount）。
 *
 * 为什么不让客户端自己算：前端若用浮点算税额（amount * rate / 100），尾数会直接
 * 写进 DECIMAL(15,2)（MySQL 只按 2 位四舍五入，无法纠正已偏掉的尾数），而且
 * 金额/税率/税额三者一旦自相矛盾，事后对账无从追溯——这类错误重发请求也不会自愈，
 * 所以是 422 而不是 400。
 *
 * 规则（tax_rate 是百分数：13 表示 13%，与 crm_invoice.tax_rate 注释「税率(%)」一致）：
 *   · 给了税率 → 税额一律由服务端按 money.percentOf 精确计算；客户端也传了就必须一致，否则 422
 *   · 给了税率、没给税额 → 服务端补齐
 *   · 没给税率 → 没有校验基准，税额按客户端传入精确取整（缺失则 null）
 *
 * @returns {{amount: number, tax_rate: number|null, tax_amount: number|null}}
 */
function normalizeInvoiceAmounts(amount, tax_rate, tax_amount) {
  const normAmount = money.round2(amount);
  const hasRate = !(tax_rate === undefined || tax_rate === null || tax_rate === '');

  if (!hasRate) {
    const clientTax = (tax_amount === undefined || tax_amount === null || tax_amount === '')
      ? null
      : money.round2(tax_amount);
    return { amount: normAmount, tax_rate: null, tax_amount: clientTax };
  }

  const rate = Number(tax_rate);
  const expectedTax = money.percentOf(normAmount, rate);

  const hasClientTax = !(tax_amount === undefined || tax_amount === null || tax_amount === '');
  if (hasClientTax && money.round2(tax_amount) !== expectedTax) {
    throw new AppError(
      ErrorCodes.INVOICE_TAX_MISMATCH,
      `税额与「金额 × 税率」不一致：金额 ${normAmount} × ${rate}% 应为 ${expectedTax}，实收 ${money.round2(tax_amount)}`
    );
  }

  return { amount: normAmount, tax_rate: rate, tax_amount: expectedTax };
}

/**
 * 新增发票
 *
 * 迁移 123 给 invoice_no 加了唯一键，编号冲突会以 ER_DUP_ENTRY 形式暴露。
 * 并发分配或历史编号空洞导致的偶发冲突在此重算序号重试，
 * 重试耗尽则冒泡 ER_DUP_ENTRY，由 errorHandler 统一映射为 409（不新增 controller 分支）。
 *
 * @param {object} pool
 * @param {object} payload - { contract_id, customer_id, type, amount, tax_rate, tax_amount, invoice_date, status, remark, idempotency_key? }
 * @param {number} userId
 * @param {string} [idempotencyKey] - 幂等键（B2 · 2026-10-19 新增）
 *   双击开票 / 网络重试时，同一 key 重放返回**首次**创建的发票（不会开出第二张票）。
 */
async function createInvoice(pool, { contract_id, customer_id, type, amount, tax_rate, tax_amount, invoice_date, status, remark }, userId, idempotencyKey) {
  // 先校验再开事务：金额自相矛盾时不必占着连接
  const amounts = normalizeInvoiceAmounts(amount, tax_rate, tax_amount);

  const { runIdempotent } = require('../utils/idempotency');
  const { result } = await runIdempotent(pool, idempotencyKey, 'invoice_create', () =>
    insertInvoiceWithRetry(pool, { contract_id, customer_id, type, invoice_date, status, remark }, amounts, userId)
  );
  return result;
}

async function insertInvoiceWithRetry(pool, { contract_id, customer_id, type, invoice_date, status, remark }, amounts, userId) {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  let lastError = null;

  for (let attempt = 1; attempt <= INVOICE_NO_MAX_ATTEMPTS; attempt++) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const invoiceNo = await nextInvoiceNo(connection, dateStr);

      const [result] = await connection.query(
        `INSERT INTO crm_invoice (invoice_no, contract_id, customer_id, type, amount, tax_rate, tax_amount, invoice_date, status, remark, create_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [invoiceNo, contract_id, customer_id, type, amounts.amount, amounts.tax_rate, amounts.tax_amount, invoice_date || null, status || 1, remark || null, userId]
      );

      await connection.commit();
      await logAction({ user: { userId }, ip: '' }, 'add', `新增发票: ${invoiceNo}`);

      return { id: result.insertId, invoice_no: invoiceNo };
    } catch (error) {
      await connection.rollback();
      if (error && error.code === 'ER_DUP_ENTRY' && attempt < INVOICE_NO_MAX_ATTEMPTS) {
        lastError = error;
        continue; // 编号冲突：释放连接后重算序号再试
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  throw lastError;
}

/**
 * 编辑发票
 */
async function updateInvoice(pool, { id, contract_id, customer_id, type, amount, tax_rate, tax_amount, invoice_date, status, remark }, req) {
  // 与 createInvoice 同一口径：税额必须与「金额 × 税率」一致
  const amounts = normalizeInvoiceAmounts(amount, tax_rate, tax_amount);

  const [oldRows] = await pool.query('SELECT id, invoice_no, contract_id, customer_id, type, amount, tax_rate, tax_amount, invoice_date, status, remark, create_by, create_time, update_time, deleted_at FROM crm_invoice WHERE id = ? AND deleted_at IS NULL', [id]);
  if (oldRows.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '发票不存在');
  }
  const oldData = oldRows[0];

  await pool.query(
    `UPDATE crm_invoice SET contract_id=?, customer_id=?, type=?, amount=?, tax_rate=?, tax_amount=?, invoice_date=?, status=?, remark=? WHERE id=?`,
    [contract_id, customer_id, type, amounts.amount, amounts.tax_rate, amounts.tax_amount, invoice_date || null, status || 1, remark || null, id]
  );

  await logAction(req, 'update', `修改发票: ID=${id}`);
  await logFieldChanges(req, {
    module: MODULE_NAME,
    action: '编辑发票',
    oldData,
    newData: req.body,
    allowedFields: ['invoice_no', 'customer_id', 'type', 'status', 'amount', 'tax_amount', 'total_amount', 'remark', 'due_date'],
    description: `编辑发票: ${oldData.invoice_no || id}`
  });
}

/**
 * 删除发票（软删除）
 */
async function deleteInvoice(pool, { id }, req) {
  const [rows] = await pool.query('SELECT id FROM crm_invoice WHERE id = ? AND deleted_at IS NULL', [id]);
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '发票不存在');
  }

  await pool.query('UPDATE crm_invoice SET deleted_at = NOW() WHERE id = ?', [id]);
  await logAction(req, 'delete', `删除发票: ID=${id}`);
}

/**
 * 导出发票
 */
async function exportInvoices(pool, { keyword = '', status = '', type = '' }, dataPermission, req) {
  const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'i');

  let sql = `SELECT i.invoice_no, cu.company_name as customer_name, i.type, i.amount,
    i.tax_rate, i.tax_amount, i.invoice_date, i.status, i.remark,
    u.real_name as create_by_name, i.create_time
    FROM crm_invoice i
    LEFT JOIN crm_customer cu ON i.customer_id = cu.id
    LEFT JOIN sys_user u ON i.create_by = u.id
    WHERE i.deleted_at IS NULL AND ${permissionClause}`;
  const params = [...permParams];

  if (keyword) { sql += ' AND i.invoice_no LIKE ?'; params.push(`%${keyword}%`); }
  if (status) { sql += ' AND i.status = ?'; params.push(status); }
  if (type) { sql += ' AND i.type = ?'; params.push(type); }

  sql += ' ORDER BY i.create_time DESC LIMIT 10000';

  const [rows] = await pool.query(sql, params);

  const typeMap = { 1: '增值税普票', 2: '增值税专票', 3: '电子发票' };
  const statusMap = { 1: '待开票', 2: '已开票', 3: '已邮寄', 4: '已作废' };

  const exportData = rows.map(row => ({
    '发票编号': row.invoice_no,
    '客户名称': row.customer_name || '',
    '发票类型': typeMap[row.type] || '',
    '发票金额': parseFloat(row.amount || 0),
    '税率(%)': row.tax_rate != null ? parseFloat(row.tax_rate) : '',
    '税额': row.tax_amount != null ? parseFloat(row.tax_amount) : '',
    '开票日期': row.invoice_date || '',
    '状态': statusMap[row.status] || '',
    '备注': row.remark || '',
    '创建人': row.create_by_name || '',
    '创建时间': row.create_time || ''
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportData);
  XLSX.utils.book_append_sheet(wb, ws, '发票列表');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  await logAction(req, 'export', `导出发票 ${rows.length} 条`);

  return buf;
}

module.exports = {
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  exportInvoices
};
