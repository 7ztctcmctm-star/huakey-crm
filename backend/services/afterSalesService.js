/**
 * 售后工单服务层
 * 从 routes/service.js 提取的业务逻辑，供路由层复用
 * 注意：文件名 afterSalesService 避免与"服务层"概念混淆
 */

const ROLES = require('../config/roles');
const sseManager = require('../utils/sseManager');

/**
 * 构建售后工单数据权限SQL
 * @param {object} pool
 * @param {object} dataPermission - { type, userId }
 * @param {string} tableAlias
 * @returns {string} permission clause
 */
async function buildServicePermissionClause(pool, dataPermission, tableAlias = 'so') {
  if (!dataPermission) return '1=1';
  const { type, userId } = dataPermission;
  if (type === 'all') {
    return '1=1';
  }
  if (type === 'dept' || type === 'dept_and_sub') {
    const [deptRows] = await pool.query('SELECT dept_id FROM sys_user WHERE id = ?', [userId]);
    const deptId = deptRows[0]?.dept_id;
    if (deptId) {
      const [deptUsers] = await pool.query('SELECT id FROM sys_user WHERE dept_id = ?', [deptId]);
      const ids = deptUsers.map(u => u.id);
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        return `(${tableAlias}.create_by IN (${placeholders}) OR ${tableAlias}.assignee_id IN (${placeholders}))`;
      }
    }
    return `(${tableAlias}.create_by = ? OR ${tableAlias}.assignee_id = ?)`;
  }
  return `(${tableAlias}.create_by = ${pool.escape(userId)} OR ${tableAlias}.assignee_id = ${pool.escape(userId)})`;
}

/**
 * 检查用户是否有权操作某工单
 * @param {object} pool
 * @param {object} user - { manageAll, roleId, userId }
 * @param {object} serviceOrder - { create_by, assignee_id }
 * @returns {boolean}
 */
async function canManageService(pool, user, serviceOrder) {
  if (user.manageAll || user.roleId === ROLES.ADMIN || user.roleId === ROLES.MANAGER) {
    return true;
  }
  if (user.roleId === ROLES.SALES) {
    const [users] = await pool.query(
      'SELECT dept_id FROM sys_user WHERE id = ?',
      [user.userId]
    );
    const deptId = users.length > 0 ? users[0].dept_id : null;
    if (deptId) {
      const [createByUser] = await pool.query(
        'SELECT dept_id FROM sys_user WHERE id = ?',
        [serviceOrder.create_by]
      );
      const [assigneeUser] = serviceOrder.assignee_id ? await pool.query(
        'SELECT dept_id FROM sys_user WHERE id = ?',
        [serviceOrder.assignee_id]
      ) : [[]];
      if (
        (createByUser.length > 0 && createByUser[0].dept_id === deptId) ||
        (assigneeUser.length > 0 && assigneeUser[0].dept_id === deptId)
      ) {
        return true;
      }
    }
  }
  return serviceOrder.create_by === user.userId || serviceOrder.assignee_id === user.userId;
}

/**
 * 获取工单列表
 * @param {object} pool
 * @param {object} params - { page, pageSize, status, type, priority, keyword, assignee_id, created_today, is_timeout }
 * @param {string} permissionClause
 * @returns {{ list: Array, total: number }}
 */
