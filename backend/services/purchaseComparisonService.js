/**
 * 采购比价服务层
 */

/**
 * 生成比价单号：BJ + YYYYMMDD + 3位序号
 */
async function generateComparisonNo(pool) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `BJ${dateStr}`;
  const [[row]] = await pool.query(
    'SELECT COUNT(*) as cnt FROM crm_purchase_comparison WHERE comparison_no LIKE ?',
    [`${prefix}%`]
  );
  const seq = String((parseInt(row.cnt) || 0) + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

/**
 * 创建比价单
 */
async function createComparison(pool, data, userId) {
  const { request_id, title, product_name, quantity, unit } = data;
  const comparisonNo = await generateComparisonNo(pool);

  const [result] = await pool.query(
    `INSERT INTO crm_purchase_comparison
     (comparison_no, request_id, title, product_name, quantity, unit, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
    [comparisonNo, request_id || null, title, product_name || null, quantity || null, unit || null, userId]
  );

  return { id: result.insertId, comparison_no: comparisonNo };
}

/**
 * 查询比价单列表（带子查询供应商数）
 */
async function listComparisons(pool, params = {}) {
  const { page = 1, pageSize = 20, status, keyword } = params;
  const safePageSize = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
  const offset = (Math.max(1, parseInt(page) || 1) - 1) * safePageSize;

  let where = '1=1';
  const queryParams = [];

  if (status) {
    where += ' AND c.status = ?';
    queryParams.push(status);
  }

  if (keyword) {
    where += ' AND (c.title LIKE ? OR c.comparison_no LIKE ? OR c.product_name LIKE ?)';
    queryParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_purchase_comparison c WHERE ${where}`,
    queryParams
  );

  const [rows] = await pool.query(
    `SELECT c.*, u.real_name as created_by_name,
            (SELECT COUNT(*) FROM crm_purchase_comparison_item ci WHERE ci.comparison_id = c.id) as supplier_count,
            s.name as selected_supplier_name
     FROM crm_purchase_comparison c
     LEFT JOIN sys_user u ON c.created_by = u.id
     LEFT JOIN crm_supplier s ON c.selected_supplier_id = s.id
     WHERE ${where}
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, safePageSize, offset]
  );

  return { list: rows, total, page: parseInt(page), pageSize: safePageSize };
}

/**
 * 查询比价单详情（含供应商报价）
 */
async function getComparisonDetail(pool, id) {
  const [[comparison]] = await pool.query(
    `SELECT c.*, u.real_name as created_by_name,
            r.title as request_title,
            s.name as selected_supplier_name
     FROM crm_purchase_comparison c
     LEFT JOIN sys_user u ON c.created_by = u.id
     LEFT JOIN crm_purchase_request r ON c.request_id = r.id
     LEFT JOIN crm_supplier s ON c.selected_supplier_id = s.id
     WHERE c.id = ?`,
    [id]
  );

  if (!comparison) return null;

  const [items] = await pool.query(
    `SELECT ci.*, s.name as supplier_name
     FROM crm_purchase_comparison_item ci
     JOIN crm_supplier s ON ci.supplier_id = s.id
     WHERE ci.comparison_id = ?
     ORDER BY ci.total_price ASC, ci.delivery_days ASC`,
    [id]
  );

  return { comparison, items };
}

/**
 * 添加供应商报价
 */
async function addSupplierQuote(pool, comparisonId, quoteData) {
  const { supplier_id, unit_price, total_price, delivery_days, payment_terms, remark } = quoteData;

  const [[exists]] = await pool.query(
    'SELECT id FROM crm_purchase_comparison WHERE id = ? AND status != "cancelled"',
    [comparisonId]
  );

  if (!exists) {
    const err = new Error('比价单不存在或已取消');
    err.code = 404;
    throw err;
  }

  const [[duplicate]] = await pool.query(
    'SELECT id FROM crm_purchase_comparison_item WHERE comparison_id = ? AND supplier_id = ?',
    [comparisonId, supplier_id]
  );

  if (duplicate) {
    const err = new Error('该供应商已报价');
    err.code = 400;
    throw err;
  }

  const [result] = await pool.query(
    `INSERT INTO crm_purchase_comparison_item
     (comparison_id, supplier_id, unit_price, total_price, delivery_days, payment_terms, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [comparisonId, supplier_id, unit_price || 0, total_price || 0, delivery_days || null, payment_terms || null, remark || null]
  );

  return { id: result.insertId };
}

/**
 * 选择供应商
 * 若 supplierId 有效则直接选中；为 null 时自动按最低总价→最短交期选择
 */
async function selectSupplier(pool, comparisonId, supplierId) {
  const [[comparison]] = await pool.query(
    'SELECT status FROM crm_purchase_comparison WHERE id = ?',
    [comparisonId]
  );

  if (!comparison) {
    const err = new Error('比价单不存在');
    err.code = 404;
    throw err;
  }

  if (comparison.status === 'cancelled') {
    const err = new Error('比价单已取消');
    err.code = 400;
    throw err;
  }

  let selectedSupplierId = supplierId;

  if (!selectedSupplierId) {
    const [[best]] = await pool.query(
      `SELECT supplier_id FROM crm_purchase_comparison_item
       WHERE comparison_id = ?
       ORDER BY total_price ASC, delivery_days ASC
       LIMIT 1`,
      [comparisonId]
    );

    if (!best) {
      const err = new Error('暂无可选供应商报价');
      err.code = 400;
      throw err;
    }

    selectedSupplierId = best.supplier_id;
  } else {
    const [[valid]] = await pool.query(
      'SELECT id FROM crm_purchase_comparison_item WHERE comparison_id = ? AND supplier_id = ?',
      [comparisonId, selectedSupplierId]
    );

    if (!valid) {
      const err = new Error('选中的供应商未参与报价');
      err.code = 400;
      throw err;
    }
  }

  await pool.query(
    `UPDATE crm_purchase_comparison
     SET selected_supplier_id = ?, status = 'completed'
     WHERE id = ?`,
    [selectedSupplierId, comparisonId]
  );

  return { selected_supplier_id: selectedSupplierId };
}

/**
 * 取消比价单
 */
async function cancelComparison(pool, id) {
  const [[comparison]] = await pool.query(
    'SELECT status FROM crm_purchase_comparison WHERE id = ?',
    [id]
  );

  if (!comparison) {
    const err = new Error('比价单不存在');
    err.code = 404;
    throw err;
  }

  if (comparison.status === 'cancelled') {
    return true;
  }

  await pool.query(
    "UPDATE crm_purchase_comparison SET status = 'cancelled' WHERE id = ?",
    [id]
  );

  return true;
}

module.exports = {
  generateComparisonNo,
  createComparison,
  listComparisons,
  getComparisonDetail,
  addSupplierQuote,
  selectSupplier,
  cancelComparison
};
