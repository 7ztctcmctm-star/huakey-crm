const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const { cache, invalidateCache } = require('../middleware/cache');
const ROLES = require('../config/roles');
const { logFieldChanges } = require('../utils/fieldLog');

const MODULE_NAME = '产品管理';

const router = express.Router();

const productAddSchema = Joi.object({
  name: Joi.string().required().max(200),
  code: Joi.string().max(100).allow('', null),
  category: Joi.string().max(100).allow('', null),
  unit: Joi.string().max(20).allow('', null),
  price: Joi.number().precision(2).min(0).allow(null),
  cost_price: Joi.number().precision(2).min(0).allow(null),
  stock: Joi.number().integer().min(0).allow(null),
  description: Joi.string().max(2000).allow('', null)
});

const productUpdateSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  name: Joi.string().max(200).allow('', null),
  code: Joi.string().max(100).allow('', null),
  category: Joi.string().max(100).allow('', null),
  unit: Joi.string().max(20).allow('', null),
  price: Joi.number().precision(2).min(0).allow(null),
  cost_price: Joi.number().precision(2).min(0).allow(null),
  stock: Joi.number().integer().min(0).allow(null),
  status: Joi.number().integer().valid(0, 1).allow(null),
  description: Joi.string().max(2000).allow('', null)
});

const productDeleteSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const productListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  pageSize: Joi.number().integer().min(1).max(200).optional().default(20),
  keyword: Joi.string().allow('').optional(),
  name: Joi.string().allow('').optional(),
  code: Joi.string().allow('').optional(),
  category: Joi.string().allow('').optional(),
  status: Joi.number().integer().valid(0, 1).allow('', null).optional()
});

const requireAdmin = require('../middleware/admin');

