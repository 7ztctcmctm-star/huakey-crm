const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// 业务表映射
const BUSINESS_TABLE_MAP = {
  quote: 'crm_quote',
  contract: 'crm_contract',
  purchase: 'crm_purchase_order'
};

// 获取所有审批流程
router.get('/workflows', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT w.*, u.real_name as create_by_name,
        (SELECT COUNT(*) FROM crm_approval_step s WHERE s.workflow_id = w.id) as step_count
      FROM crm_approval_workflow w
      LEFT JOIN sys_user u ON w.create_by = u.id
      WHERE w.deleted_at IS NULL
      ORDER BY w.type, w.name
    `);

    // 获取每个流程的步骤
    if (rows.length > 0) {
      const ids = rows.map(r => r.id);
      const [steps] = await pool.query(
        'SELECT * FROM crm_approval_step WHERE workflow_id IN (?) ORDER BY workflow_id, step_order',
        [ids]
      );
      rows.forEach(r => {
        r.steps = steps.filter(s => s.workflow_id === r.id);
      });
    }

    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[审批] 获取流程列表失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建审批流程
router.post('/workflows', authenticateToken, checkPermission('approval'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { name, type, description, steps } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: '流程名称不能为空', data: null });
    }
    if (!type) {
      return res.status(400).json({ code: 400, message: '流程类型不能为空', data: null });
    }
    if (!steps || steps.length === 0) {
      return res.status(400).json({ code: 400, message: '至少需要一个审批步骤', data: null });
    }

    const validTypes = ['quote', 'contract', 'purchase', 'discount'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ code: 400, message: '无效的流程类型', data: null });
    }

    await conn.beginTransaction();

    const [result] = await conn.query(
      'INSERT INTO crm_approval_workflow (name, type, description, create_by) VALUES (?, ?, ?, ?)',
      [name.trim(), type, description || null, req.user.userId]
    );
    const workflowId = result.insertId;

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      await conn.query(
        'INSERT INTO crm_approval_step (workflow_id, step_order, step_name, approver_type, approver_id, is_required) VALUES (?, ?, ?, ?, ?, ?)',
        [workflowId, i + 1, s.step_name, s.approver_type, s.approver_id || null, s.is_required !== undefined ? s.is_required : 1]
      );
    }

    await conn.commit();
    res.json({ code: 200, message: '创建成功', data: { id: workflowId } });
  } catch (error) {
    await conn.rollback();
    console.error('[审批] 创建流程失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  } finally {
    conn.release();
  }
});

// 更新审批流程
router.put('/workflows/:id', authenticateToken, checkPermission('approval'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { name, type, description, steps, status } = req.body;

    const [existing] = await pool.query('SELECT id FROM crm_approval_workflow WHERE id = ? AND deleted_at IS NULL', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ code: 404, message: '流程不存在', data: null });
    }

    await conn.beginTransaction();

    // 更新流程基本信息
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
    if (type !== undefined) { fields.push('type = ?'); values.push(type); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (status !== undefined) { fields.push('status = ?'); values.push(parseInt(status)); }

    if (fields.length > 0) {
      values.push(id);
      await conn.query(`UPDATE crm_approval_workflow SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    // 更新步骤（先删后建）
    if (steps && steps.length > 0) {
      await conn.query('DELETE FROM crm_approval_step WHERE workflow_id = ?', [id]);
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        await conn.query(
          'INSERT INTO crm_approval_step (workflow_id, step_order, step_name, approver_type, approver_id, is_required) VALUES (?, ?, ?, ?, ?, ?)',
          [id, i + 1, s.step_name, s.approver_type, s.approver_id || null, s.is_required !== undefined ? s.is_required : 1]
        );
      }
    }

    await conn.commit();
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    await conn.rollback();
    console.error('[审批] 更新流程失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  } finally {
    conn.release();
  }
});

