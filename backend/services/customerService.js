/**
 * 客户核心服务层
 * 从 routes/customer/ 提取的业务逻辑，供路由层复用
 */
const {
  CUSTOMER_STATUS,
  CUSTOMER_STATUS_PIPELINE,
  isValidCustomerStatus
} = require('../constants/customerStatus');
const {
  POOL_STATUS,
  BUSINESS_STATUS,
  FORMAL_BUSINESS_STATUSES,
  isValidBusinessStatus
} = require('../constants/poolStatus');
const { paginatedQuery } = require('../utils/pagination');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

// 来源父子映射（'网络' → 子渠道列表）。VALID_SOURCES 白名单已随阶段4 死码清理移除
// （权威定义见 services/customerDetailService.js 并从那里导出）。
const SOURCE_PARENT_MAP = {
  '网络': ['Facebook', 'Instagram', 'LinkedIn', '独立站', '其他网络渠道']
};

// 排序白名单
const SORT_MAP = {
  'create_time_desc': 'c.create_time DESC',
  'last_follow_time_asc': 'c.last_follow_time IS NULL ASC, c.last_follow_time ASC',
  'last_follow_time_desc': 'c.last_follow_time DESC'
};

// 状态配置缓存（启动时加载，可定时刷新）
let statusConfigCache = null;
let statusTransitionCache = null;

/**
 * 旧数字状态兼容映射（用于过渡期间旧前端/旧数据查询）
 * @param {number|string} legacyStatus
 * @returns {string|null}
 */
function legacyStatusToCode(legacyStatus) {
  const map = {
    0: CUSTOMER_STATUS.SEA,
    1: CUSTOMER_STATUS.FOLLOWING,
    2: CUSTOMER_STATUS.FOLLOWING,
    3: CUSTOMER_STATUS.LOST,
    5: CUSTOMER_STATUS.FOLLOWING
  };
  return map[legacyStatus] || null;
}

/**
 * 将 status 映射为 business_status（保持两个状态字段同步）
 * business_status 枚举不含 sea/paused（迁移 097 规则）：
 *   sea/paused → following，其余状态码直接对应
 * @param {string} status
 * @returns {string|null}
 */
function mapStatusToBusinessStatus(status) {
  if (!status) return null;
  switch (status) {
    case CUSTOMER_STATUS.SEA:
    case CUSTOMER_STATUS.PAUSED:
      return BUSINESS_STATUS.FOLLOWING;
    case BUSINESS_STATUS.LEAD:
    case BUSINESS_STATUS.FOLLOWING:
    case BUSINESS_STATUS.QUOTED:
    case BUSINESS_STATUS.NEGOTIATING:
    case BUSINESS_STATUS.SIGNED:
    case BUSINESS_STATUS.LOST:
      return status;
    default:
      return null;
  }
}

/**
 * 加载客户状态配置
 */
async function loadStatusConfig(pool) {
  if (statusConfigCache) return statusConfigCache;
  const [rows] = await pool.query(
    'SELECT code, name, sort_order, is_default, is_end, color FROM sys_customer_status ORDER BY sort_order'
  );
  statusConfigCache = rows;
  return rows;
}

/**
 * 加载状态流转规则
 */
async function loadStatusTransitions(pool) {
  if (statusTransitionCache) return statusTransitionCache;
  const [rows] = await pool.query(
    'SELECT from_code, to_code, require_permission, require_reason FROM sys_customer_status_transition'
  );
  statusTransitionCache = rows;
  return rows;
}

/**
 * 判断状态流转是否合法
 */
