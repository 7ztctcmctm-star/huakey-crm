/**
 * 合同导出/导入服务层
 * 从 routes/contract/export.js 提取的业务逻辑
 */
const XLSX = require('xlsx');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');
const { buildDataPermissionWhere } = require('../middleware/permission');
/**
 * 导出合同列表
 */
async function exportContracts(pool, { keyword = '', status = '' }, dataPermission) {
  const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'c');

  let sql = `SELECT c.contract_no, cu.company_name as customer_name, c.amount,
    (SELECT COALESCE(SUM(p.pay_amount), 0) FROM crm_payment p WHERE p.contract_id = c.id AND p.deleted_at IS NULL) as paid_amount,
    c.sign_date, c.delivery_date, c.status, c.payment_terms, c.remark,
    u.real_name as create_by_name, c.create_time
    FROM crm_contract c
    LEFT JOIN crm_customer cu ON c.customer_id = cu.id
    LEFT JOIN sys_user u ON c.create_by = u.id
    WHERE c.deleted_at IS NULL AND ${permissionClause}`;
  const params = [...permParams];

  if (keyword) { sql += ' AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
  if (status) { sql += ' AND c.status = ?'; params.push(status); }

  sql += ' ORDER BY c.create_time DESC LIMIT 10000';

  const [rows] = await pool.query(sql, params);

  const statusMap = { 1: '待执行', 2: '执行中', 3: '已完成', 4: '已取消' };
  const exportData = rows.map(row => ({
    '合同编号': row.contract_no,
    '客户名称': row.customer_name || '',
    '合同金额': parseFloat(row.amount || 0),
    '已回款': parseFloat(row.paid_amount || 0),
    '签订日期': row.sign_date || '',
    '交付日期': row.delivery_date || '',
    '状态': statusMap[row.status] || '',
    '付款条款': row.payment_terms || '',
    '创建人': row.create_by_name || '',
    '备注': row.remark || ''
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportData);
  XLSX.utils.book_append_sheet(wb, ws, '合同列表');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * 导出回款列表
 */
async function exportPayments(pool, { keyword, start_date, end_date }) {
  const params = [];
  let where = 'WHERE p.deleted_at IS NULL';
  if (keyword) {
    where += ' AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (start_date) {
    where += ' AND p.pay_date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    where += ' AND p.pay_date <= ?';
    params.push(end_date);
  }

  const [rows] = await pool.query(
    `SELECT c.contract_no, cu.company_name,
            p.pay_date, p.pay_amount, p.pay_method, p.remark
     FROM crm_payment p
     JOIN crm_contract c ON p.contract_id = c.id
     JOIN crm_customer cu ON c.customer_id = cu.id
     ${where}
     ORDER BY p.pay_date DESC
     LIMIT 10000`, params
  );

  const exportData = rows.map(row => ({
    '合同编号': row.contract_no,
    '客户名称': row.company_name || '',
    '回款日期': row.pay_date || '',
    '回款金额': parseFloat(row.pay_amount || 0),
    '回款方式': row.pay_method || '',
    '备注': row.remark || ''
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportData);
  XLSX.utils.book_append_sheet(wb, ws, '回款列表');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * 批量导入回款
 */
async function importPayments(pool, fileBuffer) {
  const wb = XLSX.read(fileBuffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);

  if (rows.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '文件内容为空');
  }
  if (rows.length > 500) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '单次导入不超过500条');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let successCount = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const contractNo = String(row['合同编号'] || row['contract_no'] || '').trim();
      const payDate = row['回款日期'] || row['pay_date'];
      const payAmount = parseFloat(row['回款金额'] || row['pay_amount'] || 0);
      const payMethod = String(row['回款方式'] || row['pay_method'] || '银行转账').trim();
      const remark = row['备注'] || row['remark'] || null;

      if (!contractNo || !payDate || !payAmount) {
        errors.push(`第${i + 2}行：缺少必填字段`);
        continue;
      }

      const [contracts] = await connection.query(
        'SELECT id FROM crm_contract WHERE contract_no = ? AND deleted_at IS NULL',
        [contractNo]
      );
      if (contracts.length === 0) {
        errors.push(`第${i + 2}行：合同编号 ${contractNo} 不存在`);
        continue;
      }

      let formattedDate = payDate;
      if (typeof payDate === 'number') {
        formattedDate = new Date((payDate - 25569) * 86400 * 1000).toISOString().slice(0, 10);
      } else if (payDate instanceof Date) {
        formattedDate = payDate.toISOString().slice(0, 10);
      }

      await connection.query(
        'INSERT INTO crm_payment (contract_id, pay_date, pay_amount, pay_method, remark) VALUES (?, ?, ?, ?, ?)',
        [contracts[0].id, formattedDate, payAmount, payMethod, remark]
      );

      await connection.query('UPDATE crm_contract SET status = 2 WHERE id = ? AND status = 1', [contracts[0].id]);

      successCount++;
    }

    await connection.commit();

    return {
      success: successCount,
      failed: errors.length,
      errors,
      message: `导入完成：成功 ${successCount} 条${errors.length > 0 ? `，失败 ${errors.length} 条` : ''}`
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  exportContracts,
  exportPayments,
  importPayments
};
