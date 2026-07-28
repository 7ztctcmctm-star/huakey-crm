/**
 * 审批核心服务层
 * 从 routes/approval.js 提取的业务逻辑
 */
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

const BUSINESS_TABLE_MAP = {
  quote: 'crm_quote',
  contract: 'crm_contract',
  purchase: 'crm_purchase_order'
};

/**
 * 审批表名校验白名单 — 仅允许 BUSINESS_TABLE_MAP 中已定义的表名
 * 防止未来扩展 BUSINESS_TABLE_MAP 时引入未经校验的表名导致 SQL 注入
 */
const VALID_TABLES = new Set(Object.values(BUSINESS_TABLE_MAP));

function validateTable(tableName) {
  if (!VALID_TABLES.has(tableName)) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, `非法表名: ${tableName}`);
  }
  return tableName;
}

// ============ 工作流 CRUD ============

async function listWorkflows(pool) {
  const [rows] = await pool.query(`
    SELECT w.id, w.name, w.type, w.description, w.status, w.create_by, w.create_time, w.update_time, w.deleted_at,
      u.real_name as create_by_name,
      (SELECT COUNT(*) FROM crm_approval_step s WHERE s.workflow_id = w.id) as step_count
    FROM crm_approval_workflow w LEFT JOIN sys_user u ON w.create_by = u.id
    WHERE w.deleted_at IS NULL ORDER BY w.type, w.name
  `);
  if (rows.length > 0) {
    const ids = rows.map(r => r.id);
    const [steps] = await pool.query('SELECT id, workflow_id, step_order, step_name, approver_type, approver_id, is_required, create_time FROM crm_approval_step WHERE workflow_id IN (?) ORDER BY workflow_id, step_order', [ids]);
    rows.forEach(r => { r.steps = steps.filter(s => s.workflow_id === r.id); });
  }
  return rows;
}

async function createWorkflow(pool, data, userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO crm_approval_workflow (name, type, description, create_by) VALUES (?, ?, ?, ?)',
      [data.name.trim(), data.type, data.description || null, userId]
    );
    const workflowId = result.insertId;
    for (let i = 0; i < data.steps.length; i++) {
      const s = data.steps[i];
      await conn.query(
        'INSERT INTO crm_approval_step (workflow_id, step_order, step_name, approver_type, approver_id, is_required) VALUES (?, ?, ?, ?, ?, ?)',
        [workflowId, i + 1, s.step_name, s.approver_type, s.approver_id || null, s.is_required !== undefined ? s.is_required : 1]
      );
    }
    await conn.commit();
    return { id: workflowId };
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
}

async function updateWorkflow(pool, id, data) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const fields = [];
    const values = [];
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name.trim()); }
    if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(parseInt(data.status)); }
    if (fields.length > 0) { values.push(id); await conn.query(`UPDATE crm_approval_workflow SET ${fields.join(', ')} WHERE id = ?`, values); }
    if (data.steps && data.steps.length > 0) {
      await conn.query('DELETE FROM crm_approval_step WHERE workflow_id = ?', [id]);
      for (let i = 0; i < data.steps.length; i++) {
        const s = data.steps[i];
        await conn.query('INSERT INTO crm_approval_step (workflow_id, step_order, step_name, approver_type, approver_id, is_required) VALUES (?, ?, ?, ?, ?, ?)',
          [id, i + 1, s.step_name, s.approver_type, s.approver_id || null, s.is_required !== undefined ? s.is_required : 1]);
      }
    }
    await conn.commit();
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
}

async function deleteWorkflow(pool, id) {
  await pool.query('UPDATE crm_approval_workflow SET deleted_at = NOW() WHERE id = ?', [id]);
}

// ============ 审批流程 ============

