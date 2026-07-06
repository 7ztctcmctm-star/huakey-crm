/**
 * 客户核心服务层
 * 从 routes/customer/ 提取的业务逻辑，供路由层复用
 */
const { CUSTOMER_STATUS } = require('../constants/customer');
const { paginatedQuery } = require('../utils/pagination');

// 客户来源白名单
const VALID_SOURCES = [
  '展会',
  'Facebook', 'Instagram', 'LinkedIn', '独立站', '其他网络渠道',
  '转介绍',
  '电话',
  '其他'
];

const SOURCE_PARENT_MAP = {
  '网络': ['Facebook', 'Instagram', 'LinkedIn', '独立站', '其他网络渠道']
};

// 排序白名单
const SORT_MAP = {
  'create_time_desc': 'c.create_time DESC',
  'last_follow_time_asc': 'c.last_follow_time IS NULL ASC, c.last_follow_time ASC',
  'last_follow_time_desc': 'c.last_follow_time DESC'
};

// 状态→客户类型/生命周期映射
const CONVERT_MAP = {
  to_prospect: {
    status: CUSTOMER_STATUS.PROSPECT,
    customer_type: 'prospect',
    lifecycle_status: 'nurturing'
  },
  to_customer: {
    status: CUSTOMER_STATUS.CUSTOMER,
    customer_type: 'customer',
    lifecycle_status: 'active'
  },
  to_lost: {
    status: CUSTOMER_STATUS.LOST,
    customer_type: 'customer',
    lifecycle_status: 'lost'
  }
};

// 合法转化路径
const VALID_PATHS = {
  [CUSTOMER_STATUS.LEAD]: ['to_prospect'],
  [CUSTOMER_STATUS.PROSPECT]: ['to_customer'],
  [CUSTOMER_STATUS.CUSTOMER]: ['to_lost'],
  [CUSTOMER_STATUS.LOST]: ['to_prospect']
};

/**
 * 查询客户列表（分页、关键字、多维筛选）
 * @param {object} pool - mysql2/promise 连接池
 * @param {object} params - { page, pageSize, company_name, contact_name, phone, source, level, status, customer_type, lifecycle_status, owner_id, start_date, end_date, overdue, unassigned, overdue_follow, tag_id, sort }
 * @param {object} [permission] - { clause, params } 数据权限片段
 * @returns {{ list: Array, total: number }}
 */
