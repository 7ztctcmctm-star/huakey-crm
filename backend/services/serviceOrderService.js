/**
 * 服务工单服务层
 * 从 routes/service.js 提取的业务逻辑，供路由层复用
 */

const ROLES = require('../config/roles');
const sseManager = require('../utils/sseManager');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');
const { scopeFor } = require('../utils/dataScope');

/**
 * 构建售后工单的数据权限子句 —— 统一走 utils/dataScope 的标准实现
 *
 * 背景（P0-2）：原 buildServicePermissionClause 是自造轮子，有两个致命缺陷：
 *   ① dept / dept_and_sub 分支往 SQL 里塞了 `?` 占位符，但**无人回填参数**
 *      —— 调用方 listServiceOrders 的 queryParams 从空数组开始拼，占位符会错位
 *      绑定到 status/type/LIMIT 上，导致过滤失效或直接报参数个数不匹配；
 *   ② dept_and_sub 直接按 dept_id 精确匹配，**没有递归子部门**，与标准语义不符；
 *   ③ self 分支用 pool.escape 拼字面量，绕开了参数化查询。
 *
 * 现改为调用标准 scopeFor（内部即 buildDataPermissionWhere）：
 *   all / dept / dept_and_sub(递归) / custom / self，参数一律参数化返回。
 *
 * ⚠️ 工单的「归属」是**双列**语义：`create_by`（创建人）与 `assignee_id`（受理工程师）。
 * 这与本模块行级鉴权 canManageService() 保持一致（create_by 或 assignee_id 命中即可），
 * 也沿用原自造实现的既有语义，避免「工程师看不到派给自己的工单」这类回归。
 * 因此这里对两列各求一次标准范围，再 OR 合并（all 除外，直接 1=1 短路）。
 *
 * @param {object|null} dataPermission - checkDataPermission 注入的 req.dataPermission
 * @param {string} tableAlias - SQL 表别名（须与查询中的别名一致，工单列表为 so）
 * @returns {Promise<{clause: string, params: Array}>}
 */
async function buildServiceScope(dataPermission, tableAlias = 'so') {
  if (!dataPermission) return { clause: '1=1', params: [] };

  const byCreator = await scopeFor(dataPermission, 'create_by', tableAlias);
  if (dataPermission.type === 'all') return byCreator;

  const byAssignee = await scopeFor(dataPermission, 'assignee_id', tableAlias);
  if (!byAssignee.clause || byAssignee.clause === '1=1') return byCreator;

  return {
    clause: `(${byCreator.clause} OR ${byAssignee.clause})`,
    params: [...byCreator.params, ...byAssignee.params]
  };
}

/**
 * 检查用户是否有权操作某工单
 * @param {object} pool
 * @param {object} user - { manageAll, roleId, userId }
 * @param {object} serviceOrder - { create_by, assignee_id }
 * @returns {boolean}
 */