async function submitApproval(pool, businessType, businessId, userId) {
  const tableName = BUSINESS_TABLE_MAP[businessType];
  if (!tableName) throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '不支持的业务类型');

  const [bizRows] = await pool.query(`SELECT id, approval_status FROM ${validateTable(tableName)} WHERE id = ?`, [businessId]);
  if (bizRows.length === 0) throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '业务记录不存在');

  let actualType = businessType;
  if (businessType === 'quote' || businessType === 'contract') {
    const [bizDetail] = await pool.query(`SELECT discount FROM ${validateTable(tableName)} WHERE id = ?`, [businessId]);
    if (bizDetail.length > 0 && bizDetail[0].discount != null) {
      const discountRate = parseFloat(bizDetail[0].discount) * 100;
      if (discountRate > 10) actualType = 'discount';
    }
  }

  const [workflows] = await pool.query('SELECT id FROM crm_approval_workflow WHERE type = ? AND status = 1 AND deleted_at IS NULL LIMIT 1', [actualType]);
  if (workflows.length === 0) throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '未找到对应的审批流程');

  const [steps] = await pool.query('SELECT id, workflow_id, step_order, step_name, approver_type, approver_id, is_required FROM crm_approval_step WHERE workflow_id = ? ORDER BY step_order LIMIT 1', [workflows[0].id]);
  if (steps.length === 0) throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '审批流程未配置步骤');
  const firstStep = steps[0];

  let approverId = firstStep.approver_id;
  if (firstStep.approver_type === 'manager') {
    const [user] = await pool.query('SELECT manager_id FROM sys_user WHERE id = ?', [userId]);
    if (user.length > 0 && user[0].manager_id) { approverId = user[0].manager_id; }
    else throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '未找到上级审批人');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('INSERT INTO crm_approval_record (workflow_id, business_type, business_id, step_id, step_order, approver_id) VALUES (?, ?, ?, ?, ?, ?)',
      [workflows[0].id, businessType, businessId, firstStep.id, firstStep.step_order, approverId]);
    await conn.query(`UPDATE ${validateTable(tableName)} SET approval_status = 1 WHERE id = ?`, [businessId]);
    await conn.commit();
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
}

async function approveRecord(pool, recordId, remark, userId, manageAll) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // [安全] SELECT FOR UPDATE 锁定行，防止 TOCTOU 并发竞态
    const [records] = await conn.query('SELECT id, workflow_id, business_type, business_id, step_id, step_order, approver_id, status FROM crm_approval_record WHERE id = ? AND status = "pending" FOR UPDATE', [recordId]);
    if (records.length === 0) throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '审批记录不存在或已处理');
    const record = records[0];
    if (record.approver_id !== userId && !manageAll) throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权审批此记录');

    await conn.query('UPDATE crm_approval_record SET status = "approved", remark = ? WHERE id = ?', [remark || null, recordId]);

    const [nextSteps] = await conn.query('SELECT id, workflow_id, step_order, step_name, approver_type, approver_id, is_required FROM crm_approval_step WHERE workflow_id = ? AND step_order > ? ORDER BY step_order LIMIT 1', [record.workflow_id, record.step_order]);
    const tableName = BUSINESS_TABLE_MAP[record.business_type];

    if (nextSteps.length > 0) {
      const nextStep = nextSteps[0];
      let nextApproverId = nextStep.approver_id;
      if (nextStep.approver_type === 'manager') {
        const [user] = await conn.query('SELECT manager_id FROM sys_user WHERE id = ?', [record.approver_id]);
        if (user.length > 0 && user[0].manager_id) nextApproverId = user[0].manager_id;
      }
      await conn.query('INSERT INTO crm_approval_record (workflow_id, business_type, business_id, step_id, step_order, approver_id) VALUES (?, ?, ?, ?, ?, ?)',
        [record.workflow_id, record.business_type, record.business_id, nextStep.id, nextStep.step_order, nextApproverId]);
    } else {
      await conn.query(`UPDATE ${validateTable(tableName)} SET approval_status = 2 WHERE id = ?`, [record.business_id]);
    }

    await conn.commit();
    return { is_final: nextSteps.length === 0 };
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
}

