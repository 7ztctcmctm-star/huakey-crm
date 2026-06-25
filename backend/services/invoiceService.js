/**
 * 发票管理服务层
 * 从 routes/invoice.js 提取的业务逻辑
 */
const XLSX = require('xlsx');

const { buildDataPermissionWhere } = require('../middleware/permission');
const { logFieldChanges } = require('../utils/fieldLog');

const MODULE_NAME = '发票管理';
const { createRouteLogger } = require('../middleware/logger');
const logAction = createRouteLogger(MODULE_NAME);

/**
 * 获取发票列表
 */
async function listInvoices(pool, { page = 1, pageSize = 10, keyword, status, type, start_date, end_date }, dataPermission) {
  const offset = (page - 1) * pageSize;

  const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'i');

  let sql = `SELECT i.*, cu.company_name as customer_name, u.real_name as create_by_name
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
    `SELECT i.*, cu.company_name as customer_name, u.real_name as create_by_name
     FROM crm_invoice i
     LEFT JOIN crm_customer cu ON i.customer_id = cu.id
     LEFT JOIN sys_user u ON i.create_by = u.id
     WHERE i.id = ? AND i.deleted_at IS NULL`,
    [id]
  );

  if (rows.length === 0) {
    const err = new Error('发票不存在');
    err.statusCode = 404;
    throw err;
  }

  return rows[0];
}

/**
 * 新增发票
 */
async function createInvoice(pool, { contract_id, customer_id, type, amount, tax_rate, tax_amount, invoice_date, status, remark }, userId) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const [count] = await connection.query(
      'SELECT COUNT(*) as cnt FROM crm_invoice WHERE invoice_no LIKE ? FOR UPDATE',
      [`INV-${dateStr}-%`]
    );
    const seq = String(count[0].cnt + 1).padStart(3, '0');
    const invoiceNo = `INV-${dateStr}-${seq}`;

    const [result] = await connection.query(
      `INSERT INTO crm_invoice (invoice_no, contract_id, customer_id, type, amount, tax_rate, tax_amount, invoice_date, status, remark, create_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceNo, contract_id, customer_id, type, amount, tax_rate || null, tax_amount || null, invoice_date || null, status || 1, remark || null, userId]
    );

    await connection.commit();
    await logAction({ user: { userId }, ip: '' }, 'add', `新增发票: ${invoiceNo}`);

    return { id: result.insertId, invoice_no: invoiceNo };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 编辑发票
 */
async function updateInvoice(pool, { id, contract_id, customer_id, type, amount, tax_rate, tax_amount, invoice_date, status, remark }, req) {
  const [oldRows] = await pool.query('SELECT * FROM crm_invoice WHERE id = ? AND deleted_at IS NULL', [id]);
  if (oldRows.length === 0) {
    const err = new Error('发票不存在');
    err.statusCode = 404;
    throw err;
  }
  const oldData = oldRows[0];

  await pool.query(
    `UPDATE crm_invoice SET contract_id=?, customer_id=?, type=?, amount=?, tax_rate=?, tax_amount=?, invoice_date=?, status=?, remark=? WHERE id=?`,
    [contract_id, customer_id, type, amount, tax_rate || null, tax_amount || null, invoice_date || null, status || 1, remark || null, id]
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
    const err = new Error('发票不存在');
    err.statusCode = 404;
    throw err;
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