async function canTransition(pool, fromCode, toCode) {
  if (fromCode === toCode) return { valid: true };
  const transitions = await loadStatusTransitions(pool);
  const rule = transitions.find(t => t.from_code === fromCode && t.to_code === toCode);
  return rule ? { valid: true, rule } : { valid: false };
}

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
    business_status,
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
  // 软删除过滤属于**不变量**，统一放在基础子句里：历史上「传 status」的分支自己拼了一套 WHERE，
  // 漏掉 deleted_at IS NULL，导致带状态筛选时把已删客户返回给调用方（2026-09-11 修复，见
  // tests/db/customerListSoftDelete.test.js）。放在基础子句后，后续新增筛选条件只做 `+=`，不会再漏。
  let whereClause = `WHERE ${permissionWhere} AND c.deleted_at IS NULL`;
  if (status !== undefined && status !== null && status !== '') {
    const mappedStatus = isValidCustomerStatus(status)
      ? status
      : legacyStatusToCode(status);
    if (!mappedStatus) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, '无效的客户状态');
    }
    whereClause += ' AND c.status = ?';
    queryParams.push(mappedStatus);
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
    whereClause += ' AND pc.name LIKE ?';
    queryParams.push(`%${contact_name}%`);
  }
  if (phone) {
    whereClause += ' AND pc.phone LIKE ?';
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
  // business_status 过滤：与 listFormalCustomers 的实现保持一致。
  // 前端「客户总览 / 公海」页的下拉「客户状态」发的就是 business_status
  // （views/pool/List.vue:21-26,250），此前这里不读该参数、schema 也把它 stripUnknown 掉，
  // 导致用户选了状态列表却不过滤（2026-09-11 修复，回归测试 tests/db/customerListBusinessStatus.test.js）。
  if (business_status && isValidBusinessStatus(business_status)) {
    whereClause += ' AND c.business_status = ?';
    queryParams.push(business_status);
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
    whereClause += ' AND c.owner_id IS NULL';
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
      c.id, c.company_name,
      pc.name as primary_contact_name, pc.phone as primary_contact_phone, pc.email as primary_contact_email,
      c.address, c.industry, c.source, c.level,
      c.owner_id, c.status, c.customer_type, c.lifecycle_status, c.remark, c.create_time, c.update_time,
      c.pool_status, c.protect_until, c.last_follow_time,
      c.lead_level, c.follow_status, c.converted_at,
      (SELECT f.next_time FROM crm_follow_up f
       WHERE f.customer_id = c.id AND f.deleted_at IS NULL
       ORDER BY f.create_time DESC LIMIT 1) as next_follow_time,
      u.real_name as owner_name
    FROM crm_customer c
    LEFT JOIN sys_user u ON c.owner_id = u.id
    LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
    ${whereClause}`,
    countQuery: `SELECT COUNT(DISTINCT c.id) as total
      FROM crm_customer c
      LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
      ${whereClause}`,
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
      c.id, c.company_name,
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
    `SELECT id, customer_id, name, position, phone, email, wechat, is_decision, is_primary, remark
    FROM crm_contact WHERE customer_id = ? AND deleted_at IS NULL
    ORDER BY is_primary DESC, is_decision DESC, id ASC`,
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
 * 通用客户状态流转
 * @param {object} pool
 * @param {number} customerId
 * @param {string} toCode - 目标状态编码
 * @param {number} [operatorId]
 * @param {string} [reason]
 * @returns {{ id: number, status: string, from_status: string }}
 * @throws {Error} 含 code / message 的业务异常
 */
async function transitionStatus(pool, customerId, toCode, operatorId, reason) {
  if (!isValidCustomerStatus(toCode)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '无效的目标状态');
  }

  const [customers] = await pool.query(
    'SELECT id, company_name, status FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customerId]
  );
  if (!customers.length) {
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND);
  }

  const customer = customers[0];
  const { valid, rule } = await canTransition(pool, customer.status, toCode);
  if (!valid) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '当前状态不允许流转到目标状态');
  }

  if (rule && rule.require_reason && !reason) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '该状态流转需要填写原因');
  }

  // 同步更新 business_status，保持 status 与业务生命周期字段一致
  // （sea/paused 不在 business_status 枚举，映射为 following）
  const bizStatus = mapStatusToBusinessStatus(toCode);
  await pool.query(
    `UPDATE crm_customer
     SET status = ?, business_status = COALESCE(?, business_status), update_time = NOW()
     WHERE id = ?`,
    [toCode, bizStatus, customerId]
  );

  return { id: customerId, status: toCode, from_status: customer.status };
}

/**
 * 状态推进（沿主销售漏斗前进一步）
 * @param {object} pool
 * @param {number} customerId
 * @param {number} [operatorId]
 * @returns {{ id: number, status: string, from_status: string }}
 */
async function forwardStatus(pool, customerId, operatorId) {
  const [customers] = await pool.query(
    'SELECT id, status FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customerId]
  );
  if (!customers.length) {
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND);
  }

  const fromCode = customers[0].status;
  const idx = CUSTOMER_STATUS_PIPELINE.indexOf(fromCode);
  if (idx === -1 || idx >= CUSTOMER_STATUS_PIPELINE.length - 1) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '当前状态无法继续推进');
  }

  const toCode = CUSTOMER_STATUS_PIPELINE[idx + 1];
  return transitionStatus(pool, customerId, toCode, operatorId);
}

/**
 * 状态回退（沿主销售漏斗回退一步）
 * @param {object} pool
 * @param {number} customerId
 * @param {number} [operatorId]
 * @param {string} [reason]
 * @returns {{ id: number, status: string, from_status: string }}
 */
async function backwardStatus(pool, customerId, operatorId, reason) {
  const [customers] = await pool.query(
    'SELECT id, status FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customerId]
  );
  if (!customers.length) {
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND);
  }

  const fromCode = customers[0].status;
  const idx = CUSTOMER_STATUS_PIPELINE.indexOf(fromCode);
  if (idx <= 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '当前状态无法回退');
  }

  const toCode = CUSTOMER_STATUS_PIPELINE[idx - 1];
  return transitionStatus(pool, customerId, toCode, operatorId, reason);
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
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND);
  }

  const fromUserId = customers[0].owner_id;

  await pool.query(
    'UPDATE crm_customer SET owner_id = ?, pool_status = ?, protect_until = NULL WHERE id = ?',
    [toUserId || null, POOL_STATUS.PRIVATE, customerId]
  );

  await pool.query(
    'INSERT INTO crm_assign_log (customer_id, from_user_id, to_user_id, operator_id, remark) VALUES (?, ?, ?, ?, ?)',
    [customerId, fromUserId, toUserId || null, operatorId, remark || null]
  );

  return { fromUserId };
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
    'SELECT id, pool_status, pool_type, owner_id FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customerId]
  );
  if (customers.length === 0) {
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND);
  }

  const customer = customers[0];

  if (customer.pool_status !== POOL_STATUS.SEA) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '该客户不在公海中');
  }
  // 【产品决策 2026-09-10】保护期已下线。

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // 【P0-1 补齐】同上：原子条件必须写进 UPDATE，事务本身防不住并发覆盖。
    const [claimResult] = await connection.query(
      `UPDATE crm_customer
          SET pool_status = ?, owner_id = ?, protect_until = NULL, last_follow_time = NOW()
        WHERE id = ? AND owner_id IS NULL AND pool_status = ? AND deleted_at IS NULL`,
      [POOL_STATUS.PRIVATE, userId, customerId, POOL_STATUS.SEA]
    );
    if (claimResult.affectedRows !== 1) {
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '该客户已被他人认领，请刷新后重试');
    }

    await connection.query(
      "INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id) VALUES (?, 'claim', ?, ?)",
      [customerId, customer.owner_id, userId]
    );

    await connection.commit();
    return { company_name: customer.company_name };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND);
  }

  await pool.query(
    'UPDATE crm_customer SET pool_status = ?, owner_id = NULL, protect_until = NULL WHERE id = ?',
    [POOL_STATUS.SEA, customerId]
  );

  await pool.query(
    "INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id) VALUES (?, 'release', ?, NULL)",
    [customerId, userId]
  );
}

/**
 * 获取逾期客户列表（基于 last_follow_time 超过 overdue_days）
 * @param {object} pool
 * @param {object} params - { page, pageSize }
 * @param {object} [permission] - { clause, params }
 * @returns {{ list: Array, total: number, page: number, pageSize: number }}
 */
async function getOverdueCustomers(pool, params = {}, permission = null) {
  const { getOverdueDays } = require('../utils/config');
  const overdueDays = await getOverdueDays();
  const page = parseInt(params.page || 1);
  const pageSize = parseInt(params.pageSize || 20);
  const offset = (page - 1) * pageSize;

  let permissionWhere = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionWhere = permission.clause;
    permParams = permission.params || [];
  }

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_customer c
     WHERE c.deleted_at IS NULL AND c.status NOT IN ('signed', 'lost')
       AND c.owner_id IS NOT NULL
       AND (c.last_follow_time IS NULL
         OR c.last_follow_time < NOW() - INTERVAL ? DAY)
       AND ${permissionWhere}`,
    [overdueDays, ...permParams]
  );

  const [list] = await pool.query(
    `SELECT c.id, c.company_name, c.status, c.owner_id,
            c.last_follow_time, c.create_time,
            DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) as overdue_days,
            u.real_name as owner_name
     FROM crm_customer c
     LEFT JOIN sys_user u ON c.owner_id = u.id
     WHERE c.deleted_at IS NULL AND c.status NOT IN ('signed', 'lost')
       AND c.owner_id IS NOT NULL
       AND (c.last_follow_time IS NULL
         OR c.last_follow_time < NOW() - INTERVAL ? DAY)
       AND ${permissionWhere}
     ORDER BY overdue_days DESC
     LIMIT ? OFFSET ?`,
    [overdueDays, ...permParams, pageSize, offset]
  );

  return {
    list,
    total: countResult[0].total,
    page,
    pageSize
  };
}