async function listServiceOrders(pool, params, permissionClause) {
  const { page = 1, pageSize = 10, status, type, priority, keyword, assignee_id, created_today, is_timeout } = params;
  const safePageSize = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
  const offset = (Math.max(1, parseInt(page) || 1) - 1) * safePageSize;

  let sql = `
    SELECT so.*, cu.company_name as customer_name, cu.contact_name as customer_contact,
           cu.phone as customer_phone, c.contract_no,
           u1.real_name as assignee_name, u2.real_name as create_by_name,
           CASE WHEN so.status IN (1, 2) AND so.priority = 1 AND NOW() - INTERVAL 2 HOUR > so.create_time THEN 1
                WHEN so.status IN (1, 2) AND so.priority = 2 AND NOW() - INTERVAL 4 HOUR > so.create_time THEN 1
                ELSE 0 END as is_timeout
    FROM crm_service_order so
    LEFT JOIN crm_customer cu ON so.customer_id = cu.id
    LEFT JOIN crm_contract c ON so.contract_id = c.id
    LEFT JOIN sys_user u1 ON so.assignee_id = u1.id
    LEFT JOIN sys_user u2 ON so.create_by = u2.id
    WHERE ${permissionClause} AND so.deleted_at IS NULL
  `;

  const queryParams = [];

  if (status !== undefined && status !== '') {
    sql += ' AND so.status = ?';
    queryParams.push(status);
  }
  if (type !== undefined && type !== '') {
    sql += ' AND so.type = ?';
    queryParams.push(type);
  }
  if (priority !== undefined && priority !== '') {
    sql += ' AND so.priority = ?';
    queryParams.push(priority);
  }
  if (keyword) {
    sql += ' AND (so.title LIKE ? OR so.order_no LIKE ? OR cu.company_name LIKE ?)';
    queryParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (assignee_id) {
    sql += ' AND so.assignee_id = ?';
    queryParams.push(assignee_id);
  }
  if (created_today) {
    sql += ' AND DATE(so.create_time) = CURRENT_DATE';
  }
  if (is_timeout) {
    sql += ` AND so.status IN (1, 2) AND (
      (so.priority = 1 AND so.create_time < NOW() - INTERVAL 2 HOUR)
      OR (so.priority = 2 AND so.create_time < NOW() - INTERVAL 4 HOUR)
    )`;
  }

  sql += ' ORDER BY so.create_time DESC LIMIT ?, ?';
  queryParams.push(offset, safePageSize);
  const [rows] = await pool.query(sql, queryParams);

  const countSql = sql.replace(/SELECT[\s\S]*FROM/, 'SELECT COUNT(*) as total FROM').replace(/ORDER BY[\s\S]*/, '');
  const [countResult] = await pool.query(countSql, queryParams.slice(0, -2));

  return { list: rows, total: countResult[0].total };
}

/**
 * 获取工单详情
 * @param {object} pool
 * @param {number} id
 * @returns {object|null} 工单详情（含附件、社媒记录）
 */
async function getServiceOrderDetail(pool, id) {
  const [rows] = await pool.query(`
    SELECT so.*, cu.company_name as customer_name, cu.contact_name as customer_contact,
           cu.phone as customer_phone, cu.address as customer_address,
           c.contract_no, c.amount as contract_amount,
           u1.real_name as assignee_name, u2.real_name as create_by_name
    FROM crm_service_order so
    LEFT JOIN crm_customer cu ON so.customer_id = cu.id
    LEFT JOIN crm_contract c ON so.contract_id = c.id
    LEFT JOIN sys_user u1 ON so.assignee_id = u1.id
    LEFT JOIN sys_user u2 ON so.create_by = u2.id
    WHERE so.id = ? AND so.deleted_at IS NULL
  `, [id]);

  if (rows.length === 0) return null;

  const order = rows[0];

  // 查询附件
  const [attachments] = await pool.query(
    'SELECT id, file_name, file_path, file_size, file_type, create_time FROM crm_attachment WHERE business_type = ? AND business_id = ? ORDER BY create_time DESC',
    ['service_order', id]
  );

  // 查询社媒沟通记录
  const [socialRecords] = await pool.query(
    `SELECT sc.*, ct.name as contact_name
     FROM crm_social_contact sc
     LEFT JOIN crm_contact ct ON sc.contact_id = ct.id
     WHERE sc.customer_id = ?
     ORDER BY sc.message_time DESC LIMIT 20`, [order.customer_id]
  );

  return { ...order, attachments, social_records: socialRecords || [] };
}

/**
 * 创建工单（事务）
 * @param {object} pool
 * @param {object} params - { customer_id, contract_id, type, title, description, priority, attachment_ids }
 * @param {number} userId
 * @returns {{ id: number, order_no: string }}
 */
async function createServiceOrder(pool, params, userId) {
  const { customer_id, contract_id, type, title, description, priority, attachment_ids } = params;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 校验客户必须是正式客户（status=2）
    const [customerCheck] = await connection.query(
      'SELECT id, status FROM crm_customer WHERE id = ? AND status != 0',
      [customer_id]
    );
    if (customerCheck.length === 0) {
      const err = new Error('客户不存在');
      err.code = 404;
      throw err;
    }
    if (customerCheck[0].status !== 2) {
      const err = new Error('只能为正式客户创建售后工单');
      err.code = 400;
      throw err;
    }

    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const [count] = await connection.query('SELECT COUNT(*) as cnt FROM crm_service_order WHERE order_no LIKE ? FOR UPDATE', [`SRV-${dateStr}-%`]);
    const seq = String(count[0].cnt + 1).padStart(3, '0');
    const orderNo = `SRV-${dateStr}-${seq}`;

    const [result] = await connection.query(
      'INSERT INTO crm_service_order (order_no, customer_id, contract_id, type, title, description, priority, create_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [orderNo, customer_id, contract_id || null, type, title, description, priority || 3, userId]
    );

    // 绑定附件
    if (attachment_ids && attachment_ids.length > 0) {
      await connection.query(
        `UPDATE crm_attachment SET business_type = 'service_order', business_id = ? WHERE id IN (${attachment_ids.map(() => '?').join(',')})`,
        [result.insertId, ...attachment_ids]
      );
    }

    await connection.commit();
    return { id: result.insertId, order_no: orderNo };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 更新工单
 * @param {object} pool
 * @param {object} params - { id, customer_id, contract_id, type, title, description, priority, attachment_ids }
 * @param {object} user
 */
async function updateServiceOrder(pool, params, user) {
  const { id, customer_id, contract_id, type, title, description, priority, attachment_ids } = params;

  const [orders] = await pool.query('SELECT id, create_by, assignee_id FROM crm_service_order WHERE id = ? AND deleted_at IS NULL', [id]);
  if (orders.length === 0) {
    const err = new Error('工单不存在');
    err.code = 404;
    throw err;
  }
  if (!(await canManageService(pool, user, orders[0]))) {
    const err = new Error('无权修改该工单');
    err.code = 403;
    throw err;
  }

  await pool.query(
    'UPDATE crm_service_order SET customer_id = ?, contract_id = ?, type = ?, title = ?, description = ?, priority = ? WHERE id = ?',
    [customer_id, contract_id || null, type, title, description, priority || 3, id]
  );

  if (attachment_ids && attachment_ids.length > 0) {
    await pool.query(
      `UPDATE crm_attachment SET business_type = 'service_order', business_id = ? WHERE id IN (${attachment_ids.map(() => '?').join(',')})`,
      [id, ...attachment_ids]
    );
  }
}

/**
 * 删除工单（软删除）
 * @param {object} pool
 * @param {number} id
 * @param {object} user
 */
async function deleteServiceOrder(pool, id, user) {
  const [orders] = await pool.query('SELECT id, create_by, assignee_id FROM crm_service_order WHERE id = ? AND deleted_at IS NULL', [id]);
  if (orders.length === 0) {
    const err = new Error('工单不存在');
    err.code = 404;
    throw err;
  }
  if (!(await canManageService(pool, user, orders[0]))) {
    const err = new Error('无权删除该工单');
    err.code = 403;
    throw err;
  }

  await pool.query('UPDATE crm_service_order SET deleted_at = NOW() WHERE id = ?', [id]);
}

/**
 * 分配工程师
 * @param {object} pool
 * @param {number} id
 * @param {number} assigneeId
 * @param {object} user
 */
async function assignServiceOrder(pool, id, assigneeId, user) {
  const [orders] = await pool.query('SELECT id, create_by, assignee_id FROM crm_service_order WHERE id = ? AND deleted_at IS NULL', [id]);
  if (orders.length === 0) {
    const err = new Error('工单不存在');
    err.code = 404;
    throw err;
  }
  if (!(await canManageService(pool, user, orders[0]))) {
    const err = new Error('无权操作该工单');
    err.code = 403;
    throw err;
  }

  await pool.query(
    'UPDATE crm_service_order SET status = 2, assignee_id = ? WHERE id = ?',
    [assigneeId, id]
  );

  // 写入通知
  const [assigneeInfo] = await pool.query('SELECT real_name FROM sys_user WHERE id = ?', [assigneeId]);
  const [orderInfo] = await pool.query('SELECT order_no, title FROM crm_service_order WHERE id = ?', [id]);
  await pool.query(
    `INSERT INTO crm_notification (type, title, content, business_type, business_id, from_user_id, to_user_id)
     VALUES ('service_assigned', '新工单分配', ?, 'service_order', ?, ?, ?)`,
    [`新工单 #${orderInfo[0]?.order_no} "${orderInfo[0]?.title}" 已分配给您，请及时处理`, id, user.userId, assigneeId]
  );
  sseManager.send(assigneeId, { type: 'notification', action: 'refresh' });
}

/**
 * 批量分配工程师
 * @param {object} pool
 * @param {Array} ids
 * @param {number} assigneeId
 * @param {number} userId
 * @returns {{ count: number }}
 */
async function batchAssignServiceOrders(pool, ids, assigneeId, userId) {
  const placeholders = ids.map(() => '?').join(',');
  await pool.query(
    `UPDATE crm_service_order SET status = 2, assignee_id = ? WHERE id IN (${placeholders}) AND deleted_at IS NULL AND status = 1`,
    [assigneeId, ...ids]
  );

  // 批量写入通知（去重：只写一条汇总通知）
  const [orders] = await pool.query(
    `SELECT order_no, title FROM crm_service_order WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
    ids
  );
  const summary = orders.map(o => `#${o.order_no}`).join('、');
  await pool.query(
    `INSERT INTO crm_notification (type, title, content, business_type, business_id, from_user_id, to_user_id)
     VALUES ('service_assigned', '新工单分配', ?, 'service_order', ?, ?, ?)`,
    [`${ids.length}个工单 ${summary} 已批量分配给您，请及时处理`, ids[0], userId, assigneeId]
  );
  sseManager.send(assigneeId, { type: 'notification', action: 'refresh' });

  return { count: ids.length };
}

/**
 * 开始处理工单
 * @param {object} pool
 * @param {number} id
 * @param {object} user
 */
async function startServiceOrder(pool, id, user) {
  const [orders] = await pool.query('SELECT id, create_by, assignee_id FROM crm_service_order WHERE id = ? AND deleted_at IS NULL', [id]);
  if (orders.length === 0) {
    const err = new Error('工单不存在');
    err.code = 404;
    throw err;
  }
  if (!(await canManageService(pool, user, orders[0]))) {
    const err = new Error('无权操作该工单');
    err.code = 403;
    throw err;
  }

  await pool.query('UPDATE crm_service_order SET status = 3 WHERE id = ?', [id]);
}

/**
 * 完成处理
 * @param {object} pool
 * @param {number} id
 * @param {string} finishDesc
 * @param {object} user
 */
async function finishServiceOrder(pool, id, finishDesc, user) {
  const [orders] = await pool.query('SELECT id, create_by, assignee_id FROM crm_service_order WHERE id = ? AND deleted_at IS NULL', [id]);
  if (orders.length === 0) {
    const err = new Error('工单不存在');
    err.code = 404;
    throw err;
  }
  if (!(await canManageService(pool, user, orders[0]))) {
    const err = new Error('无权操作该工单');
    err.code = 403;
    throw err;
  }

  await pool.query(
    'UPDATE crm_service_order SET status = 4, finish_desc = ?, finish_time = NOW() WHERE id = ?',
    [finishDesc, id]
  );
}

/**
 * 客户确认（评价）
 * @param {object} pool
 * @param {number} id
 * @param {number} satisfaction - 1-5
 * @param {object} user
 */
async function confirmServiceOrder(pool, id, satisfaction, user) {
  const [orders] = await pool.query('SELECT id, create_by, assignee_id FROM crm_service_order WHERE id = ? AND deleted_at IS NULL', [id]);
  if (orders.length === 0) {
    const err = new Error('工单不存在');
    err.code = 404;
    throw err;
  }
  if (!(await canManageService(pool, user, orders[0]))) {
    const err = new Error('无权操作该工单');
    err.code = 403;
    throw err;
  }

  await pool.query(
    'UPDATE crm_service_order SET status = 5, satisfaction = ? WHERE id = ?',
    [satisfaction, id]
  );
}

module.exports = {
  buildServicePermissionClause,
  canManageService,
  listServiceOrders,
  getServiceOrderDetail,
  createServiceOrder,
  updateServiceOrder,
  deleteServiceOrder,
  assignServiceOrder,
  batchAssignServiceOrders,
  startServiceOrder,
  finishServiceOrder,
  confirmServiceOrder
};
