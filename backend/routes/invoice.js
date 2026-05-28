const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const { getDataPermission, buildPermissionClause } = require('../utils/permission');
const XLSX = require('xlsx');

const MODULE_NAME = '发票管理';
const { createRouteLogger } = require('../middleware/logger');
const logAction = createRouteLogger(MODULE_NAME);

// Joi schemas
const listSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  keyword: Joi.string().max(200).allow('', null),
  status: Joi.number().integer().valid(1, 2, 3, 4).allow('', null),
  type: Joi.number().integer().valid(1, 2, 3).allow('', null),
  start_date: Joi.date().iso().allow('', null),
  end_date: Joi.date().iso().allow('', null)
});

const addSchema = Joi.object({
  contract_id: Joi.number().integer().positive().required(),
  customer_id: Joi.number().integer().positive().required(),
  type: Joi.number().integer().valid(1, 2, 3).required(),
  amount: Joi.number().precision(2).min(0).required(),
  tax_rate: Joi.number().precision(2).min(0).max(100).allow(null),
  tax_amount: Joi.number().precision(2).min(0).allow(null),
  invoice_date: Joi.date().iso().allow(null),
  status: Joi.number().integer().valid(1, 2, 3, 4).allow(null),
  remark: Joi.string().max(500).allow('', null)
});

const updateSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  contract_id: Joi.number().integer().positive().required(),
  customer_id: Joi.number().integer().positive().required(),
  type: Joi.number().integer().valid(1, 2, 3).required(),
  amount: Joi.number().precision(2).min(0).required(),
  tax_rate: Joi.number().precision(2).min(0).max(100).allow(null),
  tax_amount: Joi.number().precision(2).min(0).allow(null),
  invoice_date: Joi.date().iso().allow(null),
  status: Joi.number().integer().valid(1, 2, 3, 4).allow(null),
  remark: Joi.string().max(500).allow('', null)
});

const deleteSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

// 列表查询
router.post('/list', authenticateToken, validate(listSchema), async (req, res) => {
  try {
    const { page = 1, pageSize = 10, keyword, status, type, start_date, end_date } = req.body;
    const offset = (page - 1) * pageSize;

    const permission = await getDataPermission(req.user);
    const { clause: permissionClause, params: permParams } = buildPermissionClause(permission, 'i', 'create_by');

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

    // Count query
    const countSql = sql.replace(/SELECT[\s\S]*FROM/, 'SELECT COUNT(*) as total FROM').replace(/ORDER BY[\s\S]*/, '');
    const [countResult] = await pool.query(countSql, params);

    sql += ' ORDER BY i.create_time DESC LIMIT ?, ?';
    params.push(offset, pageSize);

    const [rows] = await pool.query(sql, params);

    res.json({
      code: 200,
      message: '查询成功',
      data: { list: rows, total: countResult[0].total }
    });
  } catch (error) {
    console.error('发票列表查询失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 详情
router.get('/detail/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT i.*, cu.company_name as customer_name, u.real_name as create_by_name
       FROM crm_invoice i
       LEFT JOIN crm_customer cu ON i.customer_id = cu.id
       LEFT JOIN sys_user u ON i.create_by = u.id
       WHERE i.id = ? AND i.deleted_at IS NULL`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '发票不存在', data: null });
    }

    res.json({ code: 200, message: '查询成功', data: rows[0] });
  } catch (error) {
    console.error('发票详情查询失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 新增
router.post('/add', authenticateToken, checkPermission('invoice:add'), validate(addSchema), async (req, res) => {
  const { contract_id, customer_id, type, amount, tax_rate, tax_amount, invoice_date, status, remark } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 生成发票编号 INV-YYMMDD-XXX
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
      [invoiceNo, contract_id, customer_id, type, amount, tax_rate || null, tax_amount || null, invoice_date || null, status || 1, remark || null, req.user.userId]
    );

    await connection.commit();
    await logAction(req, 'add', `新增发票: ${invoiceNo}`);

    res.json({ code: 200, message: '创建发票成功', data: { id: result.insertId, invoice_no: invoiceNo } });
  } catch (error) {
    await connection.rollback();
    console.error('新增发票失败:', error);
    res.status(500).json({ code: 500, message: '创建发票失败', data: null });
  } finally {
    connection.release();
  }
});

// 编辑
router.post('/update', authenticateToken, checkPermission('invoice:edit'), validate(updateSchema), async (req, res) => {
  const { id, contract_id, customer_id, type, amount, tax_rate, tax_amount, invoice_date, status, remark } = req.body;

  try {
    const [oldRows] = await pool.query('SELECT id FROM crm_invoice WHERE id = ? AND deleted_at IS NULL', [id]);
    if (oldRows.length === 0) {
      return res.status(404).json({ code: 404, message: '发票不存在', data: null });
    }

    await pool.query(
      `UPDATE crm_invoice SET contract_id=?, customer_id=?, type=?, amount=?, tax_rate=?, tax_amount=?, invoice_date=?, status=?, remark=? WHERE id=?`,
      [contract_id, customer_id, type, amount, tax_rate || null, tax_amount || null, invoice_date || null, status || 1, remark || null, id]
    );

    await logAction(req, 'update', `修改发票: ID=${id}`);
    res.json({ code: 200, message: '修改成功', data: null });
  } catch (error) {
    console.error('修改发票失败:', error);
    res.status(500).json({ code: 500, message: '修改失败', data: null });
  }
});

// 删除（软删除）
router.post('/delete', authenticateToken, checkPermission('invoice:delete'), validate(deleteSchema), async (req, res) => {
  try {
    const { id } = req.body;

    const [rows] = await pool.query('SELECT id FROM crm_invoice WHERE id = ? AND deleted_at IS NULL', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '发票不存在', data: null });
    }

    await pool.query('UPDATE crm_invoice SET deleted_at = NOW() WHERE id = ?', [id]);
    await logAction(req, 'delete', `删除发票: ID=${id}`);

    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('删除发票失败:', error);
    res.status(500).json({ code: 500, message: '删除失败', data: null });
  }
});

// 导出
router.post('/export', authenticateToken, checkPermission('invoice:export'), async (req, res) => {
  try {
    const { keyword = '', status = '', type = '' } = req.body;

    const permission = await getDataPermission(req.user);
    const { clause: permissionClause, params: permParams } = buildPermissionClause(permission, 'i', 'create_by');

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

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=invoices.xlsx');
    res.send(buf);

    await logAction(req, 'export', `导出发票 ${rows.length} 条`);
  } catch (error) {
    console.error('导出发票失败:', error);
    res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

module.exports = router;
