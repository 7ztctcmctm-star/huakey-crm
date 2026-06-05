const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const { getDataPermission, buildPermissionClause } = require('../utils/permission');

const MODULE_NAME = '采购管理';

const listSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  keyword: Joi.string().max(200).allow('', null),
  status: Joi.string().valid('草稿', '待审核', '已确认', '部分收货', '已完成', '已取消').allow('', null),
  type: Joi.string().valid('常规', '紧急', '样品', '返修').allow('', null),
  supplier_id: Joi.number().integer().positive().allow(null)
});

const addOrderSchema = Joi.object({
  supplier_id: Joi.number().integer().positive().required(),
  title: Joi.string().required().max(200),
  type: Joi.string().valid('常规', '紧急', '样品', '返修').default('常规'),
  expected_date: Joi.date().iso().allow(null),
  payment_terms: Joi.string().max(200).allow('', null),
  delivery_address: Joi.string().max(500).allow('', null),
  remark: Joi.string().max(2000).allow('', null),
  items: Joi.array().items(Joi.object({
    product_name: Joi.string().required().max(200),
    product_spec: Joi.string().max(200).allow('', null),
    unit: Joi.string().max(20).default('个'),
    quantity: Joi.number().precision(3).min(0.001).required(),
    unit_price: Joi.number().precision(4).min(0).required(),
    discount_rate: Joi.number().precision(2).min(0).max(200).default(0),
    remark: Joi.string().max(500).allow('', null)
  })).min(1).required()
});

const updateOrderStatusSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  status: Joi.string().valid('待审核', '已确认', '部分收货', '已完成', '已取消').required(),
  approveRemark: Joi.string().max(500).allow('', null)
});

const addReceiptSchema = Joi.object({
  order_id: Joi.number().integer().positive().required(),
  item_id: Joi.number().integer().positive().required(),
  quantity: Joi.number().precision(3).min(0.001).required(),
  quality_check: Joi.number().integer().valid(0, 1).default(1),
  quality_result: Joi.string().valid('合格', '不合格', '待检').default('待检'),
  defect_desc: Joi.string().max(500).allow('', null),
  warehouse: Joi.string().max(200).allow('', null),
  remark: Joi.string().max(500).allow('', null)
});

const { createRouteLogger } = require('../middleware/logger');
const logAction = createRouteLogger(MODULE_NAME);