/**
 * 获取即将回收客户列表（following 状态超过 near_recycle_days 未跟进）
 * @param {object} pool
 * @param {object} params - { page, pageSize }
 * @param {object} [permission] - { clause, params }
 * @returns {{ list: Array, total: number, page: number, pageSize: number }}
 */
async function getNearRecycleCustomersList(pool, params = {}, permission = null) {
  const { getNearRecycleDays } = require('../utils/config');
  const nearDays = await getNearRecycleDays();
  const page = parseInt(params.page || 1);
  const pageSize = parseInt(params.pageSize || 20);
  const offset = (page - 1) * pageSize;

  let permissionWhere = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionWhere = permission.clause;
    permParams = permission.params || [];
  }

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_customer c
     WHERE c.pool_status = ? AND c.deleted_at IS NULL AND c.owner_id IS NOT NULL
       AND c.status = 'following'
       AND (c.last_follow_time IS NULL AND c.create_time < NOW() - INTERVAL ? DAY
         OR c.last_follow_time < NOW() - INTERVAL ? DAY)
       AND ${permissionWhere}`,
    [POOL_STATUS.PRIVATE, nearDays, nearDays, ...permParams]
  );

  const [list] = await pool.query(
    `SELECT c.id, c.company_name, c.status, c.owner_id,
            c.last_follow_time, c.create_time,
            DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) as overdue_days,
            u.real_name as owner_name
     FROM crm_customer c
     LEFT JOIN sys_user u ON c.owner_id = u.id
     WHERE c.pool_status = ? AND c.deleted_at IS NULL AND c.owner_id IS NOT NULL
       AND c.status = 'following'
       AND (c.last_follow_time IS NULL AND c.create_time < NOW() - INTERVAL ? DAY
         OR c.last_follow_time < NOW() - INTERVAL ? DAY)
       AND ${permissionWhere}
     ORDER BY overdue_days DESC
     LIMIT ? OFFSET ?`,
    [POOL_STATUS.PRIVATE, nearDays, nearDays, ...permParams, pageSize, offset]
  );

  return {
    list,
    total: countResult[0].total,
    page,
    pageSize
  };
}

// ============================================================
// Phase 2: 客户中心三页面查询 + 业务操作方法
// ============================================================

/**
 * 查询潜客池列表（business_status='lead'）
 * @param {object} pool
 * @param {object} params - { page, pageSize, company_name, contact_name, phone, source, lead_level, owner_id, sort }
 * @param {object} [permission] - { clause, params } 数据权限片段
 * @returns {{ list: Array, total: number }}
 */
async function listLeads(pool, params = {}, permission = null) {
  const {
    page = 1, pageSize = 10,
    company_name, contact_name, phone, source, lead_level, owner_id, sort
  } = params;

  const queryParams = [];
  let permissionWhere = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionWhere = permission.clause;
    permParams = permission.params || [];
  }
  queryParams.push(...permParams);

  // 核心过滤：business_status='lead' + 未删除
  let whereClause = `WHERE ${permissionWhere} AND c.business_status = ? AND c.deleted_at IS NULL`;
  queryParams.push(BUSINESS_STATUS.LEAD);

  if (owner_id !== undefined && owner_id !== null && owner_id !== '') {
    whereClause += ' AND c.owner_id = ?';
    queryParams.push(owner_id);
  }
  if (company_name) {
    whereClause += ' AND c.company_name LIKE ?';
    queryParams.push(`%${company_name}%`);
  }
  if (contact_name) {
    whereClause += ' AND pc.name LIKE ?';
    queryParams.push(`%${contact_name}%`);
  }
  if (phone) {
    whereClause += ' AND pc.phone LIKE ?';
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
  if (lead_level) {
    whereClause += ' AND c.lead_level = ?';
    queryParams.push(lead_level);
  }

  const orderBy = SORT_MAP[sort] || 'c.create_time DESC';

  const { list, total } = await paginatedQuery(pool, {
    baseQuery: `SELECT
      c.id, c.company_name,
      pc.name as primary_contact_name, pc.phone as primary_contact_phone, pc.email as primary_contact_email,
      c.address, c.industry, c.source, c.level, c.lead_level, c.follow_status,
      c.owner_id, c.business_status, c.pool_status, c.remark,
      c.create_time, c.last_follow_time, c.converted_at,
      (SELECT f.next_time FROM crm_follow_up f
       WHERE f.customer_id = c.id AND f.deleted_at IS NULL
       ORDER BY f.create_time DESC LIMIT 1) as next_follow_time,
      u.real_name as owner_name
    FROM crm_customer c
    LEFT JOIN sys_user u ON c.owner_id = u.id
    LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
    ${whereClause}`,
    countQuery: `SELECT COUNT(DISTINCT c.id) as total
      FROM crm_customer c
      LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
      ${whereClause}`,
    params: queryParams,
    page, pageSize, orderBy
  });

  return { list, total };
}

/**
 * 查询正式客户列表（business_status IN following/quoted/negotiating/signed 且 pool_status='private'）
 * @param {object} pool
 * @param {object} params - { page, pageSize, company_name, contact_name, phone, source, level, business_status, owner_id, start_date, end_date, sort }
 * @param {object} [permission] - { clause, params }
 * @returns {{ list: Array, total: number }}
 */
async function listFormalCustomers(pool, params = {}, permission = null) {
  const {
    page = 1, pageSize = 10,
    company_name, contact_name, phone, source, level, business_status, owner_id,
    start_date, end_date, sort
  } = params;

  const queryParams = [];
  let permissionWhere = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionWhere = permission.clause;
    permParams = permission.params || [];
  }
  queryParams.push(...permParams);

  // 核心过滤：正式客户状态 + private + 未删除
  const formalPlaceholders = FORMAL_BUSINESS_STATUSES.map(() => '?').join(',');
  let whereClause = `WHERE ${permissionWhere} AND c.business_status IN (${formalPlaceholders}) AND c.pool_status = ? AND c.deleted_at IS NULL`;
  queryParams.push(...FORMAL_BUSINESS_STATUSES, POOL_STATUS.PRIVATE);

  if (owner_id) {
    whereClause += ' AND c.owner_id = ?';
    queryParams.push(owner_id);
  }
  if (company_name) {
    whereClause += ' AND c.company_name LIKE ?';
    queryParams.push(`%${company_name}%`);
  }
  if (contact_name) {
    whereClause += ' AND pc.name LIKE ?';
    queryParams.push(`%${contact_name}%`);
  }
  if (phone) {
    whereClause += ' AND pc.phone LIKE ?';
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
  if (business_status && isValidBusinessStatus(business_status)) {
    whereClause += ' AND c.business_status = ?';
    queryParams.push(business_status);
  }
  if (start_date) {
    whereClause += ' AND c.create_time >= ?';
    queryParams.push(start_date);
  }
  if (end_date) {
    whereClause += ' AND c.create_time < ?';
    queryParams.push(end_date + ' 23:59:59');
  }

  const orderBy = SORT_MAP[sort] || 'c.create_time DESC';

  const { list, total } = await paginatedQuery(pool, {
    baseQuery: `SELECT
      c.id, c.company_name,
      pc.name as primary_contact_name, pc.phone as primary_contact_phone, pc.email as primary_contact_email,
      c.address, c.industry, c.source, c.level,
      c.owner_id, c.business_status, c.pool_status, c.remark,
      c.create_time, c.update_time, c.last_follow_time, c.converted_at,
      (SELECT COUNT(*) FROM crm_opportunity o WHERE o.customer_id = c.id AND o.deleted_at IS NULL) as opportunity_count,
      (SELECT COUNT(*) FROM crm_contract ct WHERE ct.customer_id = c.id AND ct.deleted_at IS NULL) as contract_count,
      (SELECT f.next_time FROM crm_follow_up f
       WHERE f.customer_id = c.id AND f.deleted_at IS NULL
       ORDER BY f.create_time DESC LIMIT 1) as next_follow_time,
      u.real_name as owner_name
    FROM crm_customer c
    LEFT JOIN sys_user u ON c.owner_id = u.id
    LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
    ${whereClause}`,
    countQuery: `SELECT COUNT(DISTINCT c.id) as total
      FROM crm_customer c
      LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
      ${whereClause}`,
    params: queryParams,
    page, pageSize, orderBy
  });

  return { list, total };
}

/**
 * 查询公海池列表（pool_status='sea' 且 business_status != 'lead'）
 * @param {object} pool
 * @param {object} params - { page, pageSize, company_name, industry, source, level, sort }
 * @param {object} [permission] - { clause, params }
 * @returns {{ list: Array, total: number }}
 */
async function listPoolCustomersNew(pool, params = {}, permission = null) {
  const {
    page = 1, pageSize = 10,
    company_name, industry, source, level, sort
  } = params;

  const queryParams = [];
  let permissionWhere = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionWhere = permission.clause;
    permParams = permission.params || [];
  }
  queryParams.push(...permParams);

  // 核心过滤：公海 + 排除 lead 客户 + 未删除
  let whereClause = `WHERE ${permissionWhere} AND c.pool_status = ? AND c.business_status != ? AND c.deleted_at IS NULL`;
  queryParams.push(POOL_STATUS.SEA, BUSINESS_STATUS.LEAD);

  if (company_name) {
    whereClause += ' AND c.company_name LIKE ?';
    queryParams.push(`%${company_name}%`);
  }
  if (industry) {
    whereClause += ' AND c.industry = ?';
    queryParams.push(industry);
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

  const orderBy = SORT_MAP[sort] || 'c.create_time DESC';

  const { list, total } = await paginatedQuery(pool, {
    baseQuery: `SELECT
      c.id, c.company_name,
      pc.name as primary_contact_name, pc.phone as primary_contact_phone, pc.email as primary_contact_email,
      c.industry, c.source, c.level, c.business_status, c.pool_status,
      c.protect_until, c.last_follow_time, c.create_time, c.update_time,
      (SELECT pl.create_time FROM crm_pool_log pl
       WHERE pl.customer_id = c.id AND pl.action IN ('release', 'auto_release')
       ORDER BY pl.create_time DESC LIMIT 1) as released_at,
      (SELECT pl.from_user_id FROM crm_pool_log pl
       WHERE pl.customer_id = c.id AND pl.action IN ('release', 'auto_release')
       ORDER BY pl.create_time DESC LIMIT 1) as released_by_id,
      pu.real_name as released_by_name,
      u.real_name as owner_name
    FROM crm_customer c
    LEFT JOIN sys_user u ON c.owner_id = u.id
    LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
    LEFT JOIN sys_user pu ON pu.id = (
      SELECT pl.from_user_id FROM crm_pool_log pl
      WHERE pl.customer_id = c.id AND pl.action IN ('release', 'auto_release')
      ORDER BY pl.create_time DESC LIMIT 1
    )
    ${whereClause}`,
    countQuery: `SELECT COUNT(DISTINCT c.id) as total
      FROM crm_customer c
      ${whereClause}`,
    params: queryParams,
    page, pageSize, orderBy
  });

  return { list, total };
}

/**
 * 潜客转正式客户（Phase 2 增强版）
 * 将 business_status 从 lead 改为 following，同步 customer_type、lifecycle_status
 *
 * 【归属规则 · 产品决策 2026-09-11】
 *   · 本人转化（销售等普通角色，manageAll=false）→ 客户归操作人，pool_status='private'
 *   · 代转化（老板/管理员，manageAll=true）→ 客户留空待分配，
 *     置入公海（pool_status='sea' 且 business_status='following'），由后续认领或分配
 *
 * 背景（缺陷修复）：此前无论谁转化都**不写 owner_id**，却仍往 crm_assign_log 写
 * `to_user_id = owner_id || operatorId` —— 日志说「已分给操作人」而数据没分。
 * 且转化后的客户呈现 owner_id=NULL + pool_status='private' + business_status='following'，
 * 既不属公海（认领要求 pool_status='sea'），也无法再走潜客池（已非 lead），
 * 成为「无主正式客户」死区。
 *
 * @param {object} pool
 * @param {number} customerId
 * @param {number} operatorId
 * @param {object} [options]
 * @param {boolean} [options.manageAll=false] 操作人是否具备全量管理权限（老板/管理员）
 * @returns {{ id: number, company_name: string, from_status: string, to_status: string, owner_id: number|null, pool_status: string }}
 */
async function convertLeadToCustomer(pool, customerId, operatorId, options = {}) {
  const { manageAll = false } = options;
  const [rows] = await pool.query(
    'SELECT id, company_name, customer_type, business_status, owner_id FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customerId]
  );
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND);
  }
  const customer = rows[0];
  if (customer.business_status !== BUSINESS_STATUS.LEAD) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '该客户不是线索，无法转化');
  }

  // 代转化 → 留空进公海；本人转化 → 归自己
  const nextOwnerId = manageAll ? null : operatorId;
  const nextPoolStatus = manageAll ? POOL_STATUS.SEA : POOL_STATUS.PRIVATE;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE crm_customer
       SET customer_type = ?, lifecycle_status = ?, business_status = ?, status = ?,
           owner_id = ?, pool_status = ?, converted_at = NOW(), update_time = NOW()
       WHERE id = ?`,
      ['customer', 'active', BUSINESS_STATUS.FOLLOWING, CUSTOMER_STATUS.FOLLOWING,
        nextOwnerId, nextPoolStatus, customerId]
    );
    // 仅在真正发生归属变更时写分配日志，
    // 避免「日志说分了、数据没分」（原缺陷）。
    if (nextOwnerId !== null) {
      await connection.query(
        `INSERT INTO crm_assign_log (customer_id, from_user_id, to_user_id, operator_id, remark)
         VALUES (?, ?, ?, ?, '潜客转正式客户')`,
        [customerId, customer.owner_id, nextOwnerId, operatorId]
      );
    }
    await connection.commit();
    return {
      id: customerId,
      company_name: customer.company_name,
      from_status: BUSINESS_STATUS.LEAD,
      to_status: BUSINESS_STATUS.FOLLOWING,
      owner_id: nextOwnerId,
      pool_status: nextPoolStatus
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 释放客户到公海（Phase 2 增强版）
 * 仅限非 lead 客户，释放后 pool_status='sea', owner_id=NULL
 * @param {object} pool
 * @param {number} customerId
 * @param {number} operatorId
 * @param {string} [reason]
 * @returns {{ id: number, company_name: string }}
 */
async function releaseCustomerToPool(pool, customerId, operatorId, _reason) {
  const [rows] = await pool.query(
    'SELECT id, company_name, business_status, owner_id, pool_status FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customerId]
  );
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND);
  }
  const customer = rows[0];
  if (customer.business_status === BUSINESS_STATUS.LEAD) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '线索客户不能释放到公海，请使用"放弃"操作');
  }
  if (customer.pool_status === POOL_STATUS.SEA) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '该客户已在公海中');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      'UPDATE crm_customer SET pool_status = ?, owner_id = NULL, protect_until = NULL, update_time = NOW() WHERE id = ?',
      [POOL_STATUS.SEA, customerId]
    );
    await connection.query(
      `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id)
       VALUES (?, 'release', ?, NULL)`,
      [customerId, customer.owner_id || operatorId]
    );
    await connection.commit();
    return { id: customerId, company_name: customer.company_name };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 领取公海客户（Phase 2 增强版）
 * 从公海池认领客户，设置 owner_id、pool_status='private'、保护期
 * @param {object} pool
 * @param {number} customerId
 * @param {number} userId
 * @returns {{ id: number, company_name: string, protect_until: Date }}
 */
