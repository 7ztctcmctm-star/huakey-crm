/**
 * 审批核心服务层
 * 从 routes/approval.js 提取的业务逻辑
 */
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');
const notificationService = require('./notificationService');
const money = require('../utils/money');

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

  const [bizRows] = await pool.query(
    `SELECT id, approval_status, amount, discount FROM ${validateTable(tableName)} WHERE id = ?`,
    [businessId]
  );
  if (bizRows.length === 0) throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '业务记录不存在');
  const biz = bizRows[0];

  // 折扣率判定（金额数学统一走 money.js，规避浮点误差）
  let actualType = businessType;
  const discountVal = biz.discount != null ? money.toDecimalString(biz.discount) : '0';
  if (businessType === 'quote' || businessType === 'contract') {
    const discountRate = money.mul(discountVal, '100'); // 折后减免百分比
    if (Number(discountRate) > 10) actualType = 'discount';
  }
  const amount = biz.amount != null ? money.toDecimalString(biz.amount) : '0';

  const [workflows] = await pool.query('SELECT id FROM crm_approval_workflow WHERE type = ? AND status = 1 AND deleted_at IS NULL LIMIT 1', [actualType]);
  if (workflows.length === 0) throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '未找到对应的审批流程');

  const [steps] = await pool.query('SELECT id, workflow_id, step_order, step_name, approver_type, approver_id, is_required FROM crm_approval_step WHERE workflow_id = ? ORDER BY step_order LIMIT 1', [workflows[0].id]);
  if (steps.length === 0) throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '审批流程未配置步骤');
  const firstStep = steps[0];

  // 阈值→审批人矩阵：优先按金额匹配规则决定首审批人（PRD R-11）
  let approverId = firstStep.approver_id;
  const ruleApprover = await resolveThresholdApprover(pool, actualType, amount);
  if (ruleApprover) {
    if (ruleApprover.approver_type === 'manager') {
      const [mgr] = await pool.query('SELECT manager_id FROM sys_user WHERE id = ?', [userId]);
      if (mgr.length > 0 && mgr[0].manager_id) approverId = mgr[0].manager_id;
      else throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '未找到上级审批人');
    } else if (ruleApprover.approver_id != null) {
      approverId = ruleApprover.approver_id;
    }
  } else if (firstStep.approver_type === 'manager') {
    const [user] = await pool.query('SELECT manager_id FROM sys_user WHERE id = ?', [userId]);
    if (user.length > 0 && user[0].manager_id) approverId = user[0].manager_id;
    else throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '未找到上级审批人');
  } else if (firstStep.approver_type === 'role') {
    // 步骤 role 类型的 approver_id 存的是**角色 id**（前端 workflow.vue 绑定 r.id），
    // 绝不能直接当 userId 用（原实现有此缺陷）→ 按角色解析为在职用户。
    approverId = await resolveRoleApproverId(pool, firstStep);
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

/**
 * 解析「工作流步骤」中 role 类型步骤对应的审批人用户 id。
 *
 * ⚠️ 语义（勿再搞错）：`crm_approval_step.approver_id` 对 role 类型存的是**角色 id**
 * （前端 `views/approval/workflow.vue` 的「选择角色」下拉把 `r.id` 绑到 `approver_id`）。
 * 原实现直接把该值当 userId 写入 `crm_approval_record.approver_id`，导致「角色审批」
 * 被错误地指派给「id 恰好等于该角色 id 的用户」。此处按角色关联到在职用户解析，
 * 全程按 `sys_role.id` 关联、**不硬编码任何角色号**（与 roleCode 口径等价）。
 *
 * @param {object} cx  连接或连接池（须具备 query 方法）
 * @param {{approver_type:string, approver_id:?number}} step
 * @returns {Promise<number>} 解析出的审批人用户 id
 */
async function resolveRoleApproverId(cx, step) {
  if (step.approver_type !== 'role') return step.approver_id;
  const [rows] = await cx.query(
    `SELECT u.id FROM sys_user u JOIN sys_role r ON u.role_id = r.id
      WHERE r.id = ? AND (u.status IS NULL OR u.status <> 0)
      ORDER BY u.id LIMIT 1`,
    [step.approver_id]
  );
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '审批流程的角色审批人无可用用户');
  }
  return rows[0].id;
}