async function listCustomers(pool, params = {}, permission = null) {
  const {
    page = 1,
    pageSize = 10,
    company_name,
    contact_name,
    phone,
    source,
    level,
    status,
    customer_type,
    lifecycle_status,
    owner_id,
    start_date,
    end_date,
    overdue,
    unassigned,
    overdue_follow,
    tag_id,
    sort
  } = params;

  const queryParams = [];

  // 数据权限
  let permissionWhere = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionWhere = permission.clause;
    permParams = permission.params || [];
  }
  queryParams.push(...permParams);

  // 基础 WHERE
  let whereClause;
  if (status !== undefined && status !== null && status !== '') {
    whereClause = `WHERE ${permissionWhere} AND c.status = ?`;
    queryParams.push(parseInt(status));
  } else {
    whereClause = `WHERE ${permissionWhere} AND c.deleted_at IS NULL`;
  }

  // 筛选条件
  if (owner_id) {
    whereClause += ' AND c.owner_id = ?';
    queryParams.push(owner_id);
  }
  if (company_name) {
    whereClause += ' AND c.company_name LIKE ?';
    queryParams.push(`%${company_name}%`);
  }
  if (contact_name) {
    whereClause += ' AND c.contact_name LIKE ?';
    queryParams.push(`%${contact_name}%`);
  }
  if (phone) {
    whereClause += ' AND c.phone LIKE ?';
    queryParams.push(`%${phone}%`);
  }
  if (source) {
    if (SOURCE_PARENT_MAP[source]) {
      const children = SOURCE_PARENT_MAP[source];
      whereClause += ` AND c.source IN (${children.map(() => '?').join(',')})`;
      queryParams.push(...children);
    } else {
      whereClause += ' AND c.source = ?';
      queryParams.push(source);
    }
  }
  if (level) {
    whereClause += ' AND c.level = ?';
    queryParams.push(level);
  }
  if (customer_type) {
    whereClause += ' AND c.customer_type = ?';
    queryParams.push(customer_type);
  }
  if (lifecycle_status) {
    whereClause += ' AND c.lifecycle_status = ?';
    queryParams.push(lifecycle_status);
  }
  if (start_date) {
    whereClause += ' AND c.create_time >= ?';
    queryParams.push(start_date);
  }
  if (end_date) {
    whereClause += ' AND c.create_time < ?';
    queryParams.push(end_date + ' 23:59:59');
  }
  if (overdue) {
    const { getOverdueDays } = require('../utils/config');
    const overdueDays = await getOverdueDays();
    whereClause += ' AND DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) >= ?';
    queryParams.push(overdueDays);
  }
  if (unassigned) {
    whereClause += ' AND (c.owner_id IS NULL OR c.owner_id = 0)';
  }
  if (overdue_follow) {
    whereClause += ' AND c.last_follow_time IS NOT NULL AND DATEDIFF(NOW(), c.last_follow_time) > 7';
  }
  if (tag_id) {
    whereClause += ' AND EXISTS (SELECT 1 FROM crm_customer_tag ct WHERE ct.customer_id = c.id AND ct.tag_id = ?)';
    queryParams.push(tag_id);
  }

  // 排序
  const orderBy = SORT_MAP[sort] || 'c.create_time DESC';

  // 分页查询
  const { list, total } = await paginatedQuery(pool, {
    baseQuery: `SELECT
      c.id, c.company_name, c.contact_name, c.phone, c.email,
      c.address, c.industry, c.source, c.level,
      c.owner_id, c.status, c.customer_type, c.lifecycle_status, c.remark, c.create_time, c.update_time,
      c.pool_status, c.protect_until, c.last_follow_time,
      c.lead_level, c.follow_status, c.converted_at,
      u.real_name as owner_name
    FROM crm_customer c
    LEFT JOIN sys_user u ON c.owner_id = u.id
    ${whereClause}`,
    countQuery: `SELECT COUNT(*) as total FROM crm_customer c ${whereClause}`,
    params: queryParams,
    page,
    pageSize,
    orderBy
  });

  // 批量获取标签
  const customerIds = list.map(c => c.id);
  if (customerIds.length > 0) {
    const [tags] = await pool.query(
      `SELECT ct.customer_id, t.id, t.name, t.color
       FROM crm_customer_tag ct
       JOIN crm_tag t ON ct.tag_id = t.id
       WHERE ct.customer_id IN (?)`,
      [customerIds]
    );
    const tagMap = {};
    tags.forEach(t => {
      if (!tagMap[t.customer_id]) tagMap[t.customer_id] = [];
      tagMap[t.customer_id].push({ id: t.id, name: t.name, color: t.color });
    });
    list.forEach(c => { c.tags = tagMap[c.id] || []; });
  }

  return { list, total };
}

/**
 * 获取客户详情（含联系人、跟进记录、附件）
 * @param {object} pool
 * @param {number} customerId
 * @returns {object|null} { customer, contacts, followRecords }
 */