async function claimPoolCustomer(pool, customerId, userId) {
  const [rows] = await pool.query(
    'SELECT id, company_name, business_status, pool_status, owner_id FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customerId]
  );
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND);
  }
  const customer = rows[0];
  if (customer.pool_status !== POOL_STATUS.SEA) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '该客户不在公海中');
  }
  if (customer.business_status === BUSINESS_STATUS.LEAD) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '线索客户请到潜客池认领');
  }
  // 【产品决策 2026-09-10】保护期已下线：释放到公海的客户可被立即认领。

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // 【P0-1 补齐】条件必须带 `owner_id IS NULL AND pool_status = 'sea'`。
    // 原实现为 `WHERE id = ?`，仅靠事务无法防并发：REPEATABLE READ 下第二个事务的
    // UPDATE 会在行锁释放后依据最新版本重新匹配 id = ?，仍会覆盖前者的认领结果。
    // （注：poolService.claimCustomer 已先行修复，此处为同一缺陷的第二处实现。）
    const [claimResult] = await connection.query(
      `UPDATE crm_customer
          SET pool_status = ?, owner_id = ?, protect_until = NULL, last_follow_time = NOW(), update_time = NOW()
        WHERE id = ? AND owner_id IS NULL AND pool_status = ? AND deleted_at IS NULL`,
      [POOL_STATUS.PRIVATE, userId, customerId, POOL_STATUS.SEA]
    );
    if (claimResult.affectedRows !== 1) {
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '该客户已被他人认领，请刷新后重试');
    }
    await connection.query(
      `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id)
       VALUES (?, 'claim', ?, ?)`,
      [customerId, customer.owner_id, userId]
    );
    await connection.commit();
    return { id: customerId, company_name: customer.company_name };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * 【客户域受控写入口 · 仅供非 Customer 域模块调用】
 *
 * 背景（PRD 架构铁律 R-06）：非 Customer 模块**不得**直接 UPDATE/DELETE `crm_customer`，
 * 必须经客户域受控入口。以下两个函数即为该入口，供自动化/评分/导入等模块调用。
 *
 * ⚠️ 与 assignCustomer 的区别（**不要混用**）：
 *   assignCustomer 是「业务级归属变更」——会同步 pool_status='private'、清 protect_until、
 *   写 crm_assign_log，并要求 operatorId；这些副作用不属于「系统级自动写入」的场景。
 *   下面两个函数刻意只做「调用方原本就在做的事」，**逐字复刻原行为**，不做额外守卫与副作用。
 *   （是否给自动化加「归属守卫」属产品决策，另行评估，不在本次边界收敛范围内。）
 * ══════════════════════════════════════════════════════════════════════════
 */