/**
 * 按业务金额匹配阈值规则，解析出首审批人。
 * 无匹配规则返回 null（调用方回退到工作流步骤默认审批人，行为保持不变）。
 * @returns {Promise<{approver_type:string, approver_id:?number}|null>}
 */
async function resolveThresholdApprover(pool, businessType, amount) {
  const [rows] = await pool.query(
    `SELECT id, business_type, min_amount, max_amount, approver_type, approver_ref, priority
     FROM crm_approval_rule
     WHERE business_type = ? AND status = 1 AND deleted_at IS NULL
       AND (? >= min_amount)
       AND (max_amount IS NULL OR ? < max_amount)
     ORDER BY priority DESC, min_amount DESC
     LIMIT 1`,
    [businessType, amount, amount]
  );
  if (rows.length === 0) return null;
  const rule = rows[0];
  if (rule.approver_type === 'manager') {
    return { approver_type: 'manager', approver_id: null };
  }
  if (rule.approver_type === 'role') {
    // 按 roleCode 解析（禁止硬编码 roleId）
    const [users] = await pool.query(
      `SELECT u.id FROM sys_user u JOIN sys_role r ON u.role_id = r.id
       WHERE r.role_code = ? AND u.deleted_at IS NULL AND u.status = 1 LIMIT 1`,
      [rule.approver_ref]
    );
    if (users.length === 0) return null;
    return { approver_type: 'role', approver_id: users[0].id };
  }
  // user
  return { approver_type: 'user', approver_id: Number(rule.approver_ref) };
}

// ============ 审批规则（阈值→审批人矩阵） ============

async function listApprovalRules(pool, businessType) {
  const where = ['r.deleted_at IS NULL'];
  const params = [];
  if (businessType) { where.push('r.business_type = ?'); params.push(businessType); }
  const [rows] = await pool.query(
    `SELECT r.id, r.business_type, r.min_amount, r.max_amount, r.approver_type, r.approver_ref, r.priority, r.status, r.description, r.create_time,
       u.real_name as approver_name
     FROM crm_approval_rule r
     LEFT JOIN sys_user u ON r.approver_type = 'user' AND u.id = CAST(r.approver_ref AS UNSIGNED)
     WHERE ${where.join(' AND ')}
     ORDER BY r.business_type, r.priority DESC, r.min_amount ASC`,
    params
  );
  return rows;
}

function normalizeApproverRef(data) {
  if (data.approver_type === 'manager') return null;
  if (data.approver_ref === undefined || data.approver_ref === null || data.approver_ref === '') return null;
  return String(data.approver_ref);
}

async function createApprovalRule(pool, data, userId) {
  const [result] = await pool.query(
    `INSERT INTO crm_approval_rule (business_type, min_amount, max_amount, approver_type, approver_ref, priority, status, description, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.business_type,
      data.min_amount,
      data.max_amount != null ? data.max_amount : null,
      data.approver_type,
      normalizeApproverRef(data),
      data.priority != null ? data.priority : 0,
      data.status != null ? data.status : 1,
      data.description || null,
      userId
    ]
  );
  return { id: result.insertId };
}

async function updateApprovalRule(pool, id, data) {
  const fields = [];
  const values = [];
  if (data.business_type !== undefined) { fields.push('business_type = ?'); values.push(data.business_type); }
  if (data.min_amount !== undefined) { fields.push('min_amount = ?'); values.push(data.min_amount); }
  if (data.max_amount !== undefined) { fields.push('max_amount = ?'); values.push(data.max_amount); }
  if (data.approver_type !== undefined) { fields.push('approver_type = ?'); values.push(data.approver_type); }
  if (data.approver_ref !== undefined) { fields.push('approver_ref = ?'); values.push(normalizeApproverRef(data)); }
  if (data.priority !== undefined) { fields.push('priority = ?'); values.push(data.priority); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (fields.length === 0) return;
  values.push(id);
  await pool.query(`UPDATE crm_approval_rule SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
}

async function deleteApprovalRule(pool, id) {
  await pool.query('UPDATE crm_approval_rule SET deleted_at = NOW() WHERE id = ?', [id]);
}

// ============ 转交 ============

async function transferApproval(pool, recordId, toUserId, remark, userId, manageAll) {
  if (!toUserId || toUserId === userId) {
    // 转交给自己无意义；仍允许（便于管理员重新指派场景），但目标必须存在
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [records] = await conn.query(
      'SELECT id, business_type, business_id, step_id, step_order, approver_id, status FROM crm_approval_record WHERE id = ? AND status = "pending" FOR UPDATE',
      [recordId]
    );
    if (records.length === 0) throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '审批记录不存在或已处理');
    const record = records[0];
    if (record.approver_id !== userId && !manageAll) throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权转交此记录');

    const [toUsers] = await conn.query('SELECT id FROM sys_user WHERE id = ? AND deleted_at IS NULL', [toUserId]);
    if (toUsers.length === 0) throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '目标审批人不存在');

    const note = remark && String(remark).trim() ? ` [转交:${String(remark).trim()}]` : ' [转交]';
    await conn.query(
      'UPDATE crm_approval_record SET approver_id = ?, remark = CONCAT(COALESCE(remark, ""), ?) WHERE id = ?',
      [toUserId, note, recordId]
    );
    await conn.commit();
    return { id: recordId, approver_id: toUserId };
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
}

