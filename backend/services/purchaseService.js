/**
 * 采购服务层（采购计划 + 采购单）
 * 从 routes/procurement-plan.js 和 routes/purchase.js 提取
 */

// ==================== 采购计划 ====================

async function listPlans(pool, params = {}) {
  const { status = '', page = 1, pageSize = 20 } = params;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = 'WHERE p.deleted_at IS NULL';
  const queryParams = [];
  if (status) { where += ' AND p.status = ?'; queryParams.push(status); }

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_purchase_plan p ${where}`, queryParams);
  const [rows] = await pool.query(`
    SELECT p.*, u.real_name as create_by_name
    FROM crm_purchase_plan p
    LEFT JOIN sys_user u ON p.create_by = u.id
    ${where} ORDER BY p.create_time DESC LIMIT ? OFFSET ?
  `, [...queryParams, parseInt(pageSize), offset]);

  return { list: rows, total };
}

async function getPlan(pool, id) {
  const [[plan]] = await pool.query(`
    SELECT p.*, u.real_name as create_by_name, a.real_name as approved_by_name
    FROM crm_purchase_plan p
    LEFT JOIN sys_user u ON p.create_by = u.id
    LEFT JOIN sys_user a ON p.approved_by = a.id
    WHERE p.id = ? AND p.deleted_at IS NULL
  `, [id]);
  if (!plan) return null;

  const [items] = await pool.query(`
    SELECT i.*, p.name as product_name, p.code as product_code, p.unit, s.name as supplier_name
    FROM crm_purchase_plan_item i
    JOIN crm_product p ON i.product_id = p.id
    LEFT JOIN crm_supplier s ON i.supplier_id = s.id
    WHERE i.plan_id = ?
  `, [id]);

  plan.items = items;
  return plan;
}

async function generatePlanNo(pool) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const [[{ cnt }]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_purchase_plan WHERE plan_no LIKE ?", [`PP-${dateStr}-%`]);
  return `PP-${dateStr}-${String(cnt + 1).padStart(3, '0')}`;
}

async function createPlan(pool, data, userId) {
  const conn = await pool.getConnection();
  try {
    const { name, remark, items } = data;
    await conn.beginTransaction();
    const planNo = await generatePlanNo(pool);
    let totalAmount = 0;
    items.forEach(item => {
      const amount = (item.quantity || 0) * (item.unit_price || 0);
      item.amount = amount;
      totalAmount += amount;
    });

    const [result] = await conn.query(
      'INSERT INTO crm_purchase_plan (plan_no, name, total_amount, remark, create_by) VALUES (?, ?, ?, ?, ?)',
      [planNo, name.trim(), totalAmount, remark || null, userId]
    );
    const planId = result.insertId;

    for (const item of items) {
      await conn.query(
        'INSERT INTO crm_purchase_plan_item (plan_id, product_id, supplier_id, quantity, unit_price, amount, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [planId, item.product_id, item.supplier_id || null, item.quantity, item.unit_price || null, item.amount, item.reason || null]
      );
    }

    await conn.commit();
    return { id: planId, plan_no: planNo };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}

async function updatePlan(pool, id, data) {
  const conn = await pool.getConnection();
  try {
    const [[plan]] = await pool.query('SELECT status FROM crm_purchase_plan WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!plan) return { error: '计划不存在', code: 404 };
    if (plan.status !== 'draft') return { error: '只能编辑草稿状态的计划', code: 400 };

    const { name, remark, items } = data;
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
    return { success: true };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}

async function deletePlan(pool, id) {
  const [[plan]] = await pool.query('SELECT status FROM crm_purchase_plan WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!plan) return { error: '计划不存在', code: 404 };
  if (plan.status !== 'draft') return { error: '只能删除草稿状态的计划', code: 400 };
  await pool.query('UPDATE crm_purchase_plan SET deleted_at = NOW() WHERE id = ?', [id]);
  return { success: true };
}

async function submitPlan(pool, id) {
  const [[plan]] = await pool.query('SELECT status FROM crm_purchase_plan WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!plan) return { error: '计划不存在', code: 404 };
  if (plan.status !== 'draft') return { error: '只有草稿状态可以提交', code: 400 };
  await pool.query("UPDATE crm_purchase_plan SET status = 'submitted' WHERE id = ?", [id]);
  return { success: true };
}

async function approvePlan(pool, id, userId) {
  const [[plan]] = await pool.query('SELECT status FROM crm_purchase_plan WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!plan) return { error: '计划不存在', code: 404 };
  if (plan.status !== 'submitted') return { error: '只有已提交状态可以批准', code: 400 };
  await pool.query("UPDATE crm_purchase_plan SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?", [userId, id]);
  return { success: true };
}

async function autoGenerate(pool, userId, supplierId = null) {
  const conn = await pool.getConnection();
  try {
    let where = 'WHERE p.deleted_at IS NULL AND sa.alert_enabled = 1 AND p.stock < sa.min_qty';
    const queryParams = [];
    if (supplierId) {
      where += ' AND EXISTS (SELECT 1 FROM crm_purchase_item pi JOIN crm_purchase_order po ON pi.order_id = po.id WHERE pi.product_id = p.id AND po.supplier_id = ? AND po.deleted_at IS NULL)';
      queryParams.push(supplierId);
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
    `, queryParams);

    if (lowStockProducts.length === 0) return { empty: true };

    await conn.beginTransaction();
    const planNo = await generatePlanNo(pool);
    let totalAmount = 0;
    lowStockProducts.forEach(p => { totalAmount += (p.suggest_qty || 0) * (p.last_price || 0); });

    const [result] = await conn.query(
      'INSERT INTO crm_purchase_plan (plan_no, name, total_amount, remark, create_by) VALUES (?, ?, ?, ?, ?)',
      [planNo, '自动生成-库存补货计划', totalAmount, '系统根据库存预警自动生成', userId]
    );
    const planId = result.insertId;

    for (const p of lowStockProducts) {
      await conn.query(
        'INSERT INTO crm_purchase_plan_item (plan_id, product_id, supplier_id, quantity, unit_price, amount, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [planId, p.id, p.last_supplier_id || null, p.suggest_qty, p.last_price || null, (p.suggest_qty || 0) * (p.last_price || 0), `库存不足（当前${p.stock}，最低${p.min_qty}）`]
      );
    }

    await conn.commit();
    return { id: planId, plan_no: planNo, item_count: lowStockProducts.length };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}

