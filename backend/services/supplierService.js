/**
 * 供应商核心服务层
 * 从 routes/supplier.js 提取的业务逻辑
 */

async function listSuppliers(pool, params = {}, permission = null) {
  const page = parseInt(params.page) || 1;
  const pageSize = Math.min(Math.max(parseInt(params.pageSize) || 10, 1), 200);
  const keyword = String(params.keyword || '');
  const type = String(params.type || '');
  const level = String(params.level || '');
  const status = String(params.status || '');
  const offset = (page - 1) * pageSize;

  let permissionClause = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionClause = permission.clause;
    permParams = permission.params || [];
  }

  let sql = `SELECT s.*, u.real_name as owner_name,
    (SELECT COUNT(*) FROM crm_supplier_contact c WHERE c.supplier_id = s.id) as contact_count,
    (SELECT COUNT(*) FROM crm_supplier_qualification q WHERE q.supplier_id = s.id AND q.status = 1) as valid_cert_count
    FROM crm_supplier s
    LEFT JOIN sys_user u ON s.owner_id = u.id
    WHERE s.deleted_at IS NULL AND ${permissionClause}`;

  const params2 = [...permParams];
  if (keyword) { sql += ' AND (s.name LIKE ? OR s.supplier_no LIKE ? OR s.contact_person LIKE ?)'; params2.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (type) { sql += ' AND s.type = ?'; params2.push(type); }
  if (level) { sql += ' AND s.level = ?'; params2.push(level); }
  if (status) { sql += ' AND s.status = ?'; params2.push(status); }

  sql += ' ORDER BY s.create_time DESC LIMIT ?, ?';
  params2.push(offset, pageSize);
  const [rows] = await pool.query(sql, params2);

  let countSql = `SELECT COUNT(*) as total FROM crm_supplier s WHERE s.deleted_at IS NULL AND ${permissionClause}`;
  const countParams = [...permParams];
  if (keyword) { countSql += ' AND (s.name LIKE ? OR s.supplier_no LIKE ? OR s.contact_person LIKE ?)'; countParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (type) { countSql += ' AND s.type = ?'; countParams.push(type); }
  if (level) { countSql += ' AND s.level = ?'; countParams.push(level); }
  if (status) { countSql += ' AND s.status = ?'; countParams.push(status); }

  const [countResult] = await pool.query(countSql, countParams);
  return { list: rows, total: countResult[0].total };
}

async function getSupplier(pool, id, permission = null) {
  let permissionClause = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionClause = permission.clause;
    permParams = permission.params || [];
  }

  const [suppliers] = await pool.query(`
    SELECT s.*, u.real_name as owner_name, ub.real_name as create_by_name
    FROM crm_supplier s
    LEFT JOIN sys_user u ON s.owner_id = u.id
    LEFT JOIN sys_user ub ON s.create_by = ub.id
    WHERE s.id = ? AND s.deleted_at IS NULL AND ${permissionClause}
  `, [id, ...permParams]);

  if (!suppliers.length) return null;
  const supplier = suppliers[0];

  const [contacts] = await pool.query(
    'SELECT id, supplier_id, name, position, department, phone, mobile, email, wechat, role, is_primary, remark FROM crm_supplier_contact WHERE supplier_id = ? ORDER BY is_primary DESC, id ASC', [id]);
  const [qualifications] = await pool.query(
    'SELECT id, supplier_id, cert_type, cert_no, cert_name, issue_date, expire_date, issuing_authority, file_path, status, remark FROM crm_supplier_qualification WHERE supplier_id = ? ORDER BY expire_date ASC', [id]);
  const [ratings] = await pool.query(
    `SELECT r.*, u.real_name as evaluator_name FROM crm_supplier_rating r LEFT JOIN sys_user u ON r.evaluator_id = u.id WHERE r.supplier_id = ? ORDER BY r.rating_period DESC LIMIT 10`, [id]);
  const [relatedCustomers] = await pool.query(
    `SELECT r.*, cu.company_name as customer_name FROM crm_customer_supplier_relation r LEFT JOIN crm_customer cu ON r.customer_id = cu.id WHERE r.supplier_id = ? ORDER BY r.create_time DESC`, [id]);

  return { ...supplier, contacts, qualifications, ratings, relatedCustomers };
}