// ============ 已办结 ============

async function getMyCompleted(pool, userId) {
  const results = [];
  // [安全] types 为代码内硬编码常量，非用户输入；表名在 BUSINESS_TABLE_MAP 白名单内
  const types = [
    { type: 'quote', table: 'crm_quote', no: 'quote_no' },
    { type: 'contract', table: 'crm_contract', no: 'contract_no' },
    { type: 'purchase', table: 'crm_purchase_order', no: 'order_no' }
  ];
  for (const t of types) {
    // [安全] 表名/业务类型/字段名均来自上方常量数组，非用户输入；仅 userId 参数化
    validateTable(t.table);
    const [rows] = await pool.query(
      `SELECT '${t.type}' as business_type, q.id as business_id, q.${t.no} as business_title,
             q.approval_status, q.create_time, q.amount, q.discount,
             (SELECT JSON_ARRAYAGG(JSON_OBJECT('step_name', s.step_name, 'status', r.status, 'approver', u.real_name, 'remark', r.remark, 'time', r.update_time))
              FROM crm_approval_record r JOIN crm_approval_step s ON r.step_id = s.id LEFT JOIN sys_user u ON r.approver_id = u.id
              WHERE r.business_type = '${t.type}' AND r.business_id = q.id) as approval_history
      FROM ${t.table} q
      WHERE q.create_by = ? AND q.approval_status IN (2, 3) AND q.deleted_at IS NULL
      ORDER BY q.create_time DESC LIMIT 50
    `, [userId]);
    results.push(...rows);
  }
  results.sort((a, b) => new Date(b.create_time) - new Date(a.create_time));
  return results;
}

// ============ 详情（申请人/金额/折扣率/关联客户只读卡片/审批历史时间线） ============