// 删除审批流程（软删除）
router.delete('/workflows/:id', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE crm_approval_workflow SET deleted_at = NOW() WHERE id = ?', [id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[审批] 删除流程失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 提交审批
router.post('/submit', authenticateToken, checkPermission('approval'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { business_type, business_id } = req.body;
    if (!business_type || !business_id) {
      return res.status(400).json({ code: 400, message: '业务类型和ID不能为空', data: null });
    }

    const tableName = BUSINESS_TABLE_MAP[business_type];
    if (!tableName) {
      return res.status(400).json({ code: 400, message: '不支持的业务类型', data: null });
    }

    // 检查业务记录是否存在
    const [bizRows] = await pool.query(`SELECT id, approval_status FROM ${tableName} WHERE id = ?`, [business_id]);
    if (bizRows.length === 0) {
      return res.status(404).json({ code: 404, message: '业务记录不存在', data: null });
    }

    // 检查是否需要走折扣审批（折扣超过10%时）
    let actualType = business_type;
    if (business_type === 'quote' || business_type === 'contract') {
      const [bizDetail] = await pool.query(`SELECT discount FROM ${tableName} WHERE id = ?`, [business_id]);
      if (bizDetail.length > 0 && bizDetail[0].discount) {
        const discountRate = (1 - parseFloat(bizDetail[0].discount)) * 100;
        if (discountRate > 10) {
          actualType = 'discount';
        }
      }
    }

    // 查找对应的审批流程
    const [workflows] = await pool.query(
      'SELECT id FROM crm_approval_workflow WHERE type = ? AND status = 1 AND deleted_at IS NULL LIMIT 1',
      [actualType]
    );
    if (workflows.length === 0) {
      return res.status(400).json({ code: 400, message: '未找到对应的审批流程', data: null });
    }
    const workflowId = workflows[0].id;

    // 获取第一步
    const [steps] = await pool.query(
      'SELECT * FROM crm_approval_step WHERE workflow_id = ? ORDER BY step_order LIMIT 1',
      [workflowId]
    );
    if (steps.length === 0) {
      return res.status(400).json({ code: 400, message: '审批流程未配置步骤', data: null });
    }
    const firstStep = steps[0];

    // 确定审批人
    let approverId = firstStep.approver_id;
    if (firstStep.approver_type === 'manager') {
      // 查找上级
      const [user] = await pool.query('SELECT manager_id FROM sys_user WHERE id = ?', [req.user.userId]);
      if (user.length > 0 && user[0].manager_id) {
        approverId = user[0].manager_id;
      } else {
        return res.status(400).json({ code: 400, message: '未找到上级审批人', data: null });
      }
    }

    await conn.beginTransaction();

    // 创建审批记录（折扣审批时business_type仍记录原始类型，方便查询）
    await conn.query(
      'INSERT INTO crm_approval_record (workflow_id, business_type, business_id, step_id, step_order, approver_id) VALUES (?, ?, ?, ?, ?, ?)',
      [workflowId, business_type, business_id, firstStep.id, firstStep.step_order, approverId]
    );

    // 更新业务表审批状态（1=待审批）
    await conn.query(`UPDATE ${tableName} SET approval_status = 1 WHERE id = ?`, [business_id]);

    await conn.commit();
    res.json({ code: 200, message: '已提交审批', data: null });
  } catch (error) {
    await conn.rollback();
    console.error('[审批] 提交审批失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  } finally {
    conn.release();
  }
});

// 审批通过
router.post('/approve/:id', authenticateToken, checkPermission('approval'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { remark } = req.body;

    // 获取审批记录
    const [records] = await pool.query(
      'SELECT * FROM crm_approval_record WHERE id = ? AND status = "pending"',
      [id]
    );
    if (records.length === 0) {
      return res.status(404).json({ code: 404, message: '审批记录不存在或已处理', data: null });
    }
    const record = records[0];

    // 验证审批人
    if (record.approver_id !== req.user.userId && !req.user.manageAll) {
      return res.status(403).json({ code: 403, message: '无权审批此记录', data: null });
    }

    await conn.beginTransaction();

    // 更新当前步骤为已通过
    await conn.query(
      'UPDATE crm_approval_record SET status = "approved", remark = ? WHERE id = ?',
      [remark || null, id]
    );

    // 查找下一步骤
    const [nextSteps] = await pool.query(
      'SELECT * FROM crm_approval_step WHERE workflow_id = ? AND step_order > ? ORDER BY step_order LIMIT 1',
      [record.workflow_id, record.step_order]
    );

    const tableName = BUSINESS_TABLE_MAP[record.business_type];

    if (nextSteps.length > 0) {
      // 还有下一步，创建新的审批记录
      const nextStep = nextSteps[0];
      let nextApproverId = nextStep.approver_id;

      if (nextStep.approver_type === 'manager') {
        const [user] = await pool.query('SELECT manager_id FROM sys_user WHERE id = ?', [record.approver_id]);
        if (user.length > 0 && user[0].manager_id) {
          nextApproverId = user[0].manager_id;
        }
      }

      await conn.query(
        'INSERT INTO crm_approval_record (workflow_id, business_type, business_id, step_id, step_order, approver_id) VALUES (?, ?, ?, ?, ?, ?)',
        [record.workflow_id, record.business_type, record.business_id, nextStep.id, nextStep.step_order, nextApproverId]
      );
    } else {
      // 最后一步，审批完成（2=已通过）
      await conn.query(`UPDATE ${tableName} SET approval_status = 2 WHERE id = ?`, [record.business_id]);
    }

    await conn.commit();
    res.json({ code: 200, message: '审批通过', data: { is_final: nextSteps.length === 0 } });
  } catch (error) {
    await conn.rollback();
    console.error('[审批] 审批通过失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  } finally {
    conn.release();
  }
});

// 审批驳回
router.post('/reject/:id', authenticateToken, checkPermission('approval'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { remark } = req.body;

    const [records] = await pool.query(
      'SELECT * FROM crm_approval_record WHERE id = ? AND status = "pending"',
      [id]
    );
    if (records.length === 0) {
      return res.status(404).json({ code: 404, message: '审批记录不存在或已处理', data: null });
    }
    const record = records[0];

    if (record.approver_id !== req.user.userId && !req.user.manageAll) {
      return res.status(403).json({ code: 403, message: '无权审批此记录', data: null });
    }

    await conn.beginTransaction();

    // 更新当前步骤为已驳回
    await conn.query(
      'UPDATE crm_approval_record SET status = "rejected", remark = ? WHERE id = ?',
      [remark || null, id]
    );

    // 更新业务表审批状态（3=已拒绝）
    const tableName = BUSINESS_TABLE_MAP[record.business_type];
    await conn.query(`UPDATE ${tableName} SET approval_status = 3 WHERE id = ?`, [record.business_id]);

    await conn.commit();
    res.json({ code: 200, message: '已驳回', data: null });
  } catch (error) {
    await conn.rollback();
    console.error('[审批] 驳回失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  } finally {
    conn.release();
  }
});

// 撤回审批
router.delete('/withdraw/:business_type/:business_id', authenticateToken, checkPermission('approval'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { business_type, business_id } = req.params;

    const tableName = BUSINESS_TABLE_MAP[business_type];
    if (!tableName) {
      return res.status(400).json({ code: 400, message: '不支持的业务类型', data: null });
    }

    // 查找该业务的pending状态审批记录
    const [records] = await pool.query(
      'SELECT r.* FROM crm_approval_record r WHERE r.business_type = ? AND r.business_id = ? AND r.status = "pending"',
      [business_type, business_id]
    );
    if (records.length === 0) {
      return res.status(404).json({ code: 404, message: '没有待撤回的审批记录', data: null });
    }

    // 验证是当前用户提交的（通过业务表的create_by判断）
    const [bizRows] = await pool.query(`SELECT create_by FROM ${tableName} WHERE id = ?`, [business_id]);
    if (bizRows.length === 0 || bizRows[0].create_by !== req.user.userId) {
      return res.status(403).json({ code: 403, message: '只能撤回自己提交的审批', data: null });
    }

    await conn.beginTransaction();

    // 删除pending状态的审批记录
    await conn.query(
      'DELETE FROM crm_approval_record WHERE business_type = ? AND business_id = ? AND status = "pending"',
      [business_type, business_id]
    );

    // 更新业务表审批状态为草稿（0）
    await conn.query(`UPDATE ${tableName} SET approval_status = 0 WHERE id = ?`, [business_id]);

    await conn.commit();
    res.json({ code: 200, message: '审批已撤回', data: null });
  } catch (error) {
    await conn.rollback();
    console.error('[审批] 撤回审批失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  } finally {
    conn.release();
  }
});

// 获取审批详情
router.get('/detail/:business_type/:business_id', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    const { business_type, business_id } = req.params;

    const [records] = await pool.query(`
      SELECT r.*, s.step_name, s.step_order, u.real_name as approver_name,
             w.name as workflow_name
      FROM crm_approval_record r
      JOIN crm_approval_step s ON r.step_id = s.id
      JOIN crm_approval_workflow w ON r.workflow_id = w.id
      LEFT JOIN sys_user u ON r.approver_id = u.id
      WHERE r.business_type = ? AND r.business_id = ?
      ORDER BY r.step_order ASC, r.create_time ASC
    `, [business_type, business_id]);

    res.json({ code: 200, message: '查询成功', data: records });
  } catch (error) {
    console.error('[审批] 获取审批详情失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 审批详情+客户历史
router.get('/detail-with-history/:business_type/:business_id', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    const { business_type, business_id } = req.params;
    let customerId = null;

    // 根据业务类型获取客户ID
    if (business_type === 'quote') {
      const [[biz]] = await pool.query('SELECT customer_id FROM crm_quote WHERE id = ?', [business_id]);
      customerId = biz?.customer_id;
    } else if (business_type === 'contract') {
      const [[biz]] = await pool.query('SELECT customer_id FROM crm_contract WHERE id = ?', [business_id]);
      customerId = biz?.customer_id;
    }

    let customer = null, stats = null, follows = [];
    if (customerId) {
      [[customer]] = await pool.query('SELECT company_name, level, source, contact_name, phone FROM crm_customer WHERE id = ?', [customerId]);
      [[stats]] = await pool.query(
        'SELECT COUNT(*) as contract_count, COALESCE(SUM(amount),0) as total_amount FROM crm_contract WHERE customer_id = ? AND deleted_at IS NULL', [customerId]
      );
      const [[payment]] = await pool.query(
        'SELECT COALESCE(SUM(pay_amount),0) as total_paid FROM crm_payment WHERE contract_id IN (SELECT id FROM crm_contract WHERE customer_id = ? AND deleted_at IS NULL) AND deleted_at IS NULL', [customerId]
      );
      stats = { ...stats, total_paid: payment?.total_paid || 0 };
      [follows] = await pool.query(
        'SELECT content, follow_type, create_time FROM crm_follow_up WHERE customer_id = ? AND deleted_at IS NULL ORDER BY create_time DESC LIMIT 3', [customerId]
      );
    }

    res.json({ code: 200, message: '查询成功', data: { customer, stats, follows } });
  } catch (error) {
    console.error('[审批] 获取客户历史失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 我的待审批
router.get('/my-pending', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.*, w.name as workflow_name, w.type as business_type_name,
             s.step_name, u.real_name as submitter_name
      FROM crm_approval_record r
      JOIN crm_approval_workflow w ON r.workflow_id = w.id
      JOIN crm_approval_step s ON r.step_id = s.id
      LEFT JOIN sys_user u ON r.approver_id = u.id
      WHERE r.approver_id = ? AND r.status = 'pending'
      ORDER BY r.create_time DESC
    `, [req.user.userId]);

    // [性能修复] 批量获取业务记录标题，避免 N+1 查询
    const bizIds = { quote: [], contract: [], purchase: [] };
    rows.forEach(row => {
      if (bizIds[row.business_type] !== undefined) {
        bizIds[row.business_type].push(row.business_id);
      }
    });

    const bizTitleMap = {};
    const titleFields = { quote: 'quote_no', contract: 'contract_no', purchase: 'order_no' };
    const batchQueries = [];
    for (const [type, ids] of Object.entries(bizIds)) {
      if (ids.length > 0) {
        batchQueries.push(
          pool.query(`SELECT id, ${titleFields[type]} as title FROM ${BUSINESS_TABLE_MAP[type]} WHERE id IN (?)`, [ids])
            .then(([r]) => r.forEach(b => { bizTitleMap[`${type}:${b.id}`] = b.title; }))
        );
      }
    }
    await Promise.all(batchQueries);

    rows.forEach(row => {
      row.business_title = bizTitleMap[`${row.business_type}:${row.business_id}`] || `ID:${row.business_id}`;
    });

    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[审批] 获取待审批列表失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 我提交的审批
router.get('/my-submitted', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
    // 通过业务表查询我创建的记录的审批状态
    const results = [];

    // 报价审批
    const [quotes] = await pool.query(`
      SELECT 'quote' as business_type, q.id as business_id, q.quote_no as business_title,
             q.approval_status, q.create_time,
             (SELECT JSON_ARRAYAGG(JSON_OBJECT('step_name', s.step_name, 'status', r.status, 'approver', u.real_name, 'remark', r.remark, 'time', r.update_time))
              FROM crm_approval_record r
              JOIN crm_approval_step s ON r.step_id = s.id
              LEFT JOIN sys_user u ON r.approver_id = u.id
              WHERE r.business_type = 'quote' AND r.business_id = q.id) as approval_history
      FROM crm_quote q
      WHERE q.create_by = ? AND q.approval_status != 2 AND q.deleted_at IS NULL
      ORDER BY q.create_time DESC LIMIT 50
    `, [req.user.userId]);
    results.push(...quotes);

    // 合同审批
    const [contracts] = await pool.query(`
      SELECT 'contract' as business_type, c.id as business_id, c.contract_no as business_title,
             c.approval_status, c.create_time,
             (SELECT JSON_ARRAYAGG(JSON_OBJECT('step_name', s.step_name, 'status', r.status, 'approver', u.real_name, 'remark', r.remark, 'time', r.update_time))
              FROM crm_approval_record r
              JOIN crm_approval_step s ON r.step_id = s.id
              LEFT JOIN sys_user u ON r.approver_id = u.id
              WHERE r.business_type = 'contract' AND r.business_id = c.id) as approval_history
      FROM crm_contract c
      WHERE c.create_by = ? AND c.approval_status != 2 AND c.deleted_at IS NULL
      ORDER BY c.create_time DESC LIMIT 50
    `, [req.user.userId]);
    results.push(...contracts);

    // 采购审批
    const [purchases] = await pool.query(`
      SELECT 'purchase' as business_type, p.id as business_id, p.order_no as business_title,
             p.approval_status, p.create_time,
             (SELECT JSON_ARRAYAGG(JSON_OBJECT('step_name', s.step_name, 'status', r.status, 'approver', u.real_name, 'remark', r.remark, 'time', r.update_time))
              FROM crm_approval_record r
              JOIN crm_approval_step s ON r.step_id = s.id
              LEFT JOIN sys_user u ON r.approver_id = u.id
              WHERE r.business_type = 'purchase' AND r.business_id = p.id) as approval_history
      FROM crm_purchase_order p
      WHERE p.create_by = ? AND p.approval_status != 2 AND p.deleted_at IS NULL
      ORDER BY p.create_time DESC LIMIT 50
    `, [req.user.userId]);
    results.push(...purchases);

    results.sort((a, b) => new Date(b.create_time) - new Date(a.create_time));

    res.json({ code: 200, message: '查询成功', data: results });
  } catch (error) {
    console.error('[审批] 获取已提交审批失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 批量通过
router.post('/batch-approve', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
  const { ids, remark } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ code: 400, message: '请选择要审批的记录', data: null });
  }

  let success = 0, failed = 0;
  for (const id of ids) {
    const conn = await pool.getConnection();
    try {
      const [records] = await pool.query('SELECT * FROM crm_approval_record WHERE id = ? AND status = "pending"', [id]);
      if (records.length === 0) { failed++; continue; }
      const record = records[0];
      if (record.approver_id !== req.user.userId && !req.user.manageAll) { failed++; continue; }

      await conn.beginTransaction();
      await conn.query('UPDATE crm_approval_record SET status = "approved", remark = ? WHERE id = ?', [remark || null, id]);

      const [nextSteps] = await pool.query('SELECT * FROM crm_approval_step WHERE workflow_id = ? AND step_order > ? ORDER BY step_order LIMIT 1', [record.workflow_id, record.step_order]);
      const tableName = BUSINESS_TABLE_MAP[record.business_type];

      if (nextSteps.length > 0) {
        const nextStep = nextSteps[0];
        let nextApproverId = nextStep.approver_id;
        if (nextStep.approver_type === 'manager') {
          const [user] = await pool.query('SELECT manager_id FROM sys_user WHERE id = ?', [record.approver_id]);
          if (user.length > 0 && user[0].manager_id) nextApproverId = user[0].manager_id;
        }
        await conn.query('INSERT INTO crm_approval_record (workflow_id, business_type, business_id, step_id, step_order, approver_id) VALUES (?, ?, ?, ?, ?, ?)', [record.workflow_id, record.business_type, record.business_id, nextStep.id, nextStep.step_order, nextApproverId]);
      } else {
        await conn.query(`UPDATE ${tableName} SET approval_status = 2 WHERE id = ?`, [record.business_id]);
      }

      await conn.commit();
      success++;
    } catch (e) {
      await conn.rollback();
      failed++;
    } finally {
      conn.release();
    }
  }
  res.json({ code: 200, message: `批量审批完成：成功${success}条，失败${failed}条`, data: { success, failed } });
  } catch (error) {
    console.error('[审批] 批量通过错误:', error);
    res.status(500).json({ code: 500, message: '批量审批失败', data: null });
  }
});

// 批量驳回
router.post('/batch-reject', authenticateToken, checkPermission('approval'), async (req, res) => {
  try {
  const { ids, remark } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ code: 400, message: '请选择要驳回的记录', data: null });
  }

  let success = 0, failed = 0;
  for (const id of ids) {
    const conn = await pool.getConnection();
    try {
      const [records] = await pool.query('SELECT * FROM crm_approval_record WHERE id = ? AND status = "pending"', [id]);
      if (records.length === 0) { failed++; continue; }
      const record = records[0];
      if (record.approver_id !== req.user.userId && !req.user.manageAll) { failed++; continue; }

      await conn.beginTransaction();
      await conn.query('UPDATE crm_approval_record SET status = "rejected", remark = ? WHERE id = ?', [remark || null, id]);
      const tableName = BUSINESS_TABLE_MAP[record.business_type];
      await conn.query(`UPDATE ${tableName} SET approval_status = 3 WHERE id = ?`, [record.business_id]);
      await conn.commit();
      success++;
    } catch (e) {
      await conn.rollback();
      failed++;
    } finally {
      conn.release();
    }
  }
  res.json({ code: 200, message: `批量驳回完成：成功${success}条，失败${failed}条`, data: { success, failed } });
  } catch (error) {
    console.error('[审批] 批量驳回错误:', error);
    res.status(500).json({ code: 500, message: '批量驳回失败', data: null });
  }
});

module.exports = router;