async function rejectRecord(pool, recordId, remark, userId, manageAll) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // [安全] SELECT FOR UPDATE 锁定行，防止 TOCTOU 并发竞态
    const [records] = await conn.query('SELECT id, workflow_id, business_type, business_id, step_id, step_order, approver_id, status FROM crm_approval_record WHERE id = ? AND status = "pending" FOR UPDATE', [recordId]);
    if (records.length === 0) throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '审批记录不存在或已处理');
    const record = records[0];
    if (record.approver_id !== userId && !manageAll) throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权审批此记录');

    await conn.query('UPDATE crm_approval_record SET status = "rejected", remark = ? WHERE id = ?', [remark || null, recordId]);
    const tableName = BUSINESS_TABLE_MAP[record.business_type];
    await conn.query(`UPDATE ${validateTable(tableName)} SET approval_status = 3 WHERE id = ?`, [record.business_id]);
    await conn.commit();
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
}

async function withdrawApproval(pool, businessType, businessId, userId) {
  const tableName = BUSINESS_TABLE_MAP[businessType];
  if (!tableName) throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '不支持的业务类型', 400);

  const [records] = await pool.query('SELECT r.id, r.workflow_id, r.business_type, r.business_id, r.step_id, r.step_order, r.approver_id, r.status FROM crm_approval_record r WHERE r.business_type = ? AND r.business_id = ? AND r.status = "pending"', [businessType, businessId]);
  if (records.length === 0) throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '没有待撤回的审批记录');

  const [bizRows] = await pool.query(`SELECT create_by FROM ${validateTable(tableName)} WHERE id = ?`, [businessId]);
  if (bizRows.length === 0 || bizRows[0].create_by !== userId) throw new AppError(ErrorCodes.PERMISSION_DENIED, '只能撤回自己提交的审批');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM crm_approval_record WHERE business_type = ? AND business_id = ? AND status = "pending"', [businessType, businessId]);
    await conn.query(`UPDATE ${validateTable(tableName)} SET approval_status = 0 WHERE id = ?`, [businessId]);
    await conn.commit();
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
}

// ============ 查询 ============

async function getApprovalDetail(pool, businessType, businessId) {
  const [records] = await pool.query(`
    SELECT r.id, r.workflow_id, r.business_type, r.business_id, r.step_id, r.step_order, r.approver_id, r.status, r.remark, r.create_time, r.update_time,
      s.step_name, s.step_order, u.real_name as approver_name, w.name as workflow_name
    FROM crm_approval_record r
    JOIN crm_approval_step s ON r.step_id = s.id
    JOIN crm_approval_workflow w ON r.workflow_id = w.id
    LEFT JOIN sys_user u ON r.approver_id = u.id
    WHERE r.business_type = ? AND r.business_id = ?
    ORDER BY r.step_order ASC, r.create_time ASC
  `, [businessType, businessId]);
  return records;
}

async function getDetailWithHistory(pool, businessType, businessId) {
  let customerId = null;
  if (businessType === 'quote') {
    const [[biz]] = await pool.query('SELECT customer_id FROM crm_quote WHERE id = ?', [businessId]);
    customerId = biz?.customer_id;
  } else if (businessType === 'contract') {
    const [[biz]] = await pool.query('SELECT customer_id FROM crm_contract WHERE id = ?', [businessId]);
    customerId = biz?.customer_id;
  }

  let customer = null, stats = null, follows = [];
  if (customerId) {
    [[customer]] = await pool.query(`
      SELECT c.company_name, c.level, c.source, pc.name as contact_name, pc.phone
      FROM crm_customer c
      LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
      WHERE c.id = ?
    `, [customerId]);
    [[stats]] = await pool.query('SELECT COUNT(*) as contract_count, COALESCE(SUM(amount),0) as total_amount FROM crm_contract WHERE customer_id = ? AND deleted_at IS NULL', [customerId]);
    const [[payment]] = await pool.query('SELECT COALESCE(SUM(pay_amount),0) as total_paid FROM crm_payment WHERE contract_id IN (SELECT id FROM crm_contract WHERE customer_id = ? AND deleted_at IS NULL) AND deleted_at IS NULL', [customerId]);
    stats = { ...stats, total_paid: payment?.total_paid || 0 };
    [follows] = await pool.query('SELECT content, follow_type, create_time FROM crm_follow_up WHERE customer_id = ? AND deleted_at IS NULL ORDER BY create_time DESC LIMIT 3', [customerId]);
  }
  return { customer, stats, follows };
}