async function getCustomer(pool, customerId) {
  const [customers] = await pool.query(
    `SELECT
      c.id, c.company_name, c.contact_name, c.phone, c.email,
      c.address, c.industry, c.source, c.level,
      c.owner_id, c.status, c.customer_type, c.lifecycle_status, c.remark, c.create_time, c.update_time,
      c.pool_status, c.protect_until, c.last_follow_time, c.converted_at,
      u.real_name as owner_name
    FROM crm_customer c
    LEFT JOIN sys_user u ON c.owner_id = u.id
    WHERE c.id = ? AND c.deleted_at IS NULL`,
    [customerId]
  );

  if (customers.length === 0) return null;

  const customer = customers[0];

  const [contacts] = await pool.query(
    `SELECT id, customer_id, name, position, phone, email, wechat, is_decision, remark
    FROM crm_contact WHERE customer_id = ? AND deleted_at IS NULL
    ORDER BY is_decision DESC, id ASC`,
    [customerId]
  );

  const [followRecords] = await pool.query(
    `SELECT f.id, f.customer_id, f.contact_id, f.follow_type, f.content,
      f.next_time, f.next_content, f.create_by, f.create_time,
      u.real_name as creator_name,
      c.name as contact_name
    FROM crm_follow_up f
    LEFT JOIN sys_user u ON f.create_by = u.id
    LEFT JOIN crm_contact c ON f.contact_id = c.id AND c.deleted_at IS NULL
    WHERE f.customer_id = ? AND f.deleted_at IS NULL
    ORDER BY f.create_time DESC LIMIT 50`,
    [customerId]
  );

  // 附件
  if (followRecords.length > 0) {
    const followIds = followRecords.map(f => f.id);
    const placeholders = followIds.map(() => '?').join(',');
    const [attachments] = await pool.query(
      `SELECT id, business_id as follow_up_id, file_name, file_path, file_size, file_type
       FROM crm_attachment WHERE business_type = 'follow_up' AND business_id IN (${placeholders})
       ORDER BY create_time ASC`,
      followIds
    );
    const attMap = {};
    attachments.forEach(a => {
      if (!attMap[a.follow_up_id]) attMap[a.follow_up_id] = [];
      attMap[a.follow_up_id].push(a);
    });
    followRecords.forEach(f => { f.attachments = attMap[f.id] || []; });
  }

  return { customer, contacts, followRecords };
}

/**
 * 客户状态转化（线索→潜客→正式客户→流失）
 * @param {object} pool
 * @param {number} customerId
 * @param {string} action - 'to_prospect' | 'to_customer' | 'to_lost'
 * @returns {{ status: number }} 转化后的状态值
 * @throws {Error} 含 code / message 的业务异常
 */
async function convertStatus(pool, customerId, action) {
  const [customers] = await pool.query(
    'SELECT id, company_name, status FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customerId]
  );
  if (!customers.length) {
    const err = new Error('客户不存在');
    err.code = 404;
    throw err;
  }

  const customer = customers[0];
  const allowedActions = VALID_PATHS[customer.status] || [];
  if (!allowedActions.includes(action)) {
    const err = new Error('当前状态不允许执行此操作');
    err.code = 400;
    throw err;
  }

  const mapping = CONVERT_MAP[action];
  if (!mapping) {
    const err = new Error('无效的转化操作');
    err.code = 400;
    throw err;
  }

  await pool.query(
    `UPDATE crm_customer
     SET status = ?, customer_type = ?, lifecycle_status = ?,
         converted_at = COALESCE(converted_at, NOW()), update_time = NOW()
     WHERE id = ?`,
    [mapping.status, mapping.customer_type, mapping.lifecycle_status, customerId]
  );

  return { status: mapping.status };
}

/**
 * 分配客户负责人
 * @param {object} pool
 * @param {number} customerId
 * @param {number|null} toUserId - null 表示回收为待分配
 * @param {number} operatorId
 * @param {string} [remark]
 * @returns {{ fromUserId: number|null }}
 */