async function createSupplier(pool, data, userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const [count] = await conn.query('SELECT COUNT(*) as cnt FROM crm_supplier WHERE supplier_no LIKE ? FOR UPDATE', [`SUP-${dateStr}-%`]);
    const seq = String(count[0].cnt + 1).padStart(3, '0');
    const supplierNo = `SUP-${dateStr}-${seq}`;

    const [result] = await conn.query(
      `INSERT INTO crm_supplier (supplier_no, name, short_name, type, industry, level, contact_person, contact_phone, contact_email, address, payment_terms, delivery_days, remark, owner_id, create_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [supplierNo, data.name, data.short_name || null, data.type, data.industry || null, data.level, data.contact_person || null, data.contact_phone || null, data.contact_email || null, data.address || null, data.payment_terms || null, data.delivery_days || null, data.remark || null, userId, userId]
    );
    const supplierId = result.insertId;

    if (data.contact_person && data.contact_phone) {
      await conn.query(
        'INSERT INTO crm_supplier_contact (supplier_id, name, phone, mobile, is_primary) VALUES (?, ?, ?, ?, 1)',
        [supplierId, data.contact_person, data.contact_phone || null, data.contact_phone || null]
      );
    }

    await conn.commit();
    return { id: supplierId, supplier_no: supplierNo };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function updateSupplier(pool, id, data) {
  const allowedFields = ['name', 'short_name', 'type', 'industry', 'level', 'status', 'contact_person', 'contact_phone', 'contact_email', 'address', 'payment_terms', 'delivery_days', 'remark'];
  const setClauses = [];
  const params = [];
  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key) && value !== undefined) { setClauses.push(`${key} = ?`); params.push(value); }
  }
  if (setClauses.length === 0) return;
  params.push(id);
  await pool.query(`UPDATE crm_supplier SET ${setClauses.join(', ')} WHERE id = ?`, params);
}

async function deleteSupplier(pool, id) {
  await pool.query('UPDATE crm_supplier SET deleted_at = NOW() WHERE id=?', [id]);
}

async function getSupplierForEdit(pool, id) {
  const [rows] = await pool.query('SELECT * FROM crm_supplier WHERE id=? AND deleted_at IS NULL', [id]);
  return rows.length > 0 ? rows[0] : null;
}

async function addContact(pool, data) {
  const [result] = await pool.query(
    `INSERT INTO crm_supplier_contact (supplier_id, name, position, department, phone, mobile, email, wechat, role, is_primary, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.supplier_id, data.name, data.position || null, data.department || null, data.phone || null, data.mobile || null, data.email || null, data.wechat || null, data.role, data.is_primary, data.remark || null]
  );
  return { id: result.insertId };
}

async function updateContact(pool, id, data) {
  const allowed = ['name', 'position', 'department', 'phone', 'mobile', 'email', 'wechat', 'role', 'is_primary', 'remark'];
  const setClauses = [];
  const params = [];
  for (const [k, v] of Object.entries(data)) {
    if (allowed.includes(k) && v !== undefined) { setClauses.push(`${k} = ?`); params.push(v); }
  }
  if (setClauses.length === 0) return;
  params.push(id);
  await pool.query(`UPDATE crm_supplier_contact SET ${setClauses.join(', ')} WHERE id = ?`, params);
}

async function deleteContact(pool, id) {
  await pool.query('UPDATE crm_supplier_contact SET deleted_at = NOW() WHERE id = ?', [id]);
}

async function getSupplierOptions(pool) {
  const [rows] = await pool.query('SELECT id, name, level, type FROM crm_supplier WHERE status = 1 AND deleted_at IS NULL ORDER BY name');
  return rows;
}

async function addRating(pool, data, evaluatorId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const total_score = Number(((data.quality_score + data.delivery_score + data.service_score + data.price_score) / 4).toFixed(2));
    const [result] = await conn.query(
      `INSERT INTO crm_supplier_rating (supplier_id, quality_score, delivery_score, service_score, price_score, total_score, rating_period, evaluator_id, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.supplier_id, data.quality_score, data.delivery_score, data.service_score, data.price_score, total_score, data.rating_period, evaluatorId, data.remark || null]
    );
    await conn.query('UPDATE crm_supplier SET rating = ? WHERE id = ?', [total_score, data.supplier_id]);
    await conn.commit();
    return { id: result.insertId, total_score };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function addQualification(pool, data) {
  const status = data.expire_date
    ? (new Date(data.expire_date) < new Date() ? 3 : new Date(data.expire_date) < new Date(Date.now() + 30 * 86400000) ? 2 : 1)
    : 1;
  const [result] = await pool.query(
    `INSERT INTO crm_supplier_qualification (supplier_id, cert_type, cert_no, cert_name, issue_date, expire_date, issuing_authority, status, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.supplier_id, data.cert_type || null, data.cert_no || null, data.cert_name, data.issue_date || null, data.expire_date || null, data.issuing_authority || null, status, data.remark || null]
  );
  return { id: result.insertId };
}