async function getMyPending(pool, userId) {
  const [rows] = await pool.query(`
    SELECT r.id, r.workflow_id, r.business_type, r.business_id, r.step_id, r.step_order, r.approver_id, r.status, r.remark, r.create_time, r.update_time,
      w.name as workflow_name, w.type as business_type_name, s.step_name, u.real_name as submitter_name
    FROM crm_approval_record r
    JOIN crm_approval_workflow w ON r.workflow_id = w.id
    JOIN crm_approval_step s ON r.step_id = s.id
    LEFT JOIN sys_user u ON r.approver_id = u.id
    WHERE r.approver_id = ? AND r.status = 'pending' ORDER BY r.create_time DESC
  `, [userId]);

  const bizIds = { quote: [], contract: [], purchase: [] };
  rows.forEach(row => { if (bizIds[row.business_type] !== undefined) bizIds[row.business_type].push(row.business_id); });

  const bizTitleMap = {};
  const titleFields = { quote: 'quote_no', contract: 'contract_no', purchase: 'order_no' };
  const batchQueries = [];
  for (const [type, ids] of Object.entries(bizIds)) {
    if (ids.length > 0) {
      batchQueries.push(
        pool.query(`SELECT id, ${titleFields[type]} as title FROM ${validateTable(BUSINESS_TABLE_MAP[type])} WHERE id IN (?)`, [ids])
          .then(([r]) => r.forEach(b => { bizTitleMap[`${type}:${b.id}`] = b.title; }))
      );
    }
  }
  await Promise.all(batchQueries);
  rows.forEach(row => { row.business_title = bizTitleMap[`${row.business_type}:${row.business_id}`] || `ID:${row.business_id}`; });
  return rows;
}

async function getMySubmitted(pool, userId) {
  const results = [];
  const types = [
    { type: 'quote', table: 'crm_quote', no: 'quote_no' },
    { type: 'contract', table: 'crm_contract', no: 'contract_no' },
    { type: 'purchase', table: 'crm_purchase_order', no: 'order_no' }
  ];
  for (const t of types) {
    const [rows] = await pool.query(`
      SELECT '${t.type}' as business_type, q.id as business_id, q.${t.no} as business_title,
             q.approval_status, q.create_time,
             (SELECT JSON_ARRAYAGG(JSON_OBJECT('step_name', s.step_name, 'status', r.status, 'approver', u.real_name, 'remark', r.remark, 'time', r.update_time))
              FROM crm_approval_record r JOIN crm_approval_step s ON r.step_id = s.id LEFT JOIN sys_user u ON r.approver_id = u.id
              WHERE r.business_type = '${t.type}' AND r.business_id = q.id) as approval_history
      FROM ${t.table} q
      WHERE q.create_by = ? AND q.approval_status != 2 AND q.deleted_at IS NULL
      ORDER BY q.create_time DESC LIMIT 50
    `, [userId]);
    results.push(...rows);
  }
  results.sort((a, b) => new Date(b.create_time) - new Date(a.create_time));
  return results;
}

// ============ 批量操作 ============