/** 系统级归属变更（原 automationService 的 assign / 轮询分配写点行为） */
async function systemAssignOwner(pool, customerId, toUserId) {
  const [result] = await pool.query(
    'UPDATE crm_customer SET owner_id = ? WHERE id = ?',
    [toUserId, customerId]
  );
  return { affectedRows: result.affectedRows };
}

/**
 * 系统可更新的客户字段白名单
 * ⚠️ 与原 automationService 的 ALLOWED_FIELDS **保持逐字一致**（含 'assignee'）以保证行为不变；
 *    注：'assignee' 在 crm_customer 上并不存在（疑似历史笔误），命中时会在 SQL 层报错，
 *    与改动前表现一致。是否清理该字段建议单独提 issue，不在边界收敛中顺手改。
 */
const SYSTEM_UPDATABLE_FIELDS = ['level', 'status', 'industry', 'source', 'assignee', 'lifecycle_status', 'remark'];

/**
 * 系统级字段更新（原 automationService 的 update_field 写点行为）
 * · 白名单外 → 抛错（与改动前「绕过校验直接执行 SQL 报错」的失败形态一致，便于上层记录 failed 日志）
 * · field=status 时同步 business_status —— **改用单一来源 mapStatusToBusinessStatus**
 *   （原为内联 CASE；未知值回退 following 以与原来的 ELSE 分支逐字一致）
 */
