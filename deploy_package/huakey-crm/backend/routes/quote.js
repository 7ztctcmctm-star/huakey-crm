const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const STATUS_MAP = {
  1: '草稿',
  2: '已发送',
  3: '已确认',
  4: '已失效'
};

const getDataPermission = async (user) => {
  if (user.roleId === 1 || user.roleId === 2) {
    return { type: 'all' };
  }
  if (user.roleId === 3) {
    const [users] = await pool.query('SELECT dept_id FROM sys_user WHERE id = ?', [user.userId]);
    const deptId = users.length > 0 ? users[0].dept_id : null;
    if (deptId) {
      const [deptUserIds] = await pool.query('SELECT id FROM sys_user WHERE dept_id = ?', [deptId]);
      const userIds = deptUserIds.map(u => u.id);
      return { type: 'dept', userIds: userIds.length > 0 ? userIds : [user.userId] };
    }
    return { type: 'self', userId: user.userId };
  }
  return { type: 'self', userId: user.userId };
};

const buildPermissionClause = (permission, tableAlias = 'q') => {
  if (permission.type === 'all') return '1=1';
  if (permission.type === 'dept') return `${tableAlias}.create_by IN (${permission.userIds.join(',')})`;
  return `${tableAlias}.create_by = ${permission.userId}`;
};

// 生成报价单号
const generateQuoteNo = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `QUO-${year}${month}${day}-${random}`;
};

// 1. 创建报价单
router.post('/add', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { customer_id, items, discount, valid_days, remark } = req.body;

    if (!customer_id) {
      return res.status(400).json({ code: 400, message: '客户ID不能为空', data: null });
    }
    if (!items || items.length === 0) {
      return res.status(400).json({ code: 400, message: '报价项不能为空', data: null });
    }

    const [customers] = await connection.query(
      'SELECT id FROM crm_customer WHERE id = ? AND status != 0',
      [customer_id]
    );
    if (customers.length === 0) {
      return res.status(404).json({ code: 404, message: '客户不存在', data: null });
    }

    // 验证产品并获取信息
    let totalAmount = 0;
    const validatedItems = [];
    for (const item of items) {
      const [products] = await connection.query(
        'SELECT id, name, code, price FROM crm_product WHERE id = ? AND status = 1',
        [item.product_id]
      );
      if (products.length === 0) {
        return res.status(404).json({ code: 404, message: `产品ID ${item.product_id} 不存在或已禁用`, data: null });
      }

      const product = products[0];
      const quantity = item.quantity || 1;
      const unitPrice = item.unit_price || product.price;
      const totalPrice = quantity * unitPrice;
      totalAmount += totalPrice;

      validatedItems.push({
        product_id: item.product_id,
        product_name: product.name,
        product_code: product.code,
        quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
        remark: item.remark || null
      });
    }

    const disc = discount || 0;
    const finalAmount = totalAmount * (1 - disc);
    const quoteNo = generateQuoteNo();

    const [quoteResult] = await connection.query(
      `INSERT INTO crm_quote 
        (quote_no, customer_id, amount, discount, final_amount, valid_days, remark, status, create_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [quoteNo, customer_id, totalAmount, disc, finalAmount, valid_days || 30, remark || null, req.user.userId]
    );

    const quoteId = quoteResult.insertId;

    for (const item of validatedItems) {
      await connection.query(
        `INSERT INTO crm_quote_item 
          (quote_id, product_id, product_name, product_code, quantity, unit_price, total_price, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [quoteId, item.product_id, item.product_name, item.product_code, item.quantity, item.unit_price, item.total_price, item.remark]
      );
    }

    await connection.commit();

    res.json({
      code: 200,
      message: '创建报价单成功',
      data: { id: quoteId, quote_no: quoteNo }
    });
  } catch (error) {
    await connection.rollback();
    console.error('创建报价单错误:', error);
    res.status(500).json({ code: 500, message: '创建报价单失败', data: null });
  } finally {
    connection.release();
  }
});