async function updateQualification(pool, id, data) {
  const allowed = ['cert_type', 'cert_no', 'cert_name', 'issue_date', 'expire_date', 'issuing_authority', 'remark'];
  const setClauses = [];
  const params = [];
  for (const [k, v] of Object.entries(data)) {
    if (allowed.includes(k) && v !== undefined) { setClauses.push(`${k} = ?`); params.push(v); }
  }
  if (data.expire_date !== undefined) {
    const exp = data.expire_date ? new Date(data.expire_date) : null;
    const s = exp ? (exp < new Date() ? 3 : exp < new Date(Date.now() + 30 * 86400000) ? 2 : 1) : 1;
    setClauses.push('status = ?');
    params.push(s);
  }
  if (setClauses.length === 0) return;
  params.push(id);
  await pool.query(`UPDATE crm_supplier_qualification SET ${setClauses.join(', ')} WHERE id = ?`, params);
}

async function deleteQualification(pool, id) {
  await pool.query('UPDATE crm_supplier_qualification SET deleted_at = NOW() WHERE id = ?', [id]);
}

async function getPerformance(pool, id) {
  const [purchaseStats] = await pool.query(
    `SELECT COUNT(*) as order_count, COALESCE(SUM(total_with_tax), 0) as total_amount
     FROM crm_purchase_order WHERE supplier_id = ? AND deleted_at IS NULL AND status != '已取消'`, [id]);
  const [qualityStats] = await pool.query(
    `SELECT COUNT(*) as total, SUM(CASE WHEN r.quality_result = '合格' THEN 1 ELSE 0 END) as passed
     FROM crm_purchase_receipt r JOIN crm_purchase_item i ON r.item_id = i.id JOIN crm_purchase_order o ON i.order_id = o.id
     WHERE o.supplier_id = ? AND o.deleted_at IS NULL`, [id]);
  const [deliveryStats] = await pool.query(
    `SELECT COUNT(*) as total, SUM(CASE WHEN actual_date IS NOT NULL AND actual_date <= expected_date THEN 1 ELSE 0 END) as on_time
     FROM crm_purchase_order WHERE supplier_id = ? AND deleted_at IS NULL AND status IN ('已完成', '部分收货') AND expected_date IS NOT NULL`, [id]);
  const [ratingTrend] = await pool.query(
    `SELECT rating_period, total_score, quality_score, delivery_score, service_score, price_score
     FROM crm_supplier_rating WHERE supplier_id = ? AND deleted_at IS NULL ORDER BY rating_period DESC LIMIT 4`, [id]);

  const qTotal = qualityStats[0].total || 0;
  const dTotal = deliveryStats[0].total || 0;
  return {
    order_count: purchaseStats[0].order_count,
    total_amount: purchaseStats[0].total_amount,
    quality_rate: qTotal > 0 ? Math.round((qualityStats[0].passed / qTotal) * 100) : null,
    delivery_rate: dTotal > 0 ? Math.round((deliveryStats[0].on_time / dTotal) * 100) : null,
    rating_trend: ratingTrend.reverse()
  };
}

async function getRanking(pool, limit = 20) {
  const [rows] = await pool.query(`
    SELECT s.id, s.name, s.contact_person as contact, s.contact_phone as phone, s.type, s.rating,
           r.quality_score, r.delivery_score, r.service_score, r.rating_period, r.total_score
    FROM crm_supplier s
    LEFT JOIN crm_supplier_rating r ON s.id = r.supplier_id
      AND r.id = (SELECT id FROM crm_supplier_rating WHERE supplier_id = s.id ORDER BY create_time DESC LIMIT 1)
    WHERE s.deleted_at IS NULL
    ORDER BY COALESCE(r.total_score, 0) DESC, s.rating DESC LIMIT ?
  `, [limit]);
  return rows;
}

async function getComparison(pool, ids) {
  const placeholders = ids.map(() => '?').join(',');
  const [suppliers] = await pool.query(
    `SELECT id, name FROM crm_supplier WHERE id IN (${placeholders}) AND deleted_at IS NULL`, ids);
  const result = [];
  for (const s of suppliers) {
    const [ratings] = await pool.query(
      'SELECT quality_score, delivery_score, service_score, total_score, rating_period FROM crm_supplier_rating WHERE supplier_id = ? ORDER BY create_time DESC LIMIT 6', [s.id]);
    result.push({ id: s.id, name: s.name, ratings: ratings.reverse() });
  }
  return result;
}

module.exports = {
  listSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier, getSupplierForEdit,
  addContact, updateContact, deleteContact, getSupplierOptions,
  addRating, addQualification, updateQualification, deleteQualification,
  getPerformance, getRanking, getComparison
};