async function systemUpdateField(pool, customerId, field, value) {
  if (!SYSTEM_UPDATABLE_FIELDS.includes(field)) {
    const err = new Error(`字段 ${field} 不在系统可更新白名单中`);
    err.code = 'FIELD_NOT_ALLOWED';
    throw err;
  }

  await pool.query(`UPDATE crm_customer SET ${field} = ? WHERE id = ?`, [value, customerId]);

  if (field === 'status') {
    const bizStatus = mapStatusToBusinessStatus(value) ?? BUSINESS_STATUS.FOLLOWING;
    await pool.query('UPDATE crm_customer SET business_status = ? WHERE id = ?', [bizStatus, customerId]);
  }

  return { success: true };
}

/** 系统级评分写入（原 scoringRouteService 的写点行为） */
async function systemUpdateScore(pool, customerId, score) {
  await pool.query('UPDATE crm_customer SET score = ? WHERE id = ?', [score, customerId]);
  return { success: true };
}

/**
 * 系统级「转移接收」：带**原负责人并发守卫**的归属变更
 * （原 transferService.acceptTransfer 的写点行为，逐字复刻）
 * 语义：接收人接手后客户转为私有、跟进时钟重置；若期间被他人接手（owner_id 已变）则 affectedRows=0，
 * 由调用方判定为「转移无法完成」并使用**同一事务**回滚。
 * ⚠️ 与 assignCustomer 的区别：不做 protect_until 清空、不写 assign_log（转移日志由 transferService 自己写）。
 * @param {object} pool 连接或事务连接（调用方在事务中传入 connection）
 * @returns {Promise<{affectedRows: number}>}
 */
