const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

const router = express.Router();

const STATUS_MAP = {
  1: '草稿',
  2: '已发送',
  3: '已确认',
  4: '已失效'
};

const { getDataPermission, buildPermissionClause } = require('../utils/permission');

// 生成报价单号（需在事务内调用，传入connection）
const generateQuoteNo = async (connection) => {
  const now = new Date();
  const dateStr = now.getFullYear().toString().slice(2) + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  const [count] = await connection.query(
    "SELECT COUNT(*) as cnt FROM crm_quote WHERE quote_no LIKE ? FOR UPDATE",
    [`QUO-${dateStr}-%`]
  );
  const seq = String(count[0].cnt + 1).padStart(3, '0');
  return `QUO-${dateStr}-${seq}`;
};

// 1. 创建报价单
router.post('/add', authenticateToken, checkPermission('quotation:add'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { customer_id, opportunity_id, items, discount, valid_days, remark } = req.body;

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
    const quoteNo = await generateQuoteNo(connection);

    // [业务修复] 支持关联商机ID
    const [quoteResult] = await connection.query(
      `INSERT INTO crm_quote
        (quote_no, customer_id, opportunity_id, amount, discount, final_amount, valid_days, remark, status, create_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [quoteNo, customer_id, opportunity_id || null, totalAmount, disc, finalAmount, valid_days || 30, remark || null, req.user.userId]
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

    // 创建审批通知（通知有审批权限的管理员）
    try {
      const [custInfo] = await pool.query('SELECT company_name FROM crm_customer WHERE id = ?', [customer_id]);
      const customerName = custInfo.length > 0 ? custInfo[0].company_name : '未知客户';
      const [userInfo] = await pool.query('SELECT real_name FROM sys_user WHERE id = ?', [req.user.userId]);
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
          req.user.userId,
          quoteId
        ]
      );
    } catch (error) {
      console.error('[报价] 创建报价通知失败（不影响主流程）:', error);
    }

    res.json({
      code: 200,
      message: '创建报价单成功',
      data: { id: quoteId, quote_no: quoteNo }
    });
  } catch (error) {
    await connection.rollback();
    console.error('[报价] 创建报价单错误:', error);
    res.status(500).json({ code: 500, message: '创建报价单失败', data: null });
  } finally {
    connection.release();
  }
});

// 2. 报价单列表
router.post('/list', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, quote_no, customer_name, status, approval_status } = req.body;
    const offset = (page - 1) * pageSize;
    const params = [];

    const permission = await getDataPermission(req.user);
    const { clause: permissionClause, params: permParams } = buildPermissionClause(permission, 'q', 'create_by');
    params.push(...permParams);

    let whereClause = `WHERE ${permissionClause} AND q.deleted_at IS NULL`;

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
    if (approval_status !== undefined && approval_status !== null && approval_status !== '') {
      whereClause += ' AND q.approval_status = ?';
      params.push(parseInt(approval_status));
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

    // 即将过期的报价数量（7天内到期）
    const [[expiring]] = await pool.query(
      `SELECT COUNT(*) as cnt FROM crm_quote
       WHERE deleted_at IS NULL AND approval_status = 1
         AND DATE_ADD(create_time, INTERVAL valid_days DAY) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)`
    );

    res.json({
      code: 200,
      message: '获取报价单列表成功',
      data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize), expiring_count: expiring.cnt }
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

    const permission = await getDataPermission(req.user);
    const { clause: permissionClause, params: permParams } = buildPermissionClause(permission, 'q', 'create_by');

    const [quote] = await pool.query(
      `SELECT
        q.id, q.quote_no, q.customer_id, q.amount, q.discount, q.final_amount,
        q.valid_days, q.remark, q.status, q.create_by, q.create_time,
        c.company_name as customer_name, c.contact_name, c.phone,
        u.real_name as create_name
      FROM crm_quote q
      LEFT JOIN crm_customer c ON q.customer_id = c.id
      LEFT JOIN sys_user u ON q.create_by = u.id
      WHERE q.id = ? AND q.deleted_at IS NULL AND ${permissionClause}`,
      [id, ...permParams]
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
router.post('/update', authenticateToken, checkPermission('quotation:edit'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id, customer_id, items, discount, valid_days, remark, status } = req.body;

    if (!id) {
      return res.status(400).json({ code: 400, message: '报价单ID不能为空', data: null });
    }

    const [quotes] = await connection.query('SELECT id, status FROM crm_quote WHERE id = ? AND deleted_at IS NULL', [id]);
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
router.post('/delete', authenticateToken, checkPermission('quotation:delete'), async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ code: 400, message: '报价单ID不能为空', data: null });
    }

    const [quotes] = await pool.query('SELECT status, create_by FROM crm_quote WHERE id = ? AND deleted_at IS NULL', [id]);
    if (quotes.length === 0) {
      return res.status(404).json({ code: 404, message: '报价单不存在', data: null });
    }

    if (quotes[0].status === 3) {
      return res.status(400).json({ code: 400, message: '已确认的报价单不可删除', data: null });
    }

    // 权限检查：管理员或创建人可删除
    const { manageAll, roleId, userId } = req.user;
    if (!manageAll && roleId !== 1 && roleId !== 2 && quotes[0].create_by !== userId) {
      return res.status(403).json({ code: 403, message: '无权删除该报价单', data: null });
    }

    await pool.query('UPDATE crm_quote SET deleted_at = NOW() WHERE id = ?', [id]);

    res.json({ code: 200, message: '删除报价单成功', data: null });
  } catch (error) {
    console.error('删除报价单错误:', error);
    res.status(500).json({ code: 500, message: '删除报价单失败', data: null });
  }
});

// 6. 报价转合同
router.post('/to-contract', authenticateToken, checkPermission('quotation:edit'), async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ code: 400, message: '报价单ID不能为空', data: null });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [quotes] = await connection.query(
      'SELECT id, customer_id, final_amount, remark, status, deleted_at FROM crm_quote WHERE id = ?',
      [id]
    );
    if (quotes.length === 0 || quotes[0].deleted_at) {
      await connection.rollback();
      return res.status(404).json({ code: 404, message: '报价单不存在', data: null });
    }
    if (quotes[0].status !== 3) {
      await connection.rollback();
      return res.status(400).json({ code: 400, message: '只有已确认的报价单才能转为合同', data: null });
    }

    const quote = quotes[0];

    // 生成合同编号
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const [count] = await connection.query('SELECT COUNT(*) as cnt FROM crm_contract WHERE contract_no LIKE ? FOR UPDATE', [`CON-${dateStr}-%`]);
    const seq = String(count[0].cnt + 1).padStart(3, '0');
    const contractNo = `CON-${dateStr}-${seq}`;

    // 创建合同
    const [result] = await connection.query(
      'INSERT INTO crm_contract (contract_no, customer_id, amount, remark, create_by) VALUES (?, ?, ?, ?, ?)',
      [contractNo, quote.customer_id, quote.final_amount, `由报价单 ${id} 生成` + (quote.remark ? ` | ${quote.remark}` : ''), req.user.userId]
    );

    await connection.commit();
    res.json({
      code: 200, message: '已成功转为合同',
      data: { contract_id: result.insertId, contract_no: contractNo }
    });
  } catch (error) {
    await connection.rollback();
    console.error('报价转合同错误:', error);
    res.status(500).json({ code: 500, message: '转合同失败', data: null });
  } finally {
    connection.release();
  }
});

// 审批报价单（仅管理员）
router.post('/approve', authenticateToken, async (req, res) => {
  try {
    const { id, approval_status, approval_remark } = req.body;
    // 仅boss/管理员可审批
    if (!req.user.manageAll && req.user.roleId !== 1 && req.user.roleId !== 2) {
      return res.status(403).json({ code: 403, message: '无审批权限', data: null });
    }
    if (!id || ![2, 3].includes(approval_status)) {
      return res.status(400).json({ code: 400, message: '参数错误: id必填, approval_status为2(通过)或3(拒绝)', data: null });
    }

    const [rows] = await pool.query('SELECT id FROM crm_quote WHERE id = ? AND deleted_at IS NULL', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '报价单不存在', data: null });
    }

    await pool.query(
      'UPDATE crm_quote SET approval_status = ?, approver_id = ?, approval_remark = ? WHERE id = ?',
      [approval_status, req.user.userId, approval_remark || null, id]
    );

    // 审批后自动解除通知
    await pool.query(
      'UPDATE crm_notification SET is_dismissed = 1, is_read = 1 WHERE business_type = ? AND business_id = ? AND is_dismissed = 0',
      ['quote', id]
    );

    res.json({ code: 200, message: approval_status === 2 ? '审批通过' : '已拒绝', data: null });
  } catch (error) {
    console.error('审批报价单错误:', error);
    res.status(500).json({ code: 500, message: '审批失败', data: null });
  }
});

// 报价转合同
router.post('/to-contract', authenticateToken, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.body;
    const [[quote]] = await conn.query('SELECT * FROM crm_quote WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!quote) return res.status(404).json({ code: 404, message: '报价单不存在', data: null });

    await conn.beginTransaction();

    // 生成合同编号
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [[{ cnt }]] = await conn.query("SELECT COUNT(*) as cnt FROM crm_contract WHERE contract_no LIKE ?", [`HT-${dateStr}-%`]);
    const contractNo = `HT-${dateStr}-${String(cnt + 1).padStart(3, '0')}`;

    // 创建合同
    const [result] = await conn.query(
      `INSERT INTO crm_contract (contract_no, customer_id, amount, status, remark, create_by, create_time)
       VALUES (?, ?, ?, 1, ?, ?, NOW())`,
      [contractNo, quote.customer_id, quote.final_amount || quote.amount, `从报价单${quote.quote_no}转入`, req.user.userId]
    );
    const contractId = result.insertId;

    // 更新报价状态为已成交
    await conn.query("UPDATE crm_quote SET status = 3 WHERE id = ?", [id]);

    await conn.commit();
    res.json({ code: 200, message: '转合同成功', data: { contract_id: contractId } });
  } catch (error) {
    await conn.rollback();
    console.error('报价转合同失败:', error);
    res.status(500).json({ code: 500, message: '转合同失败', data: null });
  } finally {
    conn.release();
  }
});

module.exports = router;