async function canManageService(pool, user, serviceOrder) {
  // [R-14] 权限判定一律走 roleCode，禁止硬编码 roleId
  const { BOSS, MANAGER, SALES } = ROLES.ROLE_CODES;
  if (user.manageAll || user.roleCode === BOSS || user.roleCode === MANAGER) {
    return true;
  }
  if (user.roleCode === SALES) {
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
 * @param {{clause: string, params: Array}} scope - buildServiceScope() 的返回值
 * @returns {{ list: Array, total: number }}
 */
async function listServiceOrders(pool, params, scope) {
  const { page = 1, pageSize = 10, status, type, priority, keyword, assignee_id, created_today, is_timeout } = params;
  const safePageSize = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
  const offset = (Math.max(1, parseInt(page) || 1) - 1) * safePageSize;

  const { clause: permissionClause = '1=1', params: permParams = [] } = scope || {};

  // 参数顺序必须与 SQL 中占位符出现顺序一致：权限参数在前，过滤条件在后，最后是 LIMIT
  const queryParams = [...permParams];
  const filters = [];

  if (status !== undefined && status !== '') {
    filters.push(' AND so.status = ?');
    queryParams.push(status);
  }
  if (type !== undefined && type !== '') {
    filters.push(' AND so.type = ?');
    queryParams.push(type);
  }
  if (priority !== undefined && priority !== '') {
    filters.push(' AND so.priority = ?');
    queryParams.push(priority);
  }
  if (keyword) {
    filters.push(' AND (so.title LIKE ? OR so.order_no LIKE ? OR cu.company_name LIKE ?)');
    queryParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (assignee_id) {
    filters.push(' AND so.assignee_id = ?');
    queryParams.push(assignee_id);
  }
  if (created_today) {
    filters.push(' AND DATE(so.create_time) = CURRENT_DATE');
  }
  if (is_timeout) {
    filters.push(` AND so.status IN (1, 2) AND (
      (so.priority = 1 AND so.create_time < NOW() - INTERVAL 2 HOUR)
      OR (so.priority = 2 AND so.create_time < NOW() - INTERVAL 4 HOUR)
      OR (so.priority = 3 AND so.create_time < NOW() - INTERVAL 8 HOUR)
      OR (so.priority = 4 AND so.create_time < NOW() - INTERVAL 24 HOUR)
    )`);
  }

  // FROM / WHERE 抽成公共片段：count 与 list 共用，避免在整条 list SQL 上做正则替换
  // （权限子句自带 `FROM sys_user ...`，原 `replace(/SELECT[\s\S]*FROM/)` 是贪婪匹配，
  //   会一路吃到权限子句里的 FROM，把 count 查询截成 `... FROM sys_user` —— 直接报错）
  const fromWhere = `
    FROM crm_service_order so
    LEFT JOIN crm_customer cu ON so.customer_id = cu.id
    LEFT JOIN crm_contact pc ON pc.customer_id = cu.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
    LEFT JOIN crm_contract c ON so.contract_id = c.id
    LEFT JOIN sys_user u1 ON so.assignee_id = u1.id
    LEFT JOIN sys_user u2 ON so.create_by = u2.id
    WHERE ${permissionClause} AND so.deleted_at IS NULL${filters.join('')}`;

  const listSql = `
    SELECT so.id, so.order_no, so.customer_id, so.contract_id, so.type, so.title, so.description, so.status, so.priority,
           so.assignee_id, so.finish_time, so.finish_desc, so.satisfaction, so.create_by, so.create_time, so.deleted_at,
           cu.company_name as customer_name, pc.name as customer_contact,
           pc.phone as customer_phone, c.contract_no,
           u1.real_name as assignee_name, u2.real_name as create_by_name,
           CASE WHEN so.status IN (1, 2) AND so.priority = 1 AND NOW() - INTERVAL 2 HOUR > so.create_time THEN 1
                WHEN so.status IN (1, 2) AND so.priority = 2 AND NOW() - INTERVAL 4 HOUR > so.create_time THEN 1
                WHEN so.status IN (1, 2) AND so.priority = 3 AND NOW() - INTERVAL 8 HOUR > so.create_time THEN 1
                WHEN so.status IN (1, 2) AND so.priority = 4 AND NOW() - INTERVAL 24 HOUR > so.create_time THEN 1
                ELSE 0 END as is_timeout
    ${fromWhere}
    ORDER BY so.create_time DESC LIMIT ?, ?`;

  const countSql = `SELECT COUNT(*) as total ${fromWhere}`;

  const [rows] = await pool.query(listSql, [...queryParams, offset, safePageSize]);
  const [countResult] = await pool.query(countSql, queryParams);

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
    SELECT so.id, so.order_no, so.customer_id, so.contract_id, so.type, so.title, so.description, so.status, so.priority,
           so.assignee_id, so.finish_time, so.finish_desc, so.satisfaction, so.create_by, so.create_time, so.deleted_at,
           cu.company_name as customer_name, pc.name as customer_contact,
           pc.phone as customer_phone, cu.address as customer_address,
           c.contract_no, c.amount as contract_amount,
           u1.real_name as assignee_name, u2.real_name as create_by_name
    FROM crm_service_order so
    LEFT JOIN crm_customer cu ON so.customer_id = cu.id
    LEFT JOIN crm_contact pc ON pc.customer_id = cu.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
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
    `SELECT sc.id, sc.customer_id, sc.contact_id, sc.platform, sc.direction, sc.content, sc.attachment_url, sc.message_time, sc.create_by, sc.create_time, sc.deleted_at,
            ct.name as contact_name
     FROM crm_social_contact sc
     LEFT JOIN crm_contact ct ON sc.contact_id = ct.id
     WHERE sc.customer_id = ? AND sc.deleted_at IS NULL
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
      'SELECT id, status FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
      [customer_id]
    );
    if (customerCheck.length === 0) {
      throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, '客户不存在')
    }
    if (customerCheck[0].status !== 'signed') {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, '只能为已签约客户创建售后工单')
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
    throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '工单不存在')
  }
  if (!(await canManageService(pool, user, orders[0]))) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权修改该工单')
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
    throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '工单不存在')
  }
  if (!(await canManageService(pool, user, orders[0]))) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权删除该工单')
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
    throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '工单不存在')
  }
  if (!(await canManageService(pool, user, orders[0]))) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权操作该工单')
  }

  await pool.query(
    'UPDATE crm_service_order SET status = 2, assignee_id = ? WHERE id = ?',
    [assigneeId, id]
  );

  // 写入通知
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
 * @param {object} user - { userId, roleCode, manageAll }
 * @returns {{ count: number }}
 */
async function batchAssignServiceOrders(pool, ids, assigneeId, user) {
  // 逐条鉴权：批量接口不能因为是「批量」就跳过行级校验。
  // 原实现只凭 service:edit 功能权限就按 id 直接 UPDATE，任何持该码的用户都能
  // 靠猜 id 把**别人**的工单指派出去 —— 与 /assign 单条接口双重标准。
  // 这里与单条接口统一走 canManageService()，无权操作的 id 直接剔除而非静默放行。
  const allowed = [];
  for (const id of ids) {
    const [orders] = await pool.query(
      'SELECT id, create_by, assignee_id FROM crm_service_order WHERE id = ? AND deleted_at IS NULL', [id]
    );
    if (orders.length === 0) continue;
    if (await canManageService(pool, user, orders[0])) allowed.push(id);
  }
  if (allowed.length === 0) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权操作选中的工单')
  }

  const placeholders = allowed.map(() => '?').join(',');
  await pool.query(
    `UPDATE crm_service_order SET status = 2, assignee_id = ? WHERE id IN (${placeholders}) AND deleted_at IS NULL AND status = 1`,
    [assigneeId, ...allowed]
  );

  // 批量写入通知（去重：只写一条汇总通知）
  const [orders] = await pool.query(
    `SELECT order_no, title FROM crm_service_order WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
    allowed
  );
  const summary = orders.map(o => `#${o.order_no}`).join('、');
  await pool.query(
    `INSERT INTO crm_notification (type, title, content, business_type, business_id, from_user_id, to_user_id)
     VALUES ('service_assigned', '新工单分配', ?, 'service_order', ?, ?, ?)`,
    [`${allowed.length}个工单 ${summary} 已批量分配给您，请及时处理`, allowed[0], user.userId, assigneeId]
  );
  sseManager.send(assigneeId, { type: 'notification', action: 'refresh' });

  return { count: allowed.length };
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
    throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '工单不存在')
  }
  if (!(await canManageService(pool, user, orders[0]))) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权操作该工单')
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
    throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '工单不存在')
  }
  if (!(await canManageService(pool, user, orders[0]))) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权操作该工单')
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
    throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '工单不存在')
  }
  if (!(await canManageService(pool, user, orders[0]))) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权操作该工单')
  }

  await pool.query(
    'UPDATE crm_service_order SET status = 5, satisfaction = ? WHERE id = ?',
    [satisfaction, id]
  );
}

module.exports = {
  buildServiceScope,
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
