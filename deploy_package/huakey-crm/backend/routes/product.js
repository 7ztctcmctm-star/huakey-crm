const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 1. 产品列表
router.post('/list', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword, name, code, category, status } = req.body;
    const offset = (page - 1) * pageSize;
    const params = [];

    // 默认显示上架产品，明确筛选status=0时才显示已删除
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

    res.json({
      code: 200, message: '获取产品列表成功',
      data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '获取产品列表失败', data: null });
  }
});

// 2. 新增产品
router.post('/add', authenticateToken, async (req, res) => {
  try {
    const { name, code, category, unit, price, cost_price, stock, description } = req.body;

    if (!name) {
      return res.status(400).json({ code: 400, message: '产品名称不能为空', data: null });
    }

    const [result] = await pool.query(
      `INSERT INTO crm_product (name, code, category, unit, price, cost_price, stock, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, code || null, category || null, unit || '台', price || 0, cost_price || 0, stock || 0, description || null]
    );

    res.json({ code: 200, message: '新增产品成功', data: { id: result.insertId } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '新增产品失败', data: null });
  }
});

// 3. 编辑产品
router.post('/update', authenticateToken, async (req, res) => {
  try {
    const { id, name, code, category, unit, price, cost_price, stock, status, description } = req.body;

    if (!id) {
      return res.status(400).json({ code: 400, message: '产品ID不能为空', data: null });
    }

    const [rows] = await pool.query('SELECT id FROM crm_product WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '产品不存在', data: null });
    }

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

    res.json({ code: 200, message: '修改产品成功', data: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '修改产品失败', data: null });
  }
});

// 4. 删除产品（逻辑删除）
router.post('/delete', authenticateToken, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ code: 400, message: '产品ID不能为空', data: null });
    }
    await pool.query('UPDATE crm_product SET status = 0 WHERE id = ?', [id]);
    res.json({ code: 200, message: '删除产品成功', data: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '删除产品失败', data: null });
  }
});

// 5. 产品详情
router.get('/detail/:id', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM crm_product WHERE id = ?', [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '产品不存在', data: null });
    }
    res.json({ code: 200, message: '查询成功', data: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 6. 产品分类列表
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT DISTINCT category FROM crm_product WHERE category IS NOT NULL AND status = 1 ORDER BY category'
    );
    res.json({ code: 200, message: '查询成功', data: rows.map(r => r.category) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

module.exports = router;