// 1. 产品列表
router.post('/list', authenticateToken, cache(120), checkPermission('product'), validate(productListSchema), async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword, name, code, category, status } = req.body;
    const offset = (page - 1) * pageSize;
    const params = [];

    // 默认显示上架产品，明确筛选status=0时才显示已删除
    let whereClause;
    if (status === 0 || status === '0') {
      whereClause = 'WHERE status = 0';
    } else {
      whereClause = 'WHERE status = 1';
    }
    if (keyword) {
      whereClause += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (name) {
      whereClause += ' AND name LIKE ?';
      params.push(`%${name}%`);
    }
    if (code) {
      whereClause += ' AND code LIKE ?';
      params.push(`%${code}%`);
    }
    if (category) {
      whereClause += ' AND category = ?';
      params.push(category);
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_product ${whereClause}`, params
    );
    const total = countResult[0].total;

    const [list] = await pool.query(
      `SELECT id, name, code, category, unit, price, cost_price, stock, status, description, create_time
       FROM crm_product ${whereClause}
       ORDER BY create_time DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    // 非管理员不返回成本价字段
    const { manageAll, roleId } = req.user;
    const isAdmin = manageAll || roleId === ROLES.ADMIN;
    if (!isAdmin) {
      list.forEach(item => { delete item.cost_price; });
    }

    res.json({
      code: 200, message: '获取产品列表成功',
      data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('[产品] 获取产品列表失败:', error);
    res.status(500).json({ code: 500, message: '获取产品列表失败', data: null });
  }
});

// 2. 新增产品
router.post('/add', authenticateToken, checkPermission('product:add'), requireAdmin, validate(productAddSchema), async (req, res) => {
  try {
    const { name, code, category, unit, price, cost_price, stock, description } = req.body;

    const [result] = await pool.query(
      `INSERT INTO crm_product (name, code, category, unit, price, cost_price, stock, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, code || null, category || null, unit || '台', price || 0, cost_price || 0, stock || 0, description || null]
    );

    res.json({ code: 200, message: '新增产品成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[产品] 操作失败:', error);
    res.status(500).json({ code: 500, message: '新增产品失败', data: null });
  }
});

// 3. 编辑产品
router.post('/update', authenticateToken, checkPermission('product:edit'), requireAdmin, validate(productUpdateSchema), async (req, res) => {
  try {
    const { id, name, code, category, unit, price, cost_price, stock, status, description } = req.body;

    const [oldRows] = await pool.query('SELECT * FROM crm_product WHERE id = ?', [id]);
    if (oldRows.length === 0) {
      return res.status(404).json({ code: 404, message: '产品不存在', data: null });
    }
    const oldData = oldRows[0];

    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (code !== undefined) { updates.push('code = ?'); params.push(code); }
    if (category !== undefined) { updates.push('category = ?'); params.push(category); }
    if (unit !== undefined) { updates.push('unit = ?'); params.push(unit); }
    if (price !== undefined) { updates.push('price = ?'); params.push(price); }
    if (cost_price !== undefined) { updates.push('cost_price = ?'); params.push(cost_price); }
    if (stock !== undefined) { updates.push('stock = ?'); params.push(stock); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }

    if (updates.length === 0) {
      return res.status(400).json({ code: 400, message: '没有需要更新的字段', data: null });
    }

    params.push(id);
    await pool.query(`UPDATE crm_product SET ${updates.join(', ')} WHERE id = ?`, params);

    await logFieldChanges(req, {
      module: MODULE_NAME,
      action: '编辑产品',
      oldData,
      newData: req.body,
      allowedFields: ['name', 'model', 'category', 'unit', 'price', 'cost', 'status', 'remark', 'description'],
      description: `编辑产品: ${oldData.name}`
    });

    await invalidateCache(['cache:*:/api/product/*']);
    res.json({ code: 200, message: '修改产品成功', data: null });
  } catch (error) {
    console.error('[产品] 操作失败:', error);
    res.status(500).json({ code: 500, message: '修改产品失败', data: null });
  }
});

// 4. 删除产品（逻辑删除）
router.post('/delete', authenticateToken, checkPermission('product:delete'), requireAdmin, validate(productDeleteSchema), async (req, res) => {
  try {
    const { id } = req.body;
    await pool.query('UPDATE crm_product SET status = 0 WHERE id = ?', [id]);
    await invalidateCache(['cache:*:/api/product/*']);
    res.json({ code: 200, message: '删除产品成功', data: null });
  } catch (error) {
    console.error('[产品] 操作失败:', error);
    res.status(500).json({ code: 500, message: '删除产品失败', data: null });
  }
});

// 5. 产品详情
router.get('/detail/:id', authenticateToken, checkPermission('product'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, code, category, unit, price, stock, description, status, create_time, update_time FROM crm_product WHERE id = ?', [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '产品不存在', data: null });
    }
    res.json({ code: 200, message: '查询成功', data: rows[0] });
  } catch (error) {
    console.error('[产品] 操作失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 6. 产品分类列表
router.get('/categories', authenticateToken, checkPermission('product'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT DISTINCT category FROM crm_product WHERE category IS NOT NULL AND status = 1 ORDER BY category'
    );
    res.json({ code: 200, message: '查询成功', data: rows.map(r => r.category) });
  } catch (error) {
    console.error('[产品] 操作失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// ============ 产品价格表 ============

// 7. 获取产品价格表
router.get('/:id/prices', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM crm_product_price WHERE product_id = ? AND deleted_at IS NULL ORDER BY price_type, customer_level',
      [req.params.id]
    );
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[产品] 价格表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 8. 添加产品价格
router.post('/:id/prices', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const productId = req.params.id;
    const { price_type, customer_level, unit_price, min_quantity, currency, valid_from, valid_to } = req.body;

    if (!price_type || unit_price === undefined) {
      return res.status(400).json({ code: 400, message: '价格类型和单价不能为空', data: null });
    }

    const [product] = await pool.query('SELECT id FROM crm_product WHERE id = ?', [productId]);
    if (product.length === 0) return res.status(404).json({ code: 404, message: '产品不存在', data: null });

    const [result] = await pool.query(
      `INSERT INTO crm_product_price (product_id, price_type, customer_level, unit_price, min_quantity, currency, valid_from, valid_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [productId, price_type, customer_level || null, parseFloat(unit_price), min_quantity || 1, currency || 'CNY', valid_from || null, valid_to || null]
    );
    res.json({ code: 200, message: '添加成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[产品] 添加价格失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 9. 更新产品价格
router.put('/price/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { price_type, customer_level, unit_price, min_quantity, currency, valid_from, valid_to, status } = req.body;
    const fields = [];
    const values = [];

    if (price_type !== undefined) { fields.push('price_type = ?'); values.push(price_type); }
    if (customer_level !== undefined) { fields.push('customer_level = ?'); values.push(customer_level); }
    if (unit_price !== undefined) { fields.push('unit_price = ?'); values.push(parseFloat(unit_price)); }
    if (min_quantity !== undefined) { fields.push('min_quantity = ?'); values.push(parseInt(min_quantity)); }
    if (currency !== undefined) { fields.push('currency = ?'); values.push(currency); }
    if (valid_from !== undefined) { fields.push('valid_from = ?'); values.push(valid_from); }
    if (valid_to !== undefined) { fields.push('valid_to = ?'); values.push(valid_to); }
    if (status !== undefined) { fields.push('status = ?'); values.push(parseInt(status)); }

    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });

    values.push(id);
    await pool.query(`UPDATE crm_product_price SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[产品] 更新价格失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 10. 删除产品价格
router.delete('/price/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE crm_product_price SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[产品] 删除价格失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 11. 获取客户对应价格（报价时调用）
router.get('/:id/price', authenticateToken, async (req, res) => {
  try {
    const productId = req.params.id;
    const { customer_level } = req.query;

    let price = null;

    // 优先匹配客户等级对应的价格
    if (customer_level) {
      const [levelPrices] = await pool.query(
        `SELECT * FROM crm_product_price WHERE product_id = ? AND customer_level = ? AND deleted_at IS NULL
         AND (valid_from IS NULL OR valid_from <= CURDATE()) AND (valid_to IS NULL OR valid_to >= CURDATE())
         ORDER BY unit_price ASC LIMIT 1`,
        [productId, customer_level]
      );
      if (levelPrices.length > 0) price = levelPrices[0];
    }

    // 没有匹配则用默认价格（产品表的price字段）
    if (!price) {
      const [[product]] = await pool.query('SELECT price FROM crm_product WHERE id = ?', [productId]);
      price = { unit_price: product?.price || 0, currency: 'CNY', price_type: 'default' };
    }

    res.json({ code: 200, message: '查询成功', data: price });
  } catch (error) {
    console.error('[产品] 获取客户价格失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;
