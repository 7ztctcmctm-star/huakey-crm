/**
 * 库存服务层
 * 从 routes/inventory.js 提取的业务逻辑
 */

// ============ 库存列表 ============

async function listInventory(pool, params = {}) {
  const { category = '', keyword = '', stock_status = '', page = 1, pageSize = 20 } = params;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = 'WHERE p.deleted_at IS NULL';
  const queryParams = [];

  if (category) { where += ' AND p.category = ?'; queryParams.push(category); }
  if (keyword) { where += ' AND (p.name LIKE ? OR p.code LIKE ?)'; queryParams.push(`%${keyword}%`, `%${keyword}%`); }

  if (stock_status === 'low') {
    where += ' AND sa.alert_enabled = 1 AND p.stock < sa.min_qty';
  } else if (stock_status === 'high') {
    where += ' AND sa.alert_enabled = 1 AND p.stock > sa.max_qty';
  } else if (stock_status === 'normal') {
    where += ' AND (sa.alert_enabled IS NULL OR (p.stock >= COALESCE(sa.min_qty, 0) AND p.stock <= COALESCE(sa.max_qty, 9999)))';
  }

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_product p LEFT JOIN crm_stock_alert sa ON p.id = sa.product_id ${where}`, queryParams
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
  `, [...queryParams, parseInt(pageSize), offset]);

  return { list: rows, total };
}

// ============ 库存变动记录 ============

