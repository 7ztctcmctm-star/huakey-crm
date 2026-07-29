/**
 * 采购申请服务层
 */

const ROLES = require('../config/roles');
const { ADMIN_ROLE_CODES } = ROLES;

function isAdmin(user) {
  return user.manageAll || ADMIN_ROLE_CODES.has(user.roleCode);
}

/**
 * 生成采购申请编号：PR + YYYYMMDD + 3位序号
 */
async function generateRequestNo(pool) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PR${dateStr}`;
  const [[row]] = await pool.query(
    "SELECT COUNT(*) as cnt FROM crm_purchase_request WHERE request_no LIKE ?",
    [`${prefix}%`]
  );
  const seq = String((parseInt(row.cnt) || 0) + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

/**
 * 创建采购申请
 */
async function createRequest(pool, data, userId) {
  const { title, dept_id, expected_amount, reason } = data;
  const requestNo = await generateRequestNo(pool);

  const [result] = await pool.query(
    `INSERT INTO crm_purchase_request
     (title, request_no, dept_id, applicant_id, expected_amount, reason, status)
     VALUES (?, ?, ?, ?, ?, ?, 'draft')`,
    [title, requestNo, dept_id || null, userId, expected_amount || 0, reason || null]
  );

  return { id: result.insertId, request_no: requestNo };
}

/**
 * 查询采购申请列表
 */
async function listRequests(pool, params, user) {
  const { page = 1, pageSize = 20, status, applicant_id, keyword } = params;
  const safePageSize = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
  const offset = (Math.max(1, parseInt(page) || 1) - 1) * safePageSize;

  let where = '1=1';
  const queryParams = [];

  // 非管理员只能看自己的
  if (!isAdmin(user)) {
    where += ' AND r.applicant_id = ?';
    queryParams.push(user.userId);
  } else if (applicant_id) {
    where += ' AND r.applicant_id = ?';
    queryParams.push(applicant_id);
  }

  if (status) {
    where += ' AND r.status = ?';
    queryParams.push(status);
  }

  if (keyword) {
    where += ' AND (r.title LIKE ? OR r.request_no LIKE ?)';
    queryParams.push(`%${keyword}%`, `%${keyword}%`);
  }

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_purchase_request r WHERE ${where}`,
    queryParams
  );

  const [rows] = await pool.query(
    `SELECT r.id, r.title, r.request_no, r.dept_id, r.applicant_id, r.expected_amount, r.reason, r.status,
            r.approved_by, r.approved_at, r.reject_reason, r.created_at, r.updated_at,
            u.real_name as applicant_name, d.name as dept_name,
            approver.real_name as approved_by_name
     FROM crm_purchase_request r
     LEFT JOIN sys_user u ON r.applicant_id = u.id
     LEFT JOIN sys_dept d ON r.dept_id = d.id
     LEFT JOIN sys_user approver ON r.approved_by = approver.id
     WHERE ${where}
     ORDER BY r.created_at DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, safePageSize, offset]
  );

  return { list: rows, total, page: parseInt(page), pageSize: safePageSize };
}

/**
 * 查询单个采购申请
 */
async function getRequest(pool, id, user) {
  const [rows] = await pool.query(
    `SELECT r.id, r.title, r.request_no, r.dept_id, r.applicant_id, r.expected_amount, r.reason, r.status,
            r.approved_by, r.approved_at, r.reject_reason, r.created_at, r.updated_at,
            u.real_name as applicant_name, d.name as dept_name,
            approver.real_name as approved_by_name
     FROM crm_purchase_request r
     LEFT JOIN sys_user u ON r.applicant_id = u.id
     LEFT JOIN sys_dept d ON r.dept_id = d.id
     LEFT JOIN sys_user approver ON r.approved_by = approver.id
     WHERE r.id = ?`,
    [id]
  );

  if (rows.length === 0) return null;

  const request = rows[0];
  if (!isAdmin(user) && request.applicant_id !== user.userId) {
    return null;
  }

  return request;
}

/**
 * 提交采购申请
 */
async function submitRequest(pool, id, user) {
  const [rows] = await pool.query(
    'SELECT applicant_id, status FROM crm_purchase_request WHERE id = ?',
    [id]
  );

  if (rows.length === 0) {
    const err = new Error('申请不存在');
    err.statusCode = 404;
    throw err;
  }

  const request = rows[0];
  if (request.applicant_id !== user.userId) {
    const err = new Error('只能提交自己的申请');
    err.statusCode = 403;
    throw err;
  }

  if (request.status !== 'draft') {
    const err = new Error('只有草稿状态可申请提交');
    err.statusCode = 400;
    throw err;
  }

  await pool.query(
    "UPDATE crm_purchase_request SET status = 'pending' WHERE id = ?",
    [id]
  );

  return true;
}

/**
 * 审批通过
 */
async function approveRequest(pool, id, user) {
  if (!isAdmin(user)) {
    const err = new Error('无权审批');
    err.statusCode = 403;
    throw err;
  }

  const [rows] = await pool.query(
    'SELECT status FROM crm_purchase_request WHERE id = ?',
    [id]
  );

  if (rows.length === 0) {
    const err = new Error('申请不存在');
    err.statusCode = 404;
    throw err;
  }

  if (rows[0].status !== 'pending') {
    const err = new Error('只有待审批状态可通过');
    err.statusCode = 400;
    throw err;
  }

  await pool.query(
    `UPDATE crm_purchase_request
     SET status = 'approved', approved_by = ?, approved_at = NOW()
     WHERE id = ?`,
    [user.userId, id]
  );

  return true;
}

/**
 * 审批驳回
 */
async function rejectRequest(pool, id, user, reason) {
  if (!isAdmin(user)) {
    const err = new Error('无权审批');
    err.statusCode = 403;
    throw err;
  }

  const [rows] = await pool.query(
    'SELECT status FROM crm_purchase_request WHERE id = ?',
    [id]
  );

  if (rows.length === 0) {
    const err = new Error('申请不存在');
    err.statusCode = 404;
    throw err;
  }

  if (rows[0].status !== 'pending') {
    const err = new Error('只有待审批状态可驳回');
    err.statusCode = 400;
    throw err;
  }

  await pool.query(
    `UPDATE crm_purchase_request
     SET status = 'rejected', reject_reason = ?, approved_by = ?
     WHERE id = ?`,
    [reason || null, user.userId, id]
  );

  return true;
}

/**
 * 撤销采购申请
 */
async function cancelRequest(pool, id, user, reason) {
  const [rows] = await pool.query(
    'SELECT applicant_id, status FROM crm_purchase_request WHERE id = ?',
    [id]
  );

  if (rows.length === 0) {
    const err = new Error('申请不存在');
    err.statusCode = 404;
    throw err;
  }

  const request = rows[0];
  if (request.applicant_id !== user.userId) {
    const err = new Error('只能撤销自己的申请');
    err.statusCode = 403;
    throw err;
  }

  if (!['draft', 'pending'].includes(request.status)) {
    const err = new Error('只有草稿或待审批状态可撤销');
    err.statusCode = 400;
    throw err;
  }

  await pool.query(
    `UPDATE crm_purchase_request
     SET status = 'cancelled', reject_reason = ?
     WHERE id = ?`,
    [reason || null, id]
  );

  return true;
}

module.exports = {
  generateRequestNo,
  createRequest,
  listRequests,
  getRequest,
  submitRequest,
  approveRequest,
  rejectRequest,
  cancelRequest
};