// 2. 报价单列表
router.post('/list', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, quote_no, customer_name, status } = req.body;
    const offset = (page - 1) * pageSize;
    const params = [];

    const permission = await getDataPermission(req.user);
    const permissionClause = buildPermissionClause(permission);

    let whereClause = `WHERE ${permissionClause}`;

    if (quote_no) {
      whereClause += ' AND q.quote_no LIKE ?';
      params.push(`%${quote_no}%`);
    }
    if (customer_name) {
      whereClause += ' AND c.company_name LIKE ?';
      params.push(`%${customer_name}%`);
    }
    if (status !== undefined && status !== null && status !== '') {
      whereClause += ' AND q.status = ?';
      params.push(parseInt(status));
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_quote q LEFT JOIN crm_customer c ON q.customer_id = c.id ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const [list] = await pool.query(
      `SELECT 
        q.id, q.quote_no, q.customer_id, q.amount, q.discount, q.final_amount,
        q.valid_days, q.remark, q.status, q.create_by, q.create_time,
        c.company_name as customer_name,
        u.real_name as create_name
      FROM crm_quote q
      LEFT JOIN crm_customer c ON q.customer_id = c.id
      LEFT JOIN sys_user u ON q.create_by = u.id
      ${whereClause}
      ORDER BY q.create_time DESC
      LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200,
      message: '获取报价单列表成功',
      data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('获取报价单列表错误:', error);
    res.status(500).json({ code: 500, message: '获取报价单列表失败', data: null });
  }
});

// 3. 报价单详情
router.get('/detail/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [quote] = await pool.query(
      `SELECT 
        q.id, q.quote_no, q.customer_id, q.amount, q.discount, q.final_amount,
        q.valid_days, q.remark, q.status, q.create_by, q.create_time,
        c.company_name as customer_name, c.contact_name, c.phone,
        u.real_name as create_name
      FROM crm_quote q
      LEFT JOIN crm_customer c ON q.customer_id = c.id
      LEFT JOIN sys_user u ON q.create_by = u.id
      WHERE q.id = ?`,
      [id]
    );

    if (quote.length === 0) {
      return res.status(404).json({ code: 404, message: '报价单不存在', data: null });
    }

    const [items] = await pool.query(
      `SELECT 
        id, product_id, product_name, product_code, quantity, unit_price, total_price, remark
      FROM crm_quote_item WHERE quote_id = ? ORDER BY id`,
      [id]
    );

    res.json({
      code: 200,
      message: '获取报价单详情成功',
      data: { ...quote[0], items }
    });
  } catch (error) {
    console.error('获取报价单详情错误:', error);
    res.status(500).json({ code: 500, message: '获取报价单详情失败', data: null });
  }
});

// 4. 修改报价单
router.post('/update', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id, customer_id, items, discount, valid_days, remark, status } = req.body;

    if (!id) {
      return res.status(400).json({ code: 400, message: '报价单ID不能为空', data: null });
    }

    const [quotes] = await connection.query('SELECT * FROM crm_quote WHERE id = ?', [id]);
    if (quotes.length === 0) {
      return res.status(404).json({ code: 404, message: '报价单不存在', data: null });
    }

    const existingQuote = quotes[0];
    if (existingQuote.status === 3 || existingQuote.status === 4) {
      return res.status(400).json({ code: 400, message: `${STATUS_MAP[existingQuote.status]}的报价单不可修改`, data: null });
    }

    let updates = [];
    const updateParams = [];

    if (customer_id !== undefined) {
      const [customers] = await connection.query(
        'SELECT id FROM crm_customer WHERE id = ? AND status != 0',
        [customer_id]
      );
      if (customers.length === 0) {
        return res.status(404).json({ code: 404, message: '客户不存在', data: null });
      }
      updates.push('customer_id = ?');
      updateParams.push(customer_id);
    }

    if (discount !== undefined) {
      updates.push('discount = ?');
      updateParams.push(discount);
    }

    if (valid_days !== undefined) {
      updates.push('valid_days = ?');
      updateParams.push(valid_days);
    }

    if (remark !== undefined) {
      updates.push('remark = ?');
      updateParams.push(remark);
    }

    if (status !== undefined) {
      updates.push('status = ?');
      updateParams.push(status);
    }

    // 处理报价项
    if (items !== undefined && items.length > 0) {
      await connection.query('DELETE FROM crm_quote_item WHERE quote_id = ?', [id]);

      let totalAmount = 0;
      for (const item of items) {
        const [products] = await connection.query(
          'SELECT id, name, code, price FROM crm_product WHERE id = ? AND status = 1',
          [item.product_id]
        );
        if (products.length === 0) {
          return res.status(404).json({ code: 404, message: `产品ID ${item.product_id} 不存在或已禁用`, data: null });
        }

        const product = products[0];
        const quantity = item.quantity || 1;
        const unitPrice = item.unit_price || product.price;
        const totalPrice = quantity * unitPrice;
        totalAmount += totalPrice;

        await connection.query(
          `INSERT INTO crm_quote_item 
            (quote_id, product_id, product_name, product_code, quantity, unit_price, total_price, remark)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, item.product_id, product.name, product.code, quantity, unitPrice, totalPrice, item.remark || null]
        );
      }

      const disc = discount !== undefined ? discount : existingQuote.discount;
      updates.push('amount = ?');
      updates.push('final_amount = ?');
      updateParams.push(totalAmount);
      updateParams.push(totalAmount * (1 - disc));
    }

    if (updates.length > 0) {
      updateParams.push(id);
      await connection.query(
        `UPDATE crm_quote SET ${updates.join(', ')} WHERE id = ?`,
        updateParams
      );
    }

    await connection.commit();

    res.json({ code: 200, message: '修改报价单成功', data: null });
  } catch (error) {
    await connection.rollback();
    console.error('修改报价单错误:', error);
    res.status(500).json({ code: 500, message: '修改报价单失败', data: null });
  } finally {
    connection.release();
  }
});