async function getApprovalDetailFull(pool, businessType, businessId) {
  const tableName = BUSINESS_TABLE_MAP[businessType];
  if (!tableName) throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '不支持的业务类型');

  const [biz] = await pool.query(
    `SELECT id, create_by, amount, discount, customer_id FROM ${validateTable(tableName)} WHERE id = ? AND deleted_at IS NULL`,
    [businessId]
  );
  if (biz.length === 0) throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '业务记录不存在');
  const business = biz[0];

  let applicant = null;
  if (business.create_by) {
    const [[u]] = await pool.query('SELECT real_name FROM sys_user WHERE id = ?', [business.create_by]);
    applicant = u?.real_name || null;
  }

  const records = await getApprovalDetail(pool, businessType, businessId);

  // 关联客户：仅 SELECT，绝不 UPDATE/DELETE（PRD R-11 只读约束）
  let customer = null;
  if (business.customer_id) {
    [[customer]] = await pool.query(
      `SELECT c.id, c.company_name, c.level, c.source, pc.name as contact_name, pc.phone
       FROM crm_customer c
       LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
       WHERE c.id = ?`,
      [business.customer_id]
    );
  }

  return {
    business_type: businessType,
    business_id: businessId,
    applicant,
    applicant_id: business.create_by,
    amount: business.amount,
    discount: business.discount,
    customer,
    history: records
  };
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
      } else if (nextStep.approver_type === 'role') {
        // 同 submit：role 步骤的 approver_id 是角色 id，须解析为在职用户，禁止当 userId 用
        nextApproverId = await resolveRoleApproverId(conn, nextStep);
      }
      await conn.query('INSERT INTO crm_approval_record (workflow_id, business_type, business_id, step_id, step_order, approver_id) VALUES (?, ?, ?, ?, ?, ?)',
        [record.workflow_id, record.business_type, record.business_id, nextStep.id, nextStep.step_order, nextApproverId]);
    } else {
      // 合同审批通过：将「待执行(1)」自动流转到「执行中(2)」（修复 #3 卡待执行，与 simpleApproveContract 一致）
      // 仅 contract 业务类型做此流转；其余业务(quote/purchase/discount)状态模型不同，保持原逻辑
      const finalSet = record.business_type === 'contract'
        ? 'approval_status = 2, status = CASE WHEN status = 1 THEN 2 ELSE status END'
        : 'approval_status = 2';
      await conn.query(`UPDATE ${validateTable(tableName)} SET ${finalSet} WHERE id = ?`, [record.business_id]);
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
  if (!tableName) throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '不支持的业务类型');

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
    const [[biz]] = await pool.query('SELECT customer_id FROM crm_quote WHERE id = ? AND deleted_at IS NULL', [businessId]);
    customerId = biz?.customer_id;
  } else if (businessType === 'contract') {
    const [[biz]] = await pool.query('SELECT customer_id FROM crm_contract WHERE id = ? AND deleted_at IS NULL', [businessId]);
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
  // [安全] types 为代码内硬编码常量，非用户输入；表名在 BUSINESS_TABLE_MAP 白名单内
  const types = [
    { type: 'quote', table: 'crm_quote', no: 'quote_no' },
    { type: 'contract', table: 'crm_contract', no: 'contract_no' },
    { type: 'purchase', table: 'crm_purchase_order', no: 'order_no' }
  ];
  for (const t of types) {
    // [安全] 表名/业务类型/字段名均来自上方常量数组，非用户输入；仅 userId 参数化
    validateTable(t.table);
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
// [安全] 逐条独立事务 + FOR UPDATE 锁行，防止 TOCTOU 竞态；
//        role 类型步骤用 resolveRoleApproverId 解析，与单条 approveRecord 保持一致

async function batchApprove(pool, ids, remark, userId, manageAll) {
  let success = 0, failed = 0;
  for (const id of ids) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // [安全] 在事务内用 conn + FOR UPDATE 读取，防止并发竞态
      const [records] = await conn.query(
        'SELECT id, workflow_id, business_type, business_id, step_id, step_order, approver_id, status FROM crm_approval_record WHERE id = ? AND status = "pending" FOR UPDATE',
        [id]
      );
      if (records.length === 0) { await conn.rollback(); failed++; continue; }
      const record = records[0];
      if (record.approver_id !== userId && !manageAll) { await conn.rollback(); failed++; continue; }

      await conn.query('UPDATE crm_approval_record SET status = "approved", remark = ? WHERE id = ?', [remark || null, id]);

      // [安全] 事务内查询 nextStep，用 conn 而非 pool
      const [nextSteps] = await conn.query(
        'SELECT id, workflow_id, step_order, step_name, approver_type, approver_id, is_required FROM crm_approval_step WHERE workflow_id = ? AND step_order > ? ORDER BY step_order LIMIT 1',
        [record.workflow_id, record.step_order]
      );
      const tableName = BUSINESS_TABLE_MAP[record.business_type];

      if (nextSteps.length > 0) {
        const nextStep = nextSteps[0];
        let nextApproverId = nextStep.approver_id;
        if (nextStep.approver_type === 'manager') {
          const [user] = await conn.query('SELECT manager_id FROM sys_user WHERE id = ?', [record.approver_id]);
          if (user.length > 0 && user[0].manager_id) nextApproverId = user[0].manager_id;
        } else if (nextStep.approver_type === 'role') {
          // [修复] role 步骤的 approver_id 是角色 id，须解析为在职用户（同单条 approveRecord L402-404）
          nextApproverId = await resolveRoleApproverId(conn, nextStep);
        }
        await conn.query('INSERT INTO crm_approval_record (workflow_id, business_type, business_id, step_id, step_order, approver_id) VALUES (?, ?, ?, ?, ?, ?)',
          [record.workflow_id, record.business_type, record.business_id, nextStep.id, nextStep.step_order, nextApproverId]);
      } else {
        // 合同审批通过：将「待执行(1)」自动流转到「执行中(2)」（修复 #3 卡待执行，与 simpleApproveContract 一致）
      // 仅 contract 业务类型做此流转；其余业务(quote/purchase/discount)状态模型不同，保持原逻辑
      const finalSet = record.business_type === 'contract'
        ? 'approval_status = 2, status = CASE WHEN status = 1 THEN 2 ELSE status END'
        : 'approval_status = 2';
      await conn.query(`UPDATE ${validateTable(tableName)} SET ${finalSet} WHERE id = ?`, [record.business_id]);
      }
      await conn.commit(); success++;
    } catch (e) { try { await conn.rollback(); } catch (_) { /* 已回滚则忽略 */ } failed++; } finally { conn.release(); }
  }
  return { success, failed };
}

