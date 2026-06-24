const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, queryValidate, Joi } = require('../middleware/validate');

const inventoryListSchema = Joi.object({
  category: Joi.string().allow('').optional(),
  keyword: Joi.string().allow('').optional().max(100),
  stock_status: Joi.string().valid('low', 'high', 'normal', '').allow('').optional(),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(20)
});

const movementsSchema = Joi.object({
  product_id: Joi.number().integer().positive().allow('', null).optional(),
  movement_type: Joi.string().valid('in', 'out', 'adjust', '').allow('').optional(),
  start_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null).optional(),
  end_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null).optional(),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(20)
});

const stockInSchema = Joi.object({
  product_id: Joi.number().integer().positive().required(),
  quantity: Joi.number().integer().min(1).required(),
  remark: Joi.string().max(500).allow('', null)
});

const stockOutSchema = Joi.object({
  product_id: Joi.number().integer().positive().required(),
  quantity: Joi.number().integer().min(1).required(),
  remark: Joi.string().max(500).allow('', null)
});

const stockAdjustSchema = Joi.object({
  product_id: Joi.number().integer().positive().required(),
  new_qty: Joi.number().integer().min(0).required(),
  remark: Joi.string().max(500).allow('', null)
});

// 库存列表
router.get('/list', authenticateToken, queryValidate(inventoryListSchema), async (req, res) => {
  try {
    const { category = '', keyword = '', stock_status = '', page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    let where = 'WHERE p.deleted_at IS NULL';
    const params = [];

    if (category) { where += ' AND p.category = ?'; params.push(category); }
    if (keyword) { where += ' AND (p.name LIKE ? OR p.code LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }

    // 库存状态筛选
    if (stock_status === 'low') {
      where += ' AND sa.alert_enabled = 1 AND p.stock < sa.min_qty';
    } else if (stock_status === 'high') {
      where += ' AND sa.alert_enabled = 1 AND p.stock > sa.max_qty';
    } else if (stock_status === 'normal') {
      where += ' AND (sa.alert_enabled IS NULL OR (p.stock >= COALESCE(sa.min_qty, 0) AND p.stock <= COALESCE(sa.max_qty, 9999)))';
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_product p LEFT JOIN crm_stock_alert sa ON p.id = sa.product_id ${where}`, params
    );

    const [rows] = await pool.query(`
      SELECT p.id, p.name, p.code, p.category, p.unit, p.stock, p.cost_price,
             sa.min_qty, sa.max_qty, sa.alert_enabled,
             CASE
               WHEN sa.alert_enabled = 1 AND p.stock < sa.min_qty THEN 'low'
               WHEN sa.alert_enabled = 1 AND p.stock > sa.max_qty THEN 'high'
               ELSE 'normal'
             END as stock_status
      FROM crm_product p
      LEFT JOIN crm_stock_alert sa ON p.id = sa.product_id
      ${where}
      ORDER BY p.category, p.name
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    res.json({ code: 200, message: '查询成功', data: { list: rows, total } });
  } catch (error) {
    console.error('[库存] 列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 库存变动记录
router.get('/movements', authenticateToken, queryValidate(movementsSchema), async (req, res) => {
  try {
    const { product_id, movement_type, start_date, end_date, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    let where = 'WHERE 1=1';
    const params = [];

    if (product_id) { where += ' AND m.product_id = ?'; params.push(product_id); }
    if (movement_type) { where += ' AND m.movement_type = ?'; params.push(movement_type); }
    if (start_date) { where += ' AND m.create_time >= ?'; params.push(start_date); }
    if (end_date) { where += ' AND m.create_time <= ?'; params.push(end_date + ' 23:59:59'); }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_stock_movement m ${where}`, params
    );

    const [rows] = await pool.query(`
      SELECT m.*, p.name as product_name, p.code as product_code, u.real_name as operator_name
      FROM crm_stock_movement m
      JOIN crm_product p ON m.product_id = p.id
      LEFT JOIN sys_user u ON m.operator_id = u.id
      ${where}
      ORDER BY m.create_time DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    res.json({ code: 200, message: '查询成功', data: { list: rows, total } });
  } catch (error) {
    console.error('[库存] 变动记录查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 入库
router.post('/in', authenticateToken, checkPermission('purchase:add'), validate(stockInSchema), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { product_id, quantity, remark } = req.body;
    if (!product_id || !quantity || quantity <= 0) {
      return res.status(400).json({ code: 400, message: '产品ID和数量必填', data: null });
    }

    await conn.beginTransaction();
    const [[product]] = await conn.query('SELECT id, stock FROM crm_product WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [product_id]);
    if (!product) { await conn.rollback(); return res.status(404).json({ code: 404, message: '产品不存在', data: null }); }

    const beforeQty = product.stock;
    const afterQty = beforeQty + parseInt(quantity);
    await conn.query('UPDATE crm_product SET stock = ? WHERE id = ?', [afterQty, product_id]);
    await conn.query(
      'INSERT INTO crm_stock_movement (product_id, movement_type, quantity, before_qty, after_qty, remark, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [product_id, 'in', parseInt(quantity), beforeQty, afterQty, remark || '手动入库', req.user.userId]
    );

    await conn.commit();
    res.json({ code: 200, message: '入库成功', data: { before: beforeQty, after: afterQty } });
  } catch (error) {
    await conn.rollback();
    console.error('[库存] 入库失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  } finally { conn.release(); }
});

// 出库
router.post('/out', authenticateToken, checkPermission('purchase:add'), validate(stockOutSchema), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { product_id, quantity, remark } = req.body;
    if (!product_id || !quantity || quantity <= 0) {
      return res.status(400).json({ code: 400, message: '产品ID和数量必填', data: null });
    }

    await conn.beginTransaction();
    const [[product]] = await conn.query('SELECT id, stock FROM crm_product WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [product_id]);
    if (!product) { await conn.rollback(); return res.status(404).json({ code: 404, message: '产品不存在', data: null }); }
    if (product.stock < quantity) { await conn.rollback(); return res.status(400).json({ code: 400, message: `库存不足，当前库存 ${product.stock}`, data: null }); }

    const beforeQty = product.stock;
    const afterQty = beforeQty - parseInt(quantity);
    await conn.query('UPDATE crm_product SET stock = ? WHERE id = ?', [afterQty, product_id]);
    await conn.query(
      'INSERT INTO crm_stock_movement (product_id, movement_type, quantity, before_qty, after_qty, remark, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [product_id, 'out', -parseInt(quantity), beforeQty, afterQty, remark || '手动出库', req.user.userId]
    );

    await conn.commit();
    res.json({ code: 200, message: '出库成功', data: { before: beforeQty, after: afterQty } });
  } catch (error) {
    await conn.rollback();
    console.error('[库存] 出库失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  } finally { conn.release(); }
});

// 库存调整（盘点）
router.post('/adjust', authenticateToken, checkPermission('purchase:add'), validate(stockAdjustSchema), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { product_id, new_qty, remark } = req.body;
    if (!product_id || new_qty === undefined || new_qty === null) {
      return res.status(400).json({ code: 400, message: '产品ID和新库存必填', data: null });
    }

    await conn.beginTransaction();
    const [[product]] = await conn.query('SELECT id, stock FROM crm_product WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [product_id]);
    if (!product) { await conn.rollback(); return res.status(404).json({ code: 404, message: '产品不存在', data: null }); }

    const beforeQty = product.stock;
    const afterQty = parseInt(new_qty);
    const diff = afterQty - beforeQty;
    await conn.query('UPDATE crm_product SET stock = ? WHERE id = ?', [afterQty, product_id]);
    await conn.query(
      'INSERT INTO crm_stock_movement (product_id, movement_type, quantity, before_qty, after_qty, remark, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [product_id, 'adjust', diff, beforeQty, afterQty, remark || '库存盘点调整', req.user.userId]
    );

    await conn.commit();
    res.json({ code: 200, message: '调整成功', data: { before: beforeQty, after: afterQty, diff } });
  } catch (error) {
    await conn.rollback();
    console.error('[库存] 调整失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  } finally { conn.release(); }
});

// 库存预警列表
router.get('/alerts', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.id, p.name, p.code, p.category, p.stock, sa.min_qty, sa.max_qty,
             CASE WHEN p.stock < sa.min_qty THEN 'low' ELSE 'high' END as alert_type
      FROM crm_product p
      JOIN crm_stock_alert sa ON p.id = sa.product_id
      WHERE p.deleted_at IS NULL AND sa.alert_enabled = 1
        AND (p.stock < sa.min_qty OR p.stock > sa.max_qty)
      ORDER BY p.stock ASC
    `);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[库存] 预警查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 配置预警阈值
router.put('/alert-config/:product_id', authenticateToken, async (req, res) => {
  try {
    const { product_id } = req.params;
    const { min_qty, max_qty, alert_enabled } = req.body;

    const [[product]] = await pool.query('SELECT id FROM crm_product WHERE id = ? AND deleted_at IS NULL', [product_id]);
    if (!product) return res.status(404).json({ code: 404, message: '产品不存在', data: null });

    await pool.query(`
      INSERT INTO crm_stock_alert (product_id, min_qty, max_qty, alert_enabled)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE min_qty = VALUES(min_qty), max_qty = VALUES(max_qty), alert_enabled = VALUES(alert_enabled)
    `, [product_id, min_qty || 0, max_qty || 9999, alert_enabled !== undefined ? alert_enabled : 1]);

    res.json({ code: 200, message: '配置成功', data: null });
  } catch (error) {
    console.error('[库存] 预警配置失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 库存统计
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const [[skuCount]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_product WHERE deleted_at IS NULL");
    const [[totalStock]] = await pool.query("SELECT COALESCE(SUM(stock), 0) as total FROM crm_product WHERE deleted_at IS NULL");
    const [[totalValue]] = await pool.query("SELECT COALESCE(SUM(stock * COALESCE(cost_price, 0)), 0) as total FROM crm_product WHERE deleted_at IS NULL");
    const [[lowCount]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_product p JOIN crm_stock_alert sa ON p.id = sa.product_id WHERE p.deleted_at IS NULL AND sa.alert_enabled = 1 AND p.stock < sa.min_qty");
    const [[highCount]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_product p JOIN crm_stock_alert sa ON p.id = sa.product_id WHERE p.deleted_at IS NULL AND sa.alert_enabled = 1 AND p.stock > sa.max_qty");

    res.json({
      code: 200, message: '查询成功',
      data: { sku_count: skuCount.cnt, total_stock: totalStock.total, total_value: totalValue.total, low_count: lowCount.cnt, high_count: highCount.cnt }
    });
  } catch (error) {
    console.error('[库存] 统计查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 产品分类列表
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT DISTINCT category FROM crm_product WHERE deleted_at IS NULL AND category IS NOT NULL ORDER BY category");
    res.json({ code: 200, message: '查询成功', data: rows.map(r => r.category) });
  } catch (error) {
    console.error('[库存] 分类查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;