async function systemAcceptTransfer(pool, customerId, toUserId, fromUserId) {
  const [result] = await pool.query(
    `UPDATE crm_customer
        SET owner_id = ?, pool_status = 'private', last_follow_time = NOW(), update_time = NOW()
      WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
    [toUserId, customerId, fromUserId]
  );
  return { affectedRows: result.affectedRows };
}

/**
 * 【客户域受控写入口】记录跟进后的客户派生状态刷新（follow_up 模块调用）
 * 语义（逐字复刻原 followUpService.addFollowUp 的 UPDATE）：
 *   最后跟进时间 = 当前时间；跟进状态 NULL/「初次联系」→「跟进中」；生命周期 new → nurturing
 */
async function systemApplyFollowUpEffect(pool, customerId) {
  await pool.query(
    `UPDATE crm_customer
     SET last_follow_time = NOW(),
         follow_status = CASE
           WHEN follow_status IS NULL OR follow_status = '初次联系' THEN '跟进中'
           ELSE follow_status
         END,
         lifecycle_status = CASE
           WHEN lifecycle_status = 'new' THEN 'nurturing'
           ELSE lifecycle_status
         END
     WHERE id = ?`,
    [customerId]
  );
  return { success: true };
}

/** 【客户域受控写入口】把最后跟进时间刷新为「当前时间」（批量补录跟进 / 完成跟进计划后调用） */
async function systemTouchLastFollowTime(pool, customerId) {
  await pool.query('UPDATE crm_customer SET last_follow_time = NOW() WHERE id = ?', [customerId]);
  return { success: true };
}

/**
 * 【客户域受控写入口】把最后跟进时间设为指定值或置空
 * 用于「删除跟进记录后回退到最近一条的时间」；无剩余记录时传 null 置空（与原实现一致）
 */
async function systemSetLastFollowTime(pool, customerId, at) {
  await pool.query('UPDATE crm_customer SET last_follow_time = ? WHERE id = ?', [at ?? null, customerId]);
  return { success: true };
}

/**
 * 【客户域受控写入口】导入创建客户（importService 调用）
 * 列与用途同原 INSERT；**取值与截断仍由导入域负责**（导入解析属导入域职责）
 * @returns {Promise<object>} mysql 结果（调用方需要 insertId 继续创建主联系人）
 */
async function systemCreateImportedCustomer(pool, fields) {
  const [result] = await pool.query(
    `INSERT INTO crm_customer (company_name, address, industry, source, level, status, remark, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fields.company_name, fields.address, fields.industry, fields.source,
      fields.level, fields.status, fields.remark, fields.owner_id
    ]
  );
  return result;
}