// 5. 删除报价单
router.post('/delete', authenticateToken, async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ code: 400, message: '报价单ID不能为空', data: null });
    }

    const [quotes] = await pool.query('SELECT status FROM crm_quote WHERE id = ?', [id]);
    if (quotes.length === 0) {
      return res.status(404).json({ code: 404, message: '报价单不存在', data: null });
    }

    if (quotes[0].status === 3) {
      return res.status(400).json({ code: 400, message: '已确认的报价单不可删除', data: null });
    }

    await pool.query('DELETE FROM crm_quote WHERE id = ?', [id]);

    res.json({ code: 200, message: '删除报价单成功', data: null });
  } catch (error) {
    console.error('删除报价单错误:', error);
    res.status(500).json({ code: 500, message: '删除报价单失败', data: null });
  }
});

// 6. 获取产品列表（用于选择产品）
router.post('/product-list', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, name, code, category } = req.body;
    const offset = (page - 1) * pageSize;
    const params = [];

    let whereClause = 'WHERE status = 1';

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
      `SELECT COUNT(*) as total FROM crm_product ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const [list] = await pool.query(
      `SELECT id, name, code, category, unit, price, stock, description 
       FROM crm_product ${whereClause} 
       ORDER BY create_time DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200,
      message: '获取产品列表成功',
      data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('获取产品列表错误:', error);
    res.status(500).json({ code: 500, message: '获取产品列表失败', data: null });
  }
});

// 7. 获取产品分类列表
router.get('/product-categories', authenticateToken, async (req, res) => {
  try {
    const [result] = await pool.query(
      'SELECT DISTINCT category FROM crm_product WHERE category IS NOT NULL ORDER BY category'
    );
    const categories = result.map(item => item.category);
    res.json({ code: 200, message: '获取产品分类成功', data: categories });
  } catch (error) {
    console.error('获取产品分类错误:', error);
    res.status(500).json({ code: 500, message: '获取产品分类失败', data: null });
  }
});

module.exports = router;
