/**
 * 产品核心服务层
 * 从 routes/product.js 提取的业务逻辑
 */

const { paginatedQuery } = require('../utils/pagination');

// ============ 产品 CRUD ============

async function listProducts(pool, params = {}) {
  const { page = 1, pageSize = 20, keyword, name, code, category, status } = params;
  const queryParams = [];

  let whereClause;
  if (status === 0 || status === '0') {
    whereClause = 'WHERE deleted_at IS NOT NULL';
  } else {
    whereClause = 'WHERE deleted_at IS NULL';
  }
  if (keyword) { whereClause += ' AND (name LIKE ? OR code LIKE ?)'; queryParams.push(`%${keyword}%`, `%${keyword}%`); }
  if (name) { whereClause += ' AND name LIKE ?'; queryParams.push(`%${name}%`); }
  if (code) { whereClause += ' AND code LIKE ?'; queryParams.push(`%${code}%`); }
  if (category) { whereClause += ' AND category = ?'; queryParams.push(category); }

  return paginatedQuery(pool, {
    baseQuery: `SELECT id, name, code, category, unit, price, cost_price, stock, status, description, create_time
     FROM crm_product ${whereClause}`,
    countQuery: `SELECT COUNT(*) as total FROM crm_product ${whereClause}`,
    params: queryParams,
    page,
    pageSize,
    orderBy: 'create_time DESC'
  });
}

async function getProduct(pool, id) {
  const [rows] = await pool.query(
    'SELECT id, name, code, category, unit, price, stock, description, status, create_time, update_time FROM crm_product WHERE id = ? AND deleted_at IS NULL', [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

async function getProductFull(pool, id) {
  const [rows] = await pool.query(
    `SELECT id, name, code, category, unit, price, cost_price, stock, description, status, create_time, update_time, deleted_at
     FROM crm_product WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

async function createProduct(pool, data) {
  const { name, code, category, unit, price, cost_price, stock, description } = data;
  const [result] = await pool.query(
    `INSERT INTO crm_product (name, code, category, unit, price, cost_price, stock, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, code || null, category || null, unit || '台', price || 0, cost_price || 0, stock || 0, description || null]
  );
  return { id: result.insertId };
}

async function updateProduct(pool, id, data) {
  const updates = [];
  const params = [];
  if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
  if (data.code !== undefined) { updates.push('code = ?'); params.push(data.code); }
  if (data.category !== undefined) { updates.push('category = ?'); params.push(data.category); }
  if (data.unit !== undefined) { updates.push('unit = ?'); params.push(data.unit); }
  if (data.price !== undefined) { updates.push('price = ?'); params.push(data.price); }
  if (data.cost_price !== undefined) { updates.push('cost_price = ?'); params.push(data.cost_price); }
  if (data.stock !== undefined) { updates.push('stock = ?'); params.push(data.stock); }
  if (data.status !== undefined) { updates.push('status = ?'); params.push(data.status); }
  if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description); }
  if (updates.length === 0) return;
  params.push(id);
  await pool.query(`UPDATE crm_product SET ${updates.join(', ')} WHERE id = ?`, params);
}

async function deleteProduct(pool, id) {
  await pool.query('UPDATE crm_product SET deleted_at = NOW() WHERE id = ?', [id]);
}

async function getCategories(pool) {
  const [rows] = await pool.query(
    'SELECT DISTINCT category FROM crm_product WHERE category IS NOT NULL AND deleted_at IS NULL ORDER BY category'
  );
  return rows.map(r => r.category);
}

// ============ 产品价格表 ============

async function getProductPrices(pool, productId) {
  const [rows] = await pool.query(
    `SELECT id, product_id, price_type, customer_level, unit_price, min_quantity, currency, valid_from, valid_to, status, create_time, update_time, deleted_at
     FROM crm_product_price WHERE product_id = ? AND deleted_at IS NULL ORDER BY price_type, customer_level`,
    [productId]
  );
  return rows;
}

async function createPrice(pool, data) {
  const { product_id, price_type, customer_level, unit_price, min_quantity, currency, valid_from, valid_to } = data;
  const [result] = await pool.query(
    `INSERT INTO crm_product_price (product_id, price_type, customer_level, unit_price, min_quantity, currency, valid_from, valid_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [product_id, price_type, customer_level || null, parseFloat(unit_price), min_quantity || 1, currency || 'CNY', valid_from || null, valid_to || null]
  );
  return { id: result.insertId };
}

async function updatePrice(pool, id, data) {
  const fields = [];
  const values = [];
  if (data.price_type !== undefined) { fields.push('price_type = ?'); values.push(data.price_type); }
  if (data.customer_level !== undefined) { fields.push('customer_level = ?'); values.push(data.customer_level); }
  if (data.unit_price !== undefined) { fields.push('unit_price = ?'); values.push(parseFloat(data.unit_price)); }
  if (data.min_quantity !== undefined) { fields.push('min_quantity = ?'); values.push(parseInt(data.min_quantity)); }
  if (data.currency !== undefined) { fields.push('currency = ?'); values.push(data.currency); }
  if (data.valid_from !== undefined) { fields.push('valid_from = ?'); values.push(data.valid_from); }
  if (data.valid_to !== undefined) { fields.push('valid_to = ?'); values.push(data.valid_to); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(parseInt(data.status)); }
  if (fields.length === 0) return;
  values.push(id);
  await pool.query(`UPDATE crm_product_price SET ${fields.join(', ')} WHERE id = ?`, values);
}

async function deletePrice(pool, id) {
  await pool.query('UPDATE crm_product_price SET deleted_at = NOW() WHERE id = ?', [id]);
}

async function getDefaultPrice(pool, productId, customerLevel) {
  let price = null;

  if (customerLevel) {
    const [levelPrices] = await pool.query(
      `SELECT id, product_id, price_type, customer_level, unit_price, min_quantity, currency, valid_from, valid_to, status
       FROM crm_product_price WHERE product_id = ? AND customer_level = ? AND deleted_at IS NULL
       AND (valid_from IS NULL OR valid_from <= CURDATE()) AND (valid_to IS NULL OR valid_to >= CURDATE())
       ORDER BY unit_price ASC LIMIT 1`,
      [productId, customerLevel]
    );
    if (levelPrices.length > 0) price = levelPrices[0];
  }

  if (!price) {
    const [[product]] = await pool.query('SELECT price FROM crm_product WHERE id = ?', [productId]);
    price = { unit_price: product?.price || 0, currency: 'CNY', price_type: 'default' };
  }

  return price;
}

module.exports = {
  listProducts, getProduct, getProductFull, createProduct, updateProduct, deleteProduct, getCategories,
  getProductPrices, createPrice, updatePrice, deletePrice, getDefaultPrice
};