async function batchApprove(pool, ids, remark, userId, manageAll) {
  let success = 0, failed = 0;
  for (const id of ids) {
    const conn = await pool.getConnection();
    try {
      const [records] = await pool.query('SELECT id, workflow_id, business_type, business_id, step_id, step_order, approver_id, status FROM crm_approval_record WHERE id = ? AND status = "pending"', [id]);
      if (records.length === 0) { failed++; continue; }
      const record = records[0];
      if (record.approver_id !== userId && !manageAll) { failed++; continue; }

      await conn.beginTransaction();
      await conn.query('UPDATE crm_approval_record SET status = "approved", remark = ? WHERE id = ?', [remark || null, id]);
      const [nextSteps] = await pool.query('SELECT id, workflow_id, step_order, step_name, approver_type, approver_id, is_required FROM crm_approval_step WHERE workflow_id = ? AND step_order > ? ORDER BY step_order LIMIT 1', [record.workflow_id, record.step_order]);
      const tableName = BUSINESS_TABLE_MAP[record.business_type];

      if (nextSteps.length > 0) {
        const nextStep = nextSteps[0];
        let nextApproverId = nextStep.approver_id;
        if (nextStep.approver_type === 'manager') {
          const [user] = await pool.query('SELECT manager_id FROM sys_user WHERE id = ?', [record.approver_id]);
          if (user.length > 0 && user[0].manager_id) nextApproverId = user[0].manager_id;
        }
        await conn.query('INSERT INTO crm_approval_record (workflow_id, business_type, business_id, step_id, step_order, approver_id) VALUES (?, ?, ?, ?, ?, ?)',
          [record.workflow_id, record.business_type, record.business_id, nextStep.id, nextStep.step_order, nextApproverId]);
      } else {
        await conn.query(`UPDATE ${validateTable(tableName)} SET approval_status = 2 WHERE id = ?`, [record.business_id]);
      }
      await conn.commit(); success++;
    } catch (e) { await conn.rollback(); failed++; } finally { conn.release(); }
  }
  return { success, failed };
}

async function batchReject(pool, ids, remark, userId, manageAll) {
  let success = 0, failed = 0;
  for (const id of ids) {
    const conn = await pool.getConnection();
    try {
      const [records] = await pool.query('SELECT id, workflow_id, business_type, business_id, step_id, step_order, approver_id, status FROM crm_approval_record WHERE id = ? AND status = "pending"', [id]);
      if (records.length === 0) { failed++; continue; }
      const record = records[0];
      if (record.approver_id !== userId && !manageAll) { failed++; continue; }

      await conn.beginTransaction();
      await conn.query('UPDATE crm_approval_record SET status = "rejected", remark = ? WHERE id = ?', [remark || null, id]);
      const tableName = BUSINESS_TABLE_MAP[record.business_type];
      await conn.query(`UPDATE ${validateTable(tableName)} SET approval_status = 3 WHERE id = ?`, [record.business_id]);
      await conn.commit(); success++;
    } catch (e) { await conn.rollback(); failed++; } finally { conn.release(); }
  }
  return { success, failed };
}

// ============ 合同简单审批（非工作流） ============

async function simpleApproveContract(pool, id, approval_status, approval_remark, userId) {
  const [rows] = await pool.query('SELECT id FROM crm_contract WHERE id = ? AND deleted_at IS NULL', [id]);
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '合同不存在');
  }

  await pool.query(
    'UPDATE crm_contract SET approval_status = ?, approver_id = ?, approval_remark = ? WHERE id = ?',
    [approval_status, userId, approval_remark || null, id]
  );

  await pool.query(
    'UPDATE crm_notification SET is_dismissed = 1, is_read = 1 WHERE business_type = ? AND business_id = ? AND is_dismissed = 0',
    ['contract', id]
  );
}

module.exports = {
  BUSINESS_TABLE_MAP,
  listWorkflows, createWorkflow, updateWorkflow, deleteWorkflow,
  submitApproval, approveRecord, rejectRecord, withdrawApproval,
  getApprovalDetail, getDetailWithHistory, getMyPending, getMySubmitted,
  batchApprove, batchReject,
  simpleApproveContract
};