async function getMovements(pool, params = {}) {
  const { product_id, movement_type, start_date, end_date, page = 1, pageSize = 20 } = params;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = 'WHERE 1=1';
  const queryParams = [];

  if (product_id) { where += ' AND m.product_id = ?'; queryParams.push(product_id); }
  if (movement_type) { where += ' AND m.movement_type = ?'; queryParams.push(movement_type); }
  if (start_date) { where += ' AND m.create_time >= ?'; queryParams.push(start_date); }
  if (end_date) { where += ' AND m.create_time <= ?'; queryParams.push(end_date + ' 23:59:59'); }

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_stock_movement m ${where}`, queryParams
  );

  const [rows] = await pool.query(`
    SELECT m.id, m.product_id, m.movement_type, m.quantity, m.before_qty, m.after_qty, m.related_type, m.related_id, m.remark, m.operator_id, m.create_time,
           p.name as product_name, p.code as product_code, u.real_name as operator_name
    FROM crm_stock_movement m
    JOIN crm_product p ON m.product_id = p.id
    LEFT JOIN sys_user u ON m.operator_id = u.id
    ${where}
    ORDER BY m.create_time DESC LIMIT ? OFFSET ?
  `, [...queryParams, parseInt(pageSize), offset]);

  return { list: rows, total };
}

// ============ 入库 ============

async function stockIn(pool, data, userId) {
  const { product_id, quantity, remark } = data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[product]] = await conn.query('SELECT id, stock FROM crm_product WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [product_id]);
    if (!product) { await conn.rollback(); return { error: true, status: 404, message: '产品不存在' }; }

    const beforeQty = product.stock;
    const afterQty = beforeQty + parseInt(quantity);
    await conn.query('UPDATE crm_product SET stock = ? WHERE id = ?', [afterQty, product_id]);
    await conn.query(
      'INSERT INTO crm_stock_movement (product_id, movement_type, quantity, before_qty, after_qty, remark, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [product_id, 'in', parseInt(quantity), beforeQty, afterQty, remark || '手动入库', userId]
    );

    await conn.commit();
    return { before: beforeQty, after: afterQty };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}

// ============ 出库 ============

async function stockOut(pool, data, userId) {
  const { product_id, quantity, remark } = data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[product]] = await conn.query('SELECT id, stock FROM crm_product WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [product_id]);
    if (!product) { await conn.rollback(); return { error: true, status: 404, message: '产品不存在' }; }
    if (product.stock < quantity) { await conn.rollback(); return { error: true, status: 400, message: `库存不足，当前库存 ${product.stock}` }; }

    const beforeQty = product.stock;
    const afterQty = beforeQty - parseInt(quantity);
    await conn.query('UPDATE crm_product SET stock = ? WHERE id = ?', [afterQty, product_id]);
    await conn.query(
      'INSERT INTO crm_stock_movement (product_id, movement_type, quantity, before_qty, after_qty, remark, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [product_id, 'out', -parseInt(quantity), beforeQty, afterQty, remark || '手动出库', userId]
    );

    await conn.commit();
    return { before: beforeQty, after: afterQty };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}

// ============ 库存调整（盘点） ============

async function adjustStock(pool, data, userId) {
  const { product_id, new_qty, remark } = data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[product]] = await conn.query('SELECT id, stock FROM crm_product WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [product_id]);
    if (!product) { await conn.rollback(); return { error: true, status: 404, message: '产品不存在' }; }

    const beforeQty = product.stock;
    const afterQty = parseInt(new_qty);
    const diff = afterQty - beforeQty;
    await conn.query('UPDATE crm_product SET stock = ? WHERE id = ?', [afterQty, product_id]);
    await conn.query(
      'INSERT INTO crm_stock_movement (product_id, movement_type, quantity, before_qty, after_qty, remark, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [product_id, 'adjust', diff, beforeQty, afterQty, remark || '库存盘点调整', userId]
    );

    await conn.commit();
    return { before: beforeQty, after: afterQty, diff };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}

// ============ 库存预警列表 ============

async function getAlerts(pool) {
  const [rows] = await pool.query(`
    SELECT p.id, p.name, p.code, p.category, p.stock, sa.min_qty, sa.max_qty,
           CASE WHEN p.stock < sa.min_qty THEN 'low' ELSE 'high' END as alert_type
    FROM crm_product p
    JOIN crm_stock_alert sa ON p.id = sa.product_id
    WHERE p.deleted_at IS NULL AND sa.alert_enabled = 1
      AND (p.stock < sa.min_qty OR p.stock > sa.max_qty)
    ORDER BY p.stock ASC
  `);
  return rows;
}

// ============ 配置预警阈值 ============

async function updateAlertConfig(pool, productId, data) {
  const { min_qty, max_qty, alert_enabled } = data;

  const [[product]] = await pool.query('SELECT id FROM crm_product WHERE id = ? AND deleted_at IS NULL', [productId]);
  if (!product) return { error: true, status: 404, message: '产品不存在' };

  await pool.query(`
    INSERT INTO crm_stock_alert (product_id, min_qty, max_qty, alert_enabled)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE min_qty = VALUES(min_qty), max_qty = VALUES(max_qty), alert_enabled = VALUES(alert_enabled)
  `, [productId, min_qty || 0, max_qty || 9999, alert_enabled !== undefined ? alert_enabled : 1]);

  return { success: true };
}

// ============ 库存统计 ============

async function getStats(pool) {
  const [[skuCount]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_product WHERE deleted_at IS NULL");
  const [[totalStock]] = await pool.query("SELECT COALESCE(SUM(stock), 0) as total FROM crm_product WHERE deleted_at IS NULL");
  const [[totalValue]] = await pool.query("SELECT COALESCE(SUM(stock * COALESCE(cost_price, 0)), 0) as total FROM crm_product WHERE deleted_at IS NULL");
  const [[lowCount]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_product p JOIN crm_stock_alert sa ON p.id = sa.product_id WHERE p.deleted_at IS NULL AND sa.alert_enabled = 1 AND p.stock < sa.min_qty");
  const [[highCount]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_product p JOIN crm_stock_alert sa ON p.id = sa.product_id WHERE p.deleted_at IS NULL AND sa.alert_enabled = 1 AND p.stock > sa.max_qty");

  return { sku_count: skuCount.cnt, total_stock: totalStock.total, total_value: totalValue.total, low_count: lowCount.cnt, high_count: highCount.cnt };
}

// ============ 产品分类列表 ============

async function getCategories(pool) {
  const [rows] = await pool.query("SELECT DISTINCT category FROM crm_product WHERE deleted_at IS NULL AND category IS NOT NULL ORDER BY category");
  return rows.map(r => r.category);
}

module.exports = {
  listInventory,
  getMovements,
  stockIn,
  stockOut,
  adjustStock,
  getAlerts,
  updateAlertConfig,
  getStats,
  getCategories
};