async function assignCustomer(pool, customerId, toUserId, operatorId, remark) {
  const [customers] = await pool.query(
    'SELECT id, owner_id, company_name FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customerId]
  );
  if (customers.length === 0) {
    const err = new Error('客户不存在');
    err.code = 404;
    throw err;
  }

  const fromUserId = customers[0].owner_id;

  await pool.query(
    'UPDATE crm_customer SET owner_id = ?, pool_status = 0, protect_until = NULL WHERE id = ?',
    [toUserId || null, customerId]
  );

  await pool.query(
    'INSERT INTO crm_assign_log (customer_id, from_user_id, to_user_id, operator_id, remark) VALUES (?, ?, ?, ?, ?)',
    [customerId, fromUserId, toUserId || null, operatorId, remark || null]
  );

  return { fromUserId };
}

/**
 * 批量分配客户负责人（事务保护）
 * @param {object} pool
 * @param {number[]} customerIds
 * @param {number|null} toUserId
 * @param {number} operatorId
 * @param {string} [remark]
 * @returns {{ count: number }}
 */
async function batchAssignCustomers(pool, customerIds, toUserId, operatorId, remark) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let successCount = 0;
    for (const customerId of customerIds) {
      const [customers] = await connection.query(
        'SELECT id, company_name, owner_id FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
        [customerId]
      );
      if (customers.length === 0) continue;

      await connection.query(
        'UPDATE crm_customer SET owner_id = ?, pool_status = 0, protect_until = NULL WHERE id = ?',
        [toUserId, customerId]
      );

      await connection.query(
        `INSERT INTO crm_assign_log (customer_id, from_user_id, to_user_id, operator_id, remark) VALUES (?, ?, ?, ?, ?)`,
        [customerId, customers[0].owner_id, toUserId, operatorId, remark || null]
      );

      successCount++;
    }

    await connection.commit();
    return { count: successCount };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 认领公海客户
 * @param {object} pool
 * @param {number} customerId
 * @param {number} userId
 * @returns {{ protect_until: Date }}
 */
async function claimCustomer(pool, customerId, userId) {
  const [customers] = await pool.query(
    'SELECT id, pool_status, pool_type, protect_until, owner_id FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customerId]
  );
  if (customers.length === 0) {
    const err = new Error('客户不存在');
    err.code = 404;
    throw err;
  }

  const customer = customers[0];

  if (customer.pool_status !== 1) {
    const err = new Error('该客户不在公海中');
    err.code = 400;
    throw err;
  }

  if (customer.protect_until && new Date(customer.protect_until) > new Date()) {
    const remainDays = Math.ceil((new Date(customer.protect_until) - new Date()) / (1000 * 60 * 60 * 24));
    const err = new Error(`该客户在保护期内，还需等待 ${remainDays} 天`);
    err.code = 400;
    err.protect_until = customer.protect_until;
    throw err;
  }

  const protectUntil = new Date();
  protectUntil.setDate(protectUntil.getDate() + 7);

  await pool.query(
    'UPDATE crm_customer SET pool_status = 0, owner_id = ?, protect_until = ?, last_follow_time = NOW() WHERE id = ?',
    [userId, protectUntil, customerId]
  );

  await pool.query(
    "INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id) VALUES (?, 'claim', ?, ?)",
    [customerId, customer.owner_id, userId]
  );

  return { protect_until: protectUntil };
}

/**
 * 释放客户到公海
 * @param {object} pool
 * @param {number} customerId
 * @param {number} userId
 */
async function releaseCustomer(pool, customerId, userId) {
  const [customers] = await pool.query(
    'SELECT id, owner_id, company_name FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customerId]
  );
  if (customers.length === 0) {
    const err = new Error('客户不存在');
    err.code = 404;
    throw err;
  }

  await pool.query(
    'UPDATE crm_customer SET pool_status = 1, owner_id = NULL, protect_until = NULL WHERE id = ?',
    [customerId]
  );

  await pool.query(
    "INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id) VALUES (?, 'release', ?, NULL)",
    [customerId, userId]
  );
}

module.exports = {
  VALID_SOURCES,
  SOURCE_PARENT_MAP,
  listCustomers,
  getCustomer,
  convertStatus,
  assignCustomer,
  batchAssignCustomers,
  claimCustomer,
  releaseCustomer
};