/**
 * 【客户域受控写入口】离职交接：把某用户名下客户整体释放到公海
 * ⚠️ 与原 `userRouteService.deleteUser` 的 SQL **逐字一致**（含 `pool_type='public'`）：
 *    **不同步 `status='sea'`、不写 `crm_pool_log`** —— 这两点与客户域其它释放路径（poolService 单条/批量、
 *    公海自动回收）不一致，属**已知差异**；是否统一需产品确认，本次收敛刻意保持原行为。
 */
async function systemReleaseOwnedCustomersOnLeave(pool, userId) {
  const [result] = await pool.query(
    `UPDATE crm_customer
       SET owner_id = NULL, pool_status = ?, pool_type = 'public', protect_until = NULL, update_time = NOW()
     WHERE owner_id = ? AND deleted_at IS NULL`,
    [POOL_STATUS.SEA, userId]
  );
  return { affectedRows: result.affectedRows };
}

module.exports = {
  // [2026-09-14 阶段4] 移除零引用导出面：VALID_SOURCES / SOURCE_PARENT_MAP /
  // batchAssignCustomers / loadStatusConfig / loadStatusTransitions /
  // getDefaultStatus / clearStatusConfigCache。
  // 其中 SOURCE_PARENT_MAP / loadStatusConfig / loadStatusTransitions 仍为
  // 本文件内部实现（仅取消导出）；其余四项已随本次死码清理整体删除。
  listCustomers,
  getCustomer,
  transitionStatus,
  forwardStatus,
  backwardStatus,
  assignCustomer,
  claimCustomer,
  releaseCustomer,
  canTransition,
  // 【R-06 客户域受控写入口】供非 Customer 域模块调用（见文件内注释）
  systemAssignOwner,
  systemUpdateField,
  SYSTEM_UPDATABLE_FIELDS,
  systemUpdateScore,
  systemAcceptTransfer,
  systemApplyFollowUpEffect,
  systemTouchLastFollowTime,
  systemSetLastFollowTime,
  systemCreateImportedCustomer,
  systemReleaseOwnedCustomersOnLeave,
  getOverdueCustomers,
  getNearRecycleCustomersList,
  // Phase 2: 三页面查询
  listLeads,
  listFormalCustomers,
  listPoolCustomersNew,
  // Phase 2: 三业务操作
  convertLeadToCustomer,
  releaseCustomerToPool,
  claimPoolCustomer,
  // 工具函数
  mapStatusToBusinessStatus
};