async function batchReject(pool, ids, remark, userId, manageAll) {
  let success = 0, failed = 0;
  for (const id of ids) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // [安全] 在事务内用 conn + FOR UPDATE 读取，防止并发竞态
      const [records] = await conn.query(
        'SELECT id, workflow_id, business_type, business_id, step_id, step_order, approver_id, status FROM crm_approval_record WHERE id = ? AND status = "pending" FOR UPDATE',
        [id]
      );
      if (records.length === 0) { await conn.rollback(); failed++; continue; }
      const record = records[0];
      if (record.approver_id !== userId && !manageAll) { await conn.rollback(); failed++; continue; }

      await conn.query('UPDATE crm_approval_record SET status = "rejected", remark = ? WHERE id = ?', [remark || null, id]);
      const tableName = BUSINESS_TABLE_MAP[record.business_type];
      await conn.query(`UPDATE ${validateTable(tableName)} SET approval_status = 3 WHERE id = ?`, [record.business_id]);
      await conn.commit(); success++;
    } catch (e) { try { await conn.rollback(); } catch (_) { /* 已回滚则忽略 */ } failed++; } finally { conn.release(); }
  }
  return { success, failed };
}

// ============ 合同简单审批（非工作流） ============

async function simpleApproveContract(pool, id, approval_status, approval_remark, userId) {
  const [rows] = await pool.query('SELECT id FROM crm_contract WHERE id = ? AND deleted_at IS NULL', [id]);
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '合同不存在');
  }

  // 审批通过(approval_status=2)时，将合同从「待执行(1)」自动流转到「执行中(2)」，
  // 解决审批通过后合同仍停留在「待执行」导致业务卡住的问题（#3 P2）。
  // 详见 docs/contract-status-definition.md §6（审批通过 → 1→2）。
  // 仅在当前为「待执行(1)」时流转；终态(3/4)或已「执行中(2)」保持不变。
  // 拒绝(approval_status=3)不改 status，合同维持「待执行」，与流转表一致。
  await pool.query(
    `UPDATE crm_contract
       SET approval_status = ?,
           approver_id = ?,
           approval_remark = ?,
           status = CASE WHEN ? = 2 AND status = 1 THEN 2 ELSE status END
     WHERE id = ? AND deleted_at IS NULL`,
    [approval_status, userId, approval_remark || null, approval_status, id]
  );

  await notificationService.dismissByBusiness(pool, 'contract', id);
}

module.exports = {
  BUSINESS_TABLE_MAP,
  listWorkflows, createWorkflow, updateWorkflow, deleteWorkflow,
  submitApproval, approveRecord, rejectRecord, withdrawApproval,
  getApprovalDetail, getDetailWithHistory, getMyPending, getMySubmitted,
  batchApprove, batchReject,
  simpleApproveContract,
  // 阈值→审批人矩阵（规则配置）
  listApprovalRules, createApprovalRule, updateApprovalRule, deleteApprovalRule,
  resolveThresholdApprover,
  // 工作流「步骤」role 类型审批人解析（角色 id → 在职用户）
  resolveRoleApproverId,
  // 转交
  transferApproval,
  // 已办结
  getMyCompleted,
  // 详情（申请人/金额/折扣率/关联客户只读卡片/审批历史时间线）
  getApprovalDetailFull
};
