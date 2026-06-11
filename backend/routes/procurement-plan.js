const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// 管理员权限检查
const requireAdmin = (req, res, next) => {
  if (req.user.manageAll || req.user.roleId === 1) return next();
  return res.status(403).json({ code: 403, message: '需要管理员权限', data: null });
};

// 采购计划列表
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const { status = '', page = 1, page_size = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    let where = 'WHERE p.deleted_at IS NULL';
    const params = [];
    if (status) { where += ' AND p.status = ?'; params.push(status); }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_purchase_plan p ${where}`, params);
    const [rows] = await pool.query(`
      SELECT p.*, u.real_name as create_by_name
      FROM crm_purchase_plan p
      LEFT JOIN sys_user u ON p.create_by = u.id
      ${where} ORDER BY p.create_time DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(page_size), offset]);

    res.json({ code: 200, message: '查询成功', data: { list: rows, total } });
  } catch (error) {
    console.error('[采购计划] 列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 计划详情
router.get('/detail/:id', authenticateToken, async (req, res) => {
  try {
    const [[plan]] = await pool.query(`
      SELECT p.*, u.real_name as create_by_name, a.real_name as approved_by_name
      FROM crm_purchase_plan p
      LEFT JOIN sys_user u ON p.create_by = u.id
      LEFT JOIN sys_user a ON p.approved_by = a.id
      WHERE p.id = ? AND p.deleted_at IS NULL
    `, [req.params.id]);
    if (!plan) return res.status(404).json({ code: 404, message: '计划不存在', data: null });

    const [items] = await pool.query(`
      SELECT i.*, p.name as product_name, p.code as product_code, p.unit, s.name as supplier_name
      FROM crm_purchase_plan_item i
      JOIN crm_product p ON i.product_id = p.id
      LEFT JOIN crm_supplier s ON i.supplier_id = s.id
      WHERE i.plan_id = ?
    `, [req.params.id]);

    plan.items = items;
    res.json({ code: 200, message: '查询成功', data: plan });
  } catch (error) {
    console.error('[采购计划] 详情查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 生成计划编号
const generatePlanNo = async () => {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const [[{ cnt }]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_purchase_plan WHERE plan_no LIKE ?", [`PP-${dateStr}-%`]);
  return `PP-${dateStr}-${String(cnt + 1).padStart(3, '0')}`;
};

// 创建采购计划
router.post('/create', authenticateToken, checkPermission('purchase:add'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { name, remark, items } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ code: 400, message: '计划名称不能为空', data: null });
    if (!items || items.length === 0) return res.status(400).json({ code: 400, message: '至少需要一个计划明细', data: null });

    await conn.beginTransaction();
    const planNo = await generatePlanNo();
    let totalAmount = 0;
    items.forEach(item => {
      const amount = (item.quantity || 0) * (item.unit_price || 0);
      item.amount = amount;
      totalAmount += amount;
    });

    const [result] = await conn.query(
      'INSERT INTO crm_purchase_plan (plan_no, name, total_amount, remark, create_by) VALUES (?, ?, ?, ?, ?)',
      [planNo, name.trim(), totalAmount, remark || null, req.user.userId]
    );
    const planId = result.insertId;

    for (const item of items) {
      await conn.query(
        'INSERT INTO crm_purchase_plan_item (plan_id, product_id, supplier_id, quantity, unit_price, amount, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [planId, item.product_id, item.supplier_id || null, item.quantity, item.unit_price || null, item.amount, item.reason || null]
      );
    }

    await conn.commit();
    res.json({ code: 200, message: '创建成功', data: { id: planId, plan_no: planNo } });
  } catch (error) {
    await conn.rollback();
    console.error('[采购计划] 创建失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  } finally { conn.release(); }
});

// 更新计划
router.put('/:id', authenticateToken, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const [[plan]] = await pool.query('SELECT status FROM crm_purchase_plan WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!plan) return res.status(404).json({ code: 404, message: '计划不存在', data: null });
    if (plan.status !== 'draft') return res.status(400).json({ code: 400, message: '只能编辑草稿状态的计划', data: null });

    const { name, remark, items } = req.body;
    await conn.beginTransaction();

    const fields = [], values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
    if (remark !== undefined) { fields.push('remark = ?'); values.push(remark); }

    let totalAmount = 0;
    if (items) {
      items.forEach(item => { totalAmount += (item.quantity || 0) * (item.unit_price || 0); });
      fields.push('total_amount = ?'); values.push(totalAmount);
    }

    if (fields.length > 0) {
      values.push(id);
      await conn.query(`UPDATE crm_purchase_plan SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    if (items) {
      await conn.query('DELETE FROM crm_purchase_plan_item WHERE plan_id = ?', [id]);
      for (const item of items) {
        const amount = (item.quantity || 0) * (item.unit_price || 0);
        await conn.query(
          'INSERT INTO crm_purchase_plan_item (plan_id, product_id, supplier_id, quantity, unit_price, amount, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, item.product_id, item.supplier_id || null, item.quantity, item.unit_price || null, amount, item.reason || null]
        );
      }
    }

    await conn.commit();
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    await conn.rollback();
    console.error('[采购计划] 更新失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  } finally { conn.release(); }
});

// 删除计划
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const [[plan]] = await pool.query('SELECT status FROM crm_purchase_plan WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!plan) return res.status(404).json({ code: 404, message: '计划不存在', data: null });
    if (plan.status !== 'draft') return res.status(400).json({ code: 400, message: '只能删除草稿状态的计划', data: null });
    await pool.query('UPDATE crm_purchase_plan SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[采购计划] 删除失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 提交审批
router.post('/:id/submit', authenticateToken, async (req, res) => {
  try {
    const [[plan]] = await pool.query('SELECT status FROM crm_purchase_plan WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!plan) return res.status(404).json({ code: 404, message: '计划不存在', data: null });
    if (plan.status !== 'draft') return res.status(400).json({ code: 400, message: '只有草稿状态可以提交', data: null });
    await pool.query("UPDATE crm_purchase_plan SET status = 'submitted' WHERE id = ?", [req.params.id]);
    res.json({ code: 200, message: '已提交审批', data: null });
  } catch (error) {
    console.error('[采购计划] 提交失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 批准计划
router.post('/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [[plan]] = await pool.query('SELECT status FROM crm_purchase_plan WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!plan) return res.status(404).json({ code: 404, message: '计划不存在', data: null });
    if (plan.status !== 'submitted') return res.status(400).json({ code: 400, message: '只有已提交状态可以批准', data: null });
    await pool.query("UPDATE crm_purchase_plan SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?", [req.user.userId, req.params.id]);
    res.json({ code: 200, message: '已批准', data: null });
  } catch (error) {
    console.error('[采购计划] 批准失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 自动生成采购计划（根据库存预警）
router.post('/auto-generate', authenticateToken, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { supplier_id } = req.body;

    // 查询库存偏低的产品
    let where = 'WHERE p.deleted_at IS NULL AND sa.alert_enabled = 1 AND p.stock < sa.min_qty';
    const params = [];
    if (supplier_id) {
      // 如果指定了供应商，只取该供应商关联的产品（通过最近采购记录推断）
      where += ' AND EXISTS (SELECT 1 FROM crm_purchase_item pi JOIN crm_purchase_order po ON pi.order_id = po.id WHERE pi.product_id = p.id AND po.supplier_id = ? AND po.deleted_at IS NULL)';
      params.push(supplier_id);
    }

    const [lowStockProducts] = await pool.query(`
      SELECT p.id, p.name, p.stock, sa.min_qty, sa.max_qty,
             (sa.max_qty - p.stock) as suggest_qty,
             (SELECT po.supplier_id FROM crm_purchase_item pi
              JOIN crm_purchase_order po ON pi.order_id = po.id
              WHERE pi.product_id = p.id AND po.deleted_at IS NULL
              ORDER BY po.create_time DESC LIMIT 1) as last_supplier_id,
             (SELECT pi.unit_price FROM crm_purchase_item pi
              JOIN crm_purchase_order po ON pi.order_id = po.id
              WHERE pi.product_id = p.id AND po.deleted_at IS NULL
              ORDER BY po.create_time DESC LIMIT 1) as last_price
      FROM crm_product p
      JOIN crm_stock_alert sa ON p.id = sa.product_id
      ${where}
      ORDER BY (p.stock - sa.min_qty) ASC
    `, params);

    if (lowStockProducts.length === 0) {
      return res.json({ code: 200, message: '没有库存偏低的产品', data: null });
    }

    await conn.beginTransaction();
    const planNo = await generatePlanNo();
    let totalAmount = 0;
    lowStockProducts.forEach(p => { totalAmount += (p.suggest_qty || 0) * (p.last_price || 0); });

    const [result] = await conn.query(
      'INSERT INTO crm_purchase_plan (plan_no, name, total_amount, remark, create_by) VALUES (?, ?, ?, ?, ?)',
      [planNo, '自动生成-库存补货计划', totalAmount, '系统根据库存预警自动生成', req.user.userId]
    );
    const planId = result.insertId;

    for (const p of lowStockProducts) {
      await conn.query(
        'INSERT INTO crm_purchase_plan_item (plan_id, product_id, supplier_id, quantity, unit_price, amount, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [planId, p.id, p.last_supplier_id || null, p.suggest_qty, p.last_price || null, (p.suggest_qty || 0) * (p.last_price || 0), `库存不足（当前${p.stock}，最低${p.min_qty}）`]
      );
    }

    await conn.commit();
    res.json({ code: 200, message: '自动生成成功', data: { id: planId, plan_no: planNo, item_count: lowStockProducts.length } });
  } catch (error) {
    await conn.rollback();
    console.error('[采购计划] 自动生成失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  } finally { conn.release(); }
});

// 统计
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const [[total]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_purchase_plan WHERE deleted_at IS NULL");
    const [[submitted]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_purchase_plan WHERE deleted_at IS NULL AND status = 'submitted'");
    const [[approved]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_purchase_plan WHERE deleted_at IS NULL AND status = 'approved'");
    const [[ordered]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_purchase_plan WHERE deleted_at IS NULL AND status = 'ordered'");
    res.json({ code: 200, message: '查询成功', data: { total: total.cnt, submitted: submitted.cnt, approved: approved.cnt, ordered: ordered.cnt } });
  } catch (error) {
    console.error('[采购计划] 统计查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 采购计划转采购单
router.post('/:id/convert-to-purchase', authenticateToken, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const planId = req.params.id;

    // 验证计划状态
    const [[plan]] = await conn.query('SELECT * FROM crm_purchase_plan WHERE id = ? AND deleted_at IS NULL', [planId]);
    if (!plan) return res.status(404).json({ code: 404, message: '计划不存在', data: null });
    if (plan.status !== 'approved') return res.status(400).json({ code: 400, message: '只有已批准的计划可以转采购单', data: null });

    // 查询计划明细
    const [items] = await conn.query(
      'SELECT pi.*, p.name as product_name FROM crm_purchase_plan_item pi LEFT JOIN crm_product p ON pi.product_id = p.id WHERE pi.plan_id = ?',
      [planId]
    );
    if (items.length === 0) return res.status(400).json({ code: 400, message: '计划无明细', data: null });

    // 按供应商分组
    const groups = {};
    for (const item of items) {
      const key = item.supplier_id || 0;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }

    await conn.beginTransaction();

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const createdOrderIds = [];

    // 获取当日序号
    const [[{ seq }]] = await conn.query("SELECT COUNT(*) as seq FROM crm_purchase_order WHERE order_no LIKE ?", [`PO-${dateStr}-%`]);

    for (const [supplierId, groupItems] of Object.entries(groups)) {
      const orderNo = `PO-${dateStr}-${String(seq + createdOrderIds.length + 1).padStart(3, '0')}`;
      const totalAmount = groupItems.reduce((s, i) => s + parseFloat(i.amount || 0), 0);

      // 创建采购单
      const [orderResult] = await conn.query(
        `INSERT INTO crm_purchase_order (order_no, supplier_id, title, total_amount, status, create_by, create_time)
         VALUES (?, ?, ?, ?, '草稿', ?, NOW())`,
        [orderNo, parseInt(supplierId) || null, `采购计划${plan.plan_no}转采购`, totalAmount, req.user.userId]
      );
      const orderId = orderResult.insertId;
      createdOrderIds.push(orderId);

      // 创建采购单明细
      for (const item of groupItems) {
        await conn.query(
          `INSERT INTO crm_purchase_item (order_id, product_id, product_name, quantity, unit, unit_price, amount, remark)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [orderId, item.product_id, item.product_name, item.quantity, item.unit, item.unit_price, item.amount, item.reason]
        );
        // 更新计划明细状态
        await conn.query('UPDATE crm_purchase_plan_item SET status = "ordered" WHERE id = ?', [item.id]);
      }
    }

    // 更新计划状态
    await conn.query("UPDATE crm_purchase_plan SET status = 'completed' WHERE id = ?", [planId]);

    await conn.commit();
    res.json({ code: 200, message: `已生成 ${createdOrderIds.length} 张采购单`, data: { order_ids: createdOrderIds } });
  } catch (error) {
    await conn.rollback();
    console.error('[采购计划] 转采购单失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  } finally {
    conn.release();
  }
});

module.exports = router;
