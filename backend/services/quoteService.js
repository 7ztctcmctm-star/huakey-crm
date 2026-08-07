/**
 * 报价服务层
 * 从 routes/quote.js 提取的业务逻辑
 */

const logger = require('../config/logger');
const opportunityService = require('../services/opportunityService');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

async function generateQuoteNo(connection) {
  const now = new Date();
  const dateStr = now.getFullYear().toString().slice(2) + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  const [count] = await connection.query(
    "SELECT COUNT(*) as cnt FROM crm_quote WHERE quote_no LIKE ? FOR UPDATE",
    [`QUO-${dateStr}-%`]
  );
  const seq = String(count[0].cnt + 1).padStart(3, '0');
  return `QUO-${dateStr}-${seq}`;
}

async function createQuote(pool, data, userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { customer_id, opportunity_id, items, discount, valid_days, remark } = data;

    const [customers] = await connection.query(
      'SELECT id FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
      [customer_id]
    );
    if (customers.length === 0) throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND);

    // 4-3-4: 传入 opportunity_id 时校验商机存在且属于同一客户
    if (opportunity_id) {
      const [opps] = await connection.query(
        'SELECT id, customer_id FROM crm_opportunity WHERE id = ? AND deleted_at IS NULL',
        [opportunity_id]
      );
      if (opps.length === 0) {
        throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '关联的商机不存在');
      }
      if (opps[0].customer_id !== customer_id) {
        throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '商机与客户不匹配，无法关联');
      }
    }

    let totalAmount = 0;
    const validatedItems = [];
    for (const item of items) {
      const [products] = await connection.query(
        'SELECT id, name, code, price FROM crm_product WHERE id = ? AND status = 1',
        [item.product_id]
      );
      if (products.length === 0) throw new AppError(ErrorCodes.BUSINESS_VALIDATION, `产品ID ${item.product_id} 不存在或已禁用`);

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
    const quoteNo = await generateQuoteNo(connection);
    const currency = data.currency || 'CNY';
    const exchangeRate = data.exchange_rate || 1.0000;

    const [quoteResult] = await connection.query(
      `INSERT INTO crm_quote
        (quote_no, customer_id, opportunity_id, amount, discount, final_amount, valid_days, remark, status, create_by, currency, exchange_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [quoteNo, customer_id, opportunity_id || null, totalAmount, disc, finalAmount, valid_days || 30, remark || null, userId, currency, exchangeRate]
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

    // FIX-2: 移除跨模块写 Customer 的逻辑（违反领域边界约束 DB-1）
    // 原代码：报价创建后自动调用 customerService.forwardStatus 推进客户状态 following → quoted
    // 现状：客户状态推进由客户中心模块自治，商机/报价/合同模块不得自动触发
    // 详见 docs/customer-center-freeze-v1.md §「领域边界」

    // 创建审批通知（不阻塞主流程）
    try {
      const [custInfo] = await pool.query('SELECT company_name FROM crm_customer WHERE id = ? AND deleted_at IS NULL', [customer_id]);
      const customerName = custInfo.length > 0 ? custInfo[0].company_name : '未知客户';
      const [userInfo] = await pool.query('SELECT real_name FROM sys_user WHERE id = ?', [userId]);
      const userName = userInfo.length > 0 ? userInfo[0].real_name : '未知';
      await pool.query(
        `INSERT INTO crm_notification (type, title, content, business_type, business_id, from_user_id, to_role_id)
         SELECT 'quote_approval', ?, ?, 'quote', ?, ?, r.id
         FROM sys_role r
         WHERE (r.manage_all IS TRUE OR r.id IN (1, 2))
           AND NOT EXISTS (
             SELECT 1 FROM crm_notification n
             WHERE n.business_type = 'quote' AND n.business_id = ? AND n.to_role_id = r.id AND n.is_dismissed = 0
           )`,
        [
          '新报价单待审批',
          `${userName} 为客户"${customerName}"创建报价单 ${quoteNo}，金额 ¥${finalAmount}，待审批`,
          quoteId,
          userId,
          quoteId
        ]
      );
    } catch (error) {
      console.error('[报价] 创建报价通知失败（不影响主流程）:', error);
    }

    return { id: quoteId, quote_no: quoteNo };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

const { paginatedQuery } = require('../utils/pagination');

async function listQuotes(pool, params = {}, permission = null) {
  const { page = 1, pageSize = 10, quote_no, customer_name, status, approval_status } = params;
  const queryParams = [];

  let permissionClause = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionClause = permission.clause;
    permParams = permission.params || [];
  }
  queryParams.push(...permParams);

  let whereClause = `WHERE ${permissionClause} AND q.deleted_at IS NULL`;

  if (quote_no) {
    whereClause += ' AND q.quote_no LIKE ?';
    queryParams.push(`%${quote_no}%`);
  }
  if (customer_name) {
    whereClause += ' AND c.company_name LIKE ?';
    queryParams.push(`%${customer_name}%`);
  }
  if (status !== undefined && status !== null && status !== '') {
    whereClause += ' AND q.status = ?';
    queryParams.push(parseInt(status));
  }
  if (approval_status !== undefined && approval_status !== null && approval_status !== '') {
    whereClause += ' AND q.approval_status = ?';
    queryParams.push(parseInt(approval_status));
  }

  const result = await paginatedQuery(pool, {
    baseQuery: `SELECT
      q.id, q.quote_no, q.customer_id, q.amount, q.discount, q.final_amount,
      q.valid_days, q.remark, q.status, q.approval_status, q.create_by, q.create_time,
      q.currency, q.exchange_rate,
      c.company_name as customer_name,
      u.real_name as create_name,
      cur.symbol as currency_symbol
    FROM crm_quote q
    LEFT JOIN crm_customer c ON q.customer_id = c.id
    LEFT JOIN sys_user u ON q.create_by = u.id
    LEFT JOIN crm_currency cur ON q.currency = cur.code COLLATE utf8mb4_unicode_ci
    ${whereClause}`,
    countQuery: `SELECT COUNT(*) as total FROM crm_quote q LEFT JOIN crm_customer c ON q.customer_id = c.id ${whereClause}`,
    params: queryParams,
    page,
    pageSize,
    orderBy: 'q.create_time DESC'
  });

  const [[expiring]] = await pool.query(
    `SELECT COUNT(*) as cnt FROM crm_quote
     WHERE deleted_at IS NULL AND approval_status = 1
       AND DATE_ADD(create_time, INTERVAL valid_days DAY) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)`
  );

  return { ...result, expiring_count: expiring.cnt };
}

async function getQuote(pool, id, permission = null) {
  let permissionClause = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionClause = permission.clause;
    permParams = permission.params || [];
  }

  const [quote] = await pool.query(
    `SELECT
      q.id, q.quote_no, q.customer_id, q.amount, q.discount, q.final_amount,
      q.valid_days, q.remark, q.status, q.approval_status, q.create_by, q.create_time,
      c.company_name as customer_name, c.contact_name, c.phone,
      u.real_name as create_name
    FROM crm_quote q
    LEFT JOIN crm_customer c ON q.customer_id = c.id
    LEFT JOIN sys_user u ON q.create_by = u.id
    WHERE q.id = ? AND q.deleted_at IS NULL AND ${permissionClause}`,
    [id, ...permParams]
  );

  if (quote.length === 0) return null;

  const [items] = await pool.query(
    `SELECT
      id, product_id, product_name, product_code, quantity, unit_price, total_price, remark
    FROM crm_quote_item WHERE quote_id = ? ORDER BY id`,
    [id]
  );

  return { ...quote[0], items };
}

const STATUS_MAP = { 1: '草稿', 2: '已发送', 3: '已确认', 4: '已失效' };

async function updateQuote(pool, data) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id, customer_id, items, discount, valid_days, remark, status } = data;

    const [quotes] = await connection.query(
      `SELECT id, quote_no, customer_id, amount, discount, final_amount, valid_days, remark, status, approval_status,
        opportunity_id, create_by, create_time, update_time, deleted_at
       FROM crm_quote WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    if (quotes.length === 0) throw new AppError(ErrorCodes.QUOTE_NOT_FOUND);

    const existingQuote = quotes[0];
    if (existingQuote.status === 3 || existingQuote.status === 4) {
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, `${STATUS_MAP[existingQuote.status]}的报价单不可修改`);
    }

    let updates = [];
    const updateParams = [];

    if (customer_id !== undefined) {
      const [customers] = await connection.query('SELECT id FROM crm_customer WHERE id = ? AND deleted_at IS NULL', [customer_id]);
      if (customers.length === 0) throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND);
      updates.push('customer_id = ?');
      updateParams.push(customer_id);
    }

    if (discount !== undefined) { updates.push('discount = ?'); updateParams.push(discount); }
    if (valid_days !== undefined) { updates.push('valid_days = ?'); updateParams.push(valid_days); }
    if (remark !== undefined) { updates.push('remark = ?'); updateParams.push(remark); }
    if (status !== undefined) { updates.push('status = ?'); updateParams.push(status); }

    if (items !== undefined && items.length > 0) {
      await connection.query('DELETE FROM crm_quote_item WHERE quote_id = ?', [id]);

      let totalAmount = 0;
      for (const item of items) {
        const [products] = await connection.query(
          'SELECT id, name, code, price FROM crm_product WHERE id = ? AND status = 1',
          [item.product_id]
        );
        if (products.length === 0) throw new AppError(ErrorCodes.BUSINESS_VALIDATION, `产品ID ${item.product_id} 不存在或已禁用`);

        const product = products[0];
        const quantity = item.quantity || 1;
        const unitPrice = item.unit_price || product.price;
        const totalPrice = quantity * unitPrice;
        totalAmount += totalPrice;

        await connection.query(
          `INSERT INTO crm_quote_item (quote_id, product_id, product_name, product_code, quantity, unit_price, total_price, remark)
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
      await connection.query(`UPDATE crm_quote SET ${updates.join(', ')} WHERE id = ?`, updateParams);
    }

    await connection.commit();
    return { success: true, existingQuote };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

async function deleteQuote(pool, id, user) {
  const [quotes] = await pool.query('SELECT status, create_by FROM crm_quote WHERE id = ? AND deleted_at IS NULL', [id]);
  if (quotes.length === 0) throw new AppError(ErrorCodes.QUOTE_NOT_FOUND);
  if (quotes[0].status === 3) throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '已确认的报价单不可删除');

  const ROLES = require('../config/roles');
  const { manageAll, roleId, userId } = user;
  if (!manageAll && ![ROLES.ADMIN, ROLES.MANAGER].includes(roleId) && quotes[0].create_by !== userId) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权删除该报价单');
  }

  await pool.query('UPDATE crm_quote SET deleted_at = NOW() WHERE id = ?', [id]);
  return { success: true };
}

async function approveQuote(pool, id, approvalStatus, approvalRemark, userId) {
  const [rows] = await pool.query('SELECT id FROM crm_quote WHERE id = ? AND deleted_at IS NULL', [id]);
  if (rows.length === 0) throw new AppError(ErrorCodes.QUOTE_NOT_FOUND);

  await pool.query(
    'UPDATE crm_quote SET approval_status = ?, approver_id = ?, approval_remark = ? WHERE id = ?',
    [approvalStatus, userId, approvalRemark || null, id]
  );

  await pool.query(
    'UPDATE crm_notification SET is_dismissed = 1, is_read = 1 WHERE business_type = ? AND business_id = ? AND is_dismissed = 0',
    ['quote', id]
  );

  // 4-3-5: 报价审批通过时推进商机到 stage 3（方案报价）（不阻塞主流程）
  if (approvalStatus === 1) {
    try {
      const [quoteRows] = await pool.query('SELECT opportunity_id FROM crm_quote WHERE id = ? AND deleted_at IS NULL', [id]);
      if (quoteRows.length > 0 && quoteRows[0].opportunity_id) {
        await opportunityService.advanceStage(pool, quoteRows[0].opportunity_id, 3, userId);
      }
    } catch (e) {
      logger.error('[报价审批] 推进商机阶段失败（不影响主流程）', {
        quote_id: id,
        error: e.message,
        traceId: 'N/A'
      });
    }
  }

  return { success: true };
}

async function convertToContract(pool, quoteId, userId) {
  const conn = await pool.getConnection();
  try {
    const [[quote]] = await conn.query(
      `SELECT id, quote_no, customer_id, amount, discount, final_amount, valid_days, remark, status, approval_status,
        opportunity_id, create_by, create_time, update_time, deleted_at
       FROM crm_quote WHERE id = ? AND deleted_at IS NULL`,
      [quoteId]
    );
    if (!quote) throw new AppError(ErrorCodes.QUOTE_NOT_FOUND);

    await conn.beginTransaction();

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [[{ cnt }]] = await conn.query("SELECT COUNT(*) as cnt FROM crm_contract WHERE contract_no LIKE ?", [`HT-${dateStr}-%`]);
    const contractNo = `HT-${dateStr}-${String(cnt + 1).padStart(3, '0')}`;

    // 4-3-2: 从报价单传递 opportunity_id 和 quote_id 到合同
    const [result] = await conn.query(
      `INSERT INTO crm_contract (contract_no, customer_id, opportunity_id, quote_id, amount, status, remark, create_by, create_time)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, NOW())`,
      [contractNo, quote.customer_id, quote.opportunity_id || null, quoteId, quote.final_amount || quote.amount, `从报价单${quote.quote_no}转入`, userId]
    );
    const contractId = result.insertId;

    await conn.query("UPDATE crm_quote SET status = 3 WHERE id = ?", [quoteId]);

    await conn.commit();

    // 4-3-5: 报价转合同后推进商机到 stage 5（成交）（不阻塞主流程）
    if (quote.opportunity_id) {
      try {
        await opportunityService.advanceStage(pool, quote.opportunity_id, 5, userId);
      } catch (e) {
        logger.error('[报价转合同] 推进商机阶段失败（不影响主流程）', {
          opportunity_id: quote.opportunity_id,
          error: e.message,
          traceId: 'N/A'
        });
      }
    }

    return { contract_id: contractId };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}

module.exports = {
  createQuote, listQuotes, getQuote, updateQuote,
  deleteQuote, approveQuote, convertToContract
};