async function getPlanStats(pool) {
  const [[total]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_purchase_plan WHERE deleted_at IS NULL");
  const [[submitted]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_purchase_plan WHERE deleted_at IS NULL AND status = 'submitted'");
  const [[approved]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_purchase_plan WHERE deleted_at IS NULL AND status = 'approved'");
  const [[ordered]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_purchase_plan WHERE deleted_at IS NULL AND status = 'ordered'");
  return { total: total.cnt, submitted: submitted.cnt, approved: approved.cnt, ordered: ordered.cnt };
}

async function convertToPurchase(pool, planId, userId) {
  const conn = await pool.getConnection();
  try {
    const [[plan]] = await conn.query('SELECT * FROM crm_purchase_plan WHERE id = ? AND deleted_at IS NULL', [planId]);
    if (!plan) return { error: '计划不存在', code: 404 };
    if (plan.status !== 'approved') return { error: '只有已批准的计划可以转采购单', code: 400 };

    const [items] = await conn.query(
      'SELECT pi.*, p.name as product_name FROM crm_purchase_plan_item pi LEFT JOIN crm_product p ON pi.product_id = p.id WHERE pi.plan_id = ?',
      [planId]
    );
    if (items.length === 0) return { error: '计划无明细', code: 400 };

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

    const [[{ seq }]] = await conn.query("SELECT COUNT(*) as seq FROM crm_purchase_order WHERE order_no LIKE ?", [`PO-${dateStr}-%`]);

    for (const [supplierId, groupItems] of Object.entries(groups)) {
      const orderNo = `PO-${dateStr}-${String(seq + createdOrderIds.length + 1).padStart(3, '0')}`;
      const totalAmount = groupItems.reduce((s, i) => s + parseFloat(i.amount || 0), 0);

      const [orderResult] = await conn.query(
        `INSERT INTO crm_purchase_order (order_no, supplier_id, title, total_amount, status, create_by, create_time)
         VALUES (?, ?, ?, ?, '草稿', ?, NOW())`,
        [orderNo, parseInt(supplierId) || null, `采购计划${plan.plan_no}转采购`, totalAmount, userId]
      );
      const orderId = orderResult.insertId;
      createdOrderIds.push(orderId);

      for (const item of groupItems) {
        await conn.query(
          `INSERT INTO crm_purchase_item (order_id, product_id, product_name, quantity, unit, unit_price, amount, remark)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [orderId, item.product_id, item.product_name, item.quantity, item.unit, item.unit_price, item.amount, item.reason]
        );
        await conn.query('UPDATE crm_purchase_plan_item SET status = "ordered" WHERE id = ?', [item.id]);
      }
    }

    await conn.query("UPDATE crm_purchase_plan SET status = 'completed' WHERE id = ?", [planId]);

    await conn.commit();
    return { order_ids: createdOrderIds };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}

// ==================== 采购单 ====================

async function listPurchases(pool, params = {}, permission = null) {
  const { page = 1, pageSize = 10, keyword = '', status = '', type = '', supplier_id } = params;
  const offset = (page - 1) * pageSize;

  let permissionClause = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionClause = permission.clause;
    permParams = permission.params || [];
  }

  let sql = `SELECT po.*, s.name as supplier_name, u.real_name as owner_name
    FROM crm_purchase_order po
    LEFT JOIN crm_supplier s ON po.supplier_id = s.id
    LEFT JOIN sys_user u ON po.owner_id = u.id
    WHERE ${permissionClause}`;
  const queryParams = [...permParams];

  if (keyword) {
    sql += ' AND (po.order_no LIKE ? OR po.title LIKE ? OR s.name LIKE ?)';
    queryParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (status) { sql += ' AND po.status = ?'; queryParams.push(status); }
  if (type) { sql += ' AND po.type = ?'; queryParams.push(type); }
  if (supplier_id) { sql += ' AND po.supplier_id = ?'; queryParams.push(supplier_id); }

  sql += ' ORDER BY po.create_time DESC LIMIT ?, ?';
  queryParams.push(offset, pageSize);
  const [rows] = await pool.query(sql, queryParams);

  let countSql = `SELECT COUNT(*) as total FROM crm_purchase_order po LEFT JOIN crm_supplier s ON po.supplier_id = s.id WHERE ${permissionClause}`;
  const countParams = [...permParams];
  if (keyword) { countSql += ' AND (po.order_no LIKE ? OR po.title LIKE ? OR s.name LIKE ?)'; countParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (status) { countSql += ' AND po.status = ?'; countParams.push(status); }
  if (type) { countSql += ' AND po.type = ?'; countParams.push(type); }
  if (supplier_id) { countSql += ' AND po.supplier_id = ?'; countParams.push(supplier_id); }

  const [countResult] = await pool.query(countSql, countParams);

  return { list: rows, total: countResult[0].total };
}

async function getPurchase(pool, id, permission = null) {
  let permissionClause = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionClause = permission.clause;
    permParams = permission.params || [];
  }

  const [orders] = await pool.query(`
    SELECT po.*, s.name as supplier_name, s.contact_person, s.contact_phone,
           u.real_name as owner_name, ub.real_name as create_by_name
    FROM crm_purchase_order po
    LEFT JOIN crm_supplier s ON po.supplier_id = s.id
    LEFT JOIN sys_user u ON po.owner_id = u.id
    LEFT JOIN sys_user ub ON po.create_by = ub.id
    WHERE po.id = ? AND ${permissionClause}
  `, [id, ...permParams]);

  if (!orders.length) return null;

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

  return { ...orders[0], items, receipts, payments };
}

async function createPurchase(pool, data, userId) {
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

    for (const item of data.items) {
      const discountAmount = (item.unit_price * item.quantity * (item.discount_rate || 0)) / 100;
      const amount = Number((item.unit_price * item.quantity - discountAmount).toFixed(2));
      totalAmount += amount;

      itemValues.push([
        null, item.product_name, item.product_spec || null,
        item.unit || '个', item.quantity, item.unit_price,
        item.discount_rate || 0, discountAmount, amount, 0, '待检', item.remark || null
      ]);
    }

    const taxRate = data.tax_rate !== undefined ? parseFloat(data.tax_rate) : 13;
    const taxAmount = Number((totalAmount * taxRate / 100).toFixed(2));
    const totalWithTax = Number((totalAmount + taxAmount).toFixed(2));

    const [result] = await connection.query(
      `INSERT INTO crm_purchase_order (order_no, supplier_id, title, type, expected_date, payment_terms, delivery_address, remark, total_amount, tax_rate, tax_amount, total_with_tax, owner_id, create_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderNo, data.supplier_id, data.title, data.type,
       data.expected_date || null, data.payment_terms || null,
       data.delivery_address || null, data.remark || null,
       totalAmount, taxRate, taxAmount, totalWithTax,
       userId, userId]
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
    return { id: orderId, order_no: orderNo, total_amount: totalAmount };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

async function updateStatus(pool, id, status, approveRemark = null) {
  if (status === '已确认') {
    await pool.query(
      'UPDATE crm_purchase_order SET status = ?, approve_time = NOW(), approveRemark = ? WHERE id = ?',
      [status, approveRemark || null, id]
    );
  } else {
    await pool.query('UPDATE crm_purchase_order SET status = ? WHERE id = ?', [status, id]);
  }
  return { success: true };
}

async function addReceipt(pool, data, userId) {
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
      [data.order_id, data.item_id, receiptNo, data.quantity,
       data.quality_check, data.quality_result, data.defect_desc || null,
       data.warehouse || null, data.remark || null, userId]
    );

    await connection.query(
      'UPDATE crm_purchase_item SET received_qty = received_qty + ?, quality_status = ? WHERE id = ?',
      [data.quantity, data.quality_result === '合格' ? '合格' : data.quality_result, data.item_id]
    );

    const [[item]] = await connection.query('SELECT received_qty, quantity FROM crm_purchase_item WHERE id = ?', [data.item_id]);
    if (item && item.received_qty >= item.quantity) {
      const [[orderCheck]] = await connection.query(
        'SELECT SUM(received_qty >= quantity) as done_count, COUNT(*) as total_count FROM crm_purchase_item WHERE order_id = ?',
        [data.order_id]
      );
      const newStatus = (orderCheck.done_count >= orderCheck.total_count) ? '已完成' : '部分收货';
      await connection.query(
        'UPDATE crm_purchase_order SET actual_date = CURRENT_DATE, status = ? WHERE id = ?',
        [newStatus, data.order_id]
      );
    } else {
      await connection.query("UPDATE crm_purchase_order SET status = '部分收货' WHERE id = ?", [data.order_id]);
    }

    await connection.commit();
    return { id: result.insertId, receipt_no: receiptNo };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

async function getStatistics(pool) {
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

  return {
    summary: {
      totalOrders: totalOrders.cnt,
      pendingApprove: pendingApprove.cnt,
      pendingReceive: pendingReceive.cnt,
      completedThisMonth: completedThisMonth.cnt,
      totalAmount: totalAmount.sum
    },
    topSuppliers
  };
}

async function addPayment(pool, data, userId) {
  const [orders] = await pool.query('SELECT id FROM crm_purchase_order WHERE id = ? AND deleted_at IS NULL', [data.order_id]);
  if (orders.length === 0) return { error: '采购单不存在', code: 404 };

  const [result] = await pool.query(
    `INSERT INTO crm_purchase_payment (order_id, amount, pay_method, pay_date, remark, payer_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.order_id, data.amount, data.pay_method || null, data.pay_date || null, data.remark || null, userId]
  );

  return { id: result.insertId };
}

module.exports = {
  listPlans, getPlan, createPlan, updatePlan, deletePlan,
  submitPlan, approvePlan, autoGenerate, getPlanStats, convertToPurchase,
  listPurchases, getPurchase, createPurchase, updateStatus,
  addReceipt, getStatistics, addPayment
};