router.post('/list', authenticateToken, validate(listSchema), async (req, res) => {
  const { page = 1, pageSize = 10, keyword = '', status = '', type = '', supplier_id } = req.body;
  const offset = (page - 1) * pageSize;

  const permission = await getDataPermission(req.user);
  const { clause: permissionClause, params: permParams } = buildPermissionClause(permission, 'po', 'owner_id');

  let sql = `SELECT po.*, s.name as supplier_name, u.real_name as owner_name
    FROM crm_purchase_order po
    LEFT JOIN crm_supplier s ON po.supplier_id = s.id
    LEFT JOIN sys_user u ON po.owner_id = u.id
    WHERE ${permissionClause}`;
  const params = [...permParams];

  if (keyword) {
    sql += ' AND (po.order_no LIKE ? OR po.title LIKE ? OR s.name LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (status) { sql += ' AND po.status = ?'; params.push(status); }
  if (type) { sql += ' AND po.type = ?'; params.push(type); }
  if (supplier_id) { sql += ' AND po.supplier_id = ?'; params.push(supplier_id); }

  sql += ' ORDER BY po.create_time DESC LIMIT ?, ?';
  params.push(offset, pageSize);

  try {
    const [rows] = await pool.query(sql, params);

    let countSql = `SELECT COUNT(*) as total FROM crm_purchase_order po LEFT JOIN crm_supplier s ON po.supplier_id = s.id WHERE ${permissionClause}`;
    const countParams = [];
    if (keyword) { countSql += ' AND (po.order_no LIKE ? OR po.title LIKE ? OR s.name LIKE ?)'; countParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
    if (status) { countSql += ' AND po.status = ?'; countParams.push(status); }
    if (type) { countSql += ' AND po.type = ?'; countParams.push(type); }
    if (supplier_id) { countSql += ' AND po.supplier_id = ?'; countParams.push(supplier_id); }

    const [countResult] = await pool.query(countSql, countParams);

    res.json({ code: 200, message: '查询成功', data: { list: rows, total: countResult[0].total } });
  } catch (error) {
    console.error('[采购] 采购列表错误:', error.message);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.get('/detail/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const permission = await getDataPermission(req.user);
    const { clause: permissionClause, params: permParams } = buildPermissionClause(permission, 'po', 'owner_id');

    const [orders] = await pool.query(`
      SELECT po.*, s.name as supplier_name, s.contact_person, s.contact_phone,
             u.real_name as owner_name, ub.real_name as create_by_name
      FROM crm_purchase_order po
      LEFT JOIN crm_supplier s ON po.supplier_id = s.id
      LEFT JOIN sys_user u ON po.owner_id = u.id
      LEFT JOIN sys_user ub ON po.create_by = ub.id
      WHERE po.id = ? AND ${permissionClause}
    `, [id, ...permParams]);

    if (!orders.length) return res.status(404).json({ code: 404, message: '采购单不存在', data: null });

    const [items] = await pool.query(
      'SELECT id, order_id, product_name, product_spec, unit, quantity, unit_price, discount_rate, discount_amount, amount, received_qty, quality_status, remark FROM crm_purchase_item WHERE order_id = ?',
      [id]
    );

    const [receipts] = await pool.query(`
      SELECT pr.*, u.real_name as operator_name
      FROM crm_purchase_receipt pr
      LEFT JOIN sys_user u ON pr.operator_id = u.id
      WHERE pr.order_id = ?
      ORDER BY pr.receive_time DESC
    `, [id]);

    const [payments] = await pool.query(`
      SELECT pp.*, u.real_name as payer_name
      FROM crm_purchase_payment pp
      LEFT JOIN sys_user u ON pp.payer_id = u.id
      WHERE pp.order_id = ?
      ORDER BY pp.create_time DESC
    `, [id]);

    res.json({ code: 200, message: '查询成功', data: { ...orders[0], items, receipts, payments } });
  } catch (error) {
    console.error('[采购] 采购详情错误:', error.message);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.post('/add', authenticateToken, checkPermission('purchase:add'), validate(addOrderSchema), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const [count] = await connection.query(
      "SELECT COUNT(*) as cnt FROM crm_purchase_order WHERE order_no LIKE ? FOR UPDATE",
      [`PO-${dateStr}-%`]
    );
    const seq = String(count[0].cnt + 1).padStart(3, '0');
    const orderNo = `PO-${dateStr}-${seq}`;

    let totalAmount = 0;
    const itemValues = [];

    for (const item of req.body.items) {
      const discountAmount = (item.unit_price * item.quantity * (item.discount_rate || 0)) / 100;
      const amount = Number((item.unit_price * item.quantity - discountAmount).toFixed(2));
      totalAmount += amount;

      itemValues.push([
        null, item.product_name, item.product_spec || null,
        item.unit || '个', item.quantity, item.unit_price,
        item.discount_rate || 0, discountAmount, amount, 0, '待检', item.remark || null
      ]);
    }

    const taxRate = req.body.tax_rate !== undefined ? parseFloat(req.body.tax_rate) : 13;
    const taxAmount = Number((totalAmount * taxRate / 100).toFixed(2));
    const totalWithTax = Number((totalAmount + taxAmount).toFixed(2));

    const [result] = await connection.query(
      `INSERT INTO crm_purchase_order (order_no, supplier_id, title, type, expected_date, payment_terms, delivery_address, remark, total_amount, tax_rate, tax_amount, total_with_tax, owner_id, create_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderNo, req.body.supplier_id, req.body.title, req.body.type,
       req.body.expected_date || null, req.body.payment_terms || null,
       req.body.delivery_address || null, req.body.remark || null,
       totalAmount, taxRate, taxAmount, totalWithTax,
       req.user.userId, req.user.userId]
    );

    const orderId = result.insertId;

    if (itemValues.length > 0) {
      for (let i = 0; i < itemValues.length; i++) {
        itemValues[i][0] = orderId;
      }
      await connection.query(
        `INSERT INTO crm_purchase_item (order_id, product_name, product_spec, unit, quantity, unit_price, discount_rate, discount_amount, amount, received_qty, quality_status, remark)
         VALUES ${itemValues.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?)').join(',')}`,
        itemValues.flat()
      );
    }

    await connection.commit();
    await logAction(req, 'add', `创建采购单: ${orderNo} - ${req.body.title}`);

    res.json({ code: 200, message: '创建采购单成功', data: { id: orderId, order_no: orderNo, total_amount: totalAmount } });
  } catch (error) {
    await connection.rollback();
    console.error('[采购] 添加采购单错误:', error.message);
    res.status(500).json({ code: 500, message: '创建采购单失败', data: null });
  } finally {
    connection.release();
  }
});

router.post('/update-status', authenticateToken, checkPermission('purchase:add'), validate(updateOrderStatusSchema), async (req, res) => {
  const { id, status, approveRemark } = req.body;
  try {
    if (status === '已确认') {
      await pool.query(
        'UPDATE crm_purchase_order SET status = ?, approve_time = NOW(), approveRemark = ? WHERE id = ?',
        [status, approveRemark || null, id]
      );
    } else {
      await pool.query('UPDATE crm_purchase_order SET status = ? WHERE id = ?', [status, id]);
    }
    await logAction(req, 'update-status', `更新采购单状态: ID=${id} → ${status}`);
    res.json({ code: 200, message: '状态更新成功', data: null });
  } catch (error) {
    console.error('[采购] 更新状态错误:', error.message);
    res.status(500).json({ code: 500, message: '更新失败', data: null });
  }
});

router.post('/receipt/add', authenticateToken, checkPermission('purchase:add'), validate(addReceiptSchema), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const [count] = await connection.query(
      "SELECT COUNT(*) as cnt FROM crm_purchase_receipt WHERE receipt_no LIKE ? FOR UPDATE",
      [`RCV-${dateStr}-%`]
    );
    const receiptNo = `RCV-${dateStr}-${String(count[0].cnt + 1).padStart(3, '0')}`;

    const [result] = await connection.query(
      `INSERT INTO crm_purchase_receipt (order_id, item_id, receipt_no, quantity, quality_check, quality_result, defect_desc, warehouse, remark, operator_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.body.order_id, req.body.item_id, receiptNo, req.body.quantity,
       req.body.quality_check, req.body.quality_result, req.body.defect_desc || null,
       req.body.warehouse || null, req.body.remark || null, req.user.userId]
    );

    await connection.query(
      'UPDATE crm_purchase_item SET received_qty = received_qty + ?, quality_status = ? WHERE id = ?',
      [req.body.quantity, req.body.quality_result === '合格' ? '合格' : req.body.quality_result, req.body.item_id]
    );

    const [[item]] = await connection.query('SELECT received_qty, quantity FROM crm_purchase_item WHERE id = ?', [req.body.item_id]);
    if (item && item.received_qty >= item.quantity) {
      await connection.query(
        `UPDATE crm_purchase_order SET actual_date = CURRENT_DATE, status = CASE
         WHEN (SELECT SUM(i.received_qty >= i.quantity) = COUNT(*)) FROM crm_purchase_item i WHERE i.order_id = ? THEN '已完成'
         ELSE '部分收货' END WHERE id = ?`,
        [req.body.order_id, req.body.order_id]
      );
    } else {
      await connection.query("UPDATE crm_purchase_order SET status = '部分收货' WHERE id = ?", [req.body.order_id]);
    }

    await connection.commit();
    await logAction(req, 'receipt', `入库记录: ${receiptNo}, 数量=${req.body.quantity}`);

    res.json({ code: 200, message: '入库记录成功', data: { id: result.insertId, receipt_no: receiptNo } });
  } catch (error) {
    await connection.rollback();
    console.error('[采购] 添加收货错误:', error.message);
    res.status(500).json({ code: 500, message: '入库记录失败', data: null });
  } finally {
    connection.release();
  }
});

router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const [[totalOrders]] = await pool.query('SELECT COUNT(*) as cnt FROM crm_purchase_order WHERE status != "已取消"');
    const [[pendingApprove]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_purchase_order WHERE status = '待审核'");
    const [[pendingReceive]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_purchase_order WHERE status IN ('已确认', '部分收货')");
    const [[completedThisMonth]] = await pool.query(`SELECT COUNT(*) as cnt FROM crm_purchase_order WHERE status = '已完成' AND MONTH(create_time) = MONTH(NOW())`);
    const [[totalAmount]] = await pool.query('SELECT COALESCE(SUM(total_with_tax), 0) as sum FROM crm_purchase_order WHERE status != "已取消"');

    const [[topSuppliers]] = await pool.query(`
      SELECT s.name, COUNT(po.id) as order_count, SUM(po.total_with_tax) as total_spent
      FROM crm_purchase_order po
      JOIN crm_supplier s ON po.supplier_id = s.id
      WHERE po.status != '已取消'
      GROUP BY s.name
      ORDER BY total_spent DESC
      LIMIT 5
    `);

    res.json({
      code: 200,
      message: '查询成功',
      data: {
        summary: {
          totalOrders: totalOrders.cnt,
          pendingApprove: pendingApprove.cnt,
          pendingReceive: pendingReceive.cnt,
          completedThisMonth: completedThisMonth.cnt,
          totalAmount: totalAmount.sum
        },
        topSuppliers
      }
    });
  } catch (error) {
    console.error('[采购] 统计错误:', error.message);
    res.status(500).json({ code: 500, message: '获取统计失败', data: null });
  }
});

// 采购付款登记
router.post('/payment/add', authenticateToken, checkPermission('purchase:add'), async (req, res) => {
  try {
    const { order_id, amount, pay_method, pay_date, remark } = req.body;

    if (!order_id || !amount) {
      return res.status(400).json({ code: 400, message: '订单ID和金额不能为空', data: null });
    }

    const [orders] = await pool.query('SELECT id FROM crm_purchase_order WHERE id = ? AND deleted_at IS NULL', [order_id]);
    if (orders.length === 0) {
      return res.status(404).json({ code: 404, message: '采购单不存在', data: null });
    }

    const [result] = await pool.query(
      `INSERT INTO crm_purchase_payment (order_id, amount, pay_method, pay_date, remark, payer_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [order_id, amount, pay_method || null, pay_date || null, remark || null, req.user.userId]
    );

    res.json({ code: 200, message: '付款登记成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[采购] 添加付款错误:', error.message);
    res.status(500).json({ code: 500, message: '付款登记失败', data: null });
  }
});

module.exports = router;
