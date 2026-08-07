/**
 * 客户详情服务层
 * 从 routes/customer/detail.js 提取的业务逻辑，供路由层复用
 * 注意：listCustomers / getCustomer / convertStatus 已在 customerService 中，此处不重复
 */

const XLSX = require('xlsx');
const { CUSTOMER_STATUS, CUSTOMER_STATUS_NAME, isValidCustomerStatus } = require('../constants/customerStatus');
const customerService = require('./customerService');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

/**
 * 旧数字状态兼容映射
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

// 客户来源白名单
const VALID_SOURCES = [
  '展会',
  'Facebook', 'Instagram', 'LinkedIn', '独立站', '其他网络渠道',
  '转介绍',
  '电话',
  '其他'
];

// 父分组 → 子值展开（搜索时用）
const SOURCE_PARENT_MAP = {
  '网络': ['Facebook', 'Instagram', 'LinkedIn', '独立站', '其他网络渠道']
};

/**
 * 检查用户是否有权限查看/编辑指定客户
 * @param {object} pool
 * @param {object} user - { manageAll, roleId, userId }
 * @param {number|null} customerOwnerId
 * @returns {boolean}
 */
async function canManageCustomer(pool, user, customerOwnerId) {
  const ROLES = require('../config/roles');
  if (user.manageAll || user.roleId === ROLES.ADMIN) {
    return true;
  }
  if (user.roleId === ROLES.MANAGER) {
    if (customerOwnerId === null || customerOwnerId === undefined) {
      return true;
    }
    const [rows] = await pool.query(
      'SELECT dept_id FROM sys_user WHERE id = ? AND dept_id IN (1,5,6,7)',
      [customerOwnerId]
    );
    return rows.length > 0;
  }
  return customerOwnerId === user.userId;
}

/**
 * 添加客户（含重复检测、自动分配负责人、同步创建联系人）
 * @param {object} pool
 * @param {object} data - { company_name, contacts, address, industry, source, level, remark }
 * @param {number} operatorId - 操作人ID
 * @returns {{ id: number, possibleDuplicates: Array|null, assignedOwner: number|null }}
 */
async function addCustomer(pool, data, operatorId) {
  const { autoAssignOwner } = require('./assignService');
  const { clearByPrefix } = require('../config/redis');

  const {
    company_name, contacts,
    address, industry, source, level, remark
  } = data;

  // 联系人校验：至少提供一个有效联系人
  const validContacts = Array.isArray(contacts)
    ? contacts.filter(c => c && typeof c === 'object' && c.name && String(c.name).trim() !== '')
    : [];
  if (validContacts.length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '请至少添加一个联系人');
  }

  // 重复检测（联系人信息从 crm_contact 主联系人获取）
  const [duplicates] = await pool.query(
    `SELECT c.id, c.company_name, pc.phone, pc.email
     FROM crm_customer c
     LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
     WHERE c.company_name = ? AND c.deleted_at IS NULL
     LIMIT 5`,
    [company_name]
  );

  // 自动分配负责人；未分配时进线索池
  const assignedOwner = await autoAssignOwner(pool, { source, address });
  const isAssigned = !!assignedOwner;
  const ownerId = assignedOwner || null;
  const status = isAssigned ? CUSTOMER_STATUS.FOLLOWING : CUSTOMER_STATUS.LEAD;

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  let customerId;
  try {
    const [result] = await connection.query(
      `INSERT INTO crm_customer
        (company_name, address, industry, source, level, owner_id, status, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company_name,
        address || null,
        industry || null,
        source || null,
        level || 'C',
        ownerId,
        status,
        remark || null
      ]
    );
    customerId = result.insertId;

    // 同步创建联系人，第一个标记为主联系人
    const contactValues = [];
    const contactParams = [];
    validContacts.forEach((contact, index) => {
      contactValues.push('(?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())');
      contactParams.push(
        customerId,
        contact.name ? String(contact.name).trim() : '',
        contact.position ? String(contact.position).trim() : null,
        contact.phone ? String(contact.phone).trim() : null,
        contact.email ? String(contact.email).trim() : null,
        contact.wechat ? String(contact.wechat).trim() : null,
        contact.is_decision ? 1 : 0,
        index === 0 ? 1 : 0
      );
    });

    await connection.query(
      `INSERT INTO crm_contact
        (customer_id, name, position, phone, email, wechat, is_decision, is_primary, create_time, update_time)
      VALUES ${contactValues.join(', ')}`,
      contactParams
    );

    // 如果自动分配了负责人，记录分配日志
    if (assignedOwner) {
      await connection.query(
        'INSERT INTO crm_assign_log (customer_id, from_user_id, to_user_id, operator_id, remark) VALUES (?, NULL, ?, ?, ?)',
        [customerId, assignedOwner, operatorId, '新建客户自动分配']
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  // 清除客户列表缓存
  clearByPrefix('cache:');

  return {
    id: customerId,
    possibleDuplicates: duplicates.length > 0 ? duplicates : null,
    assignedOwner
  };
}

/**
 * 修改客户（含权限检查、重复检测、字段变更日志数据）
 * @param {object} pool
 * @param {number} id
 * @param {object} updateFields - 要更新的字段
 * @param {object} user - 当前用户 { manageAll, roleId, userId }
 * @returns {{ customer: object, oldData: object }} 返回原客户数据供路由层记录日志
 * @throws {Error} 含 code / message 的业务异常
 */
async function updateCustomer(pool, id, updateFields, user) {
  const { clearByPrefix } = require('../config/redis');

  const [customers] = await pool.query(
    'SELECT id, owner_id, company_name, contact_name, phone, email, address, industry, source, level, status, remark FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [id]
  );

  if (customers.length === 0) {
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, '客户不存在')
  }

  const customer = customers[0];

  if (!(await canManageCustomer(pool, user, customer.owner_id))) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权修改该客户')
  }

  // 联系人信息统一由 crm_contact 管理，客户表字段不再允许直接修改
  const allowedFields = [
    'company_name', 'address',
    'industry', 'source', 'level', 'status', 'remark'
  ];

  // 状态变更需要符合流转规则
  if (updateFields.status !== undefined && updateFields.status !== customer.status) {
    if (!isValidCustomerStatus(updateFields.status)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, '无效的客户状态')
    }
    const { valid, rule } = await customerService.canTransition(pool, customer.status, updateFields.status);
    if (!valid) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, '当前状态不允许直接修改为目标状态')
    }
    if (rule && rule.require_reason) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, '该状态变更需要填写原因，请使用状态流转接口')
    }
  }

  const setClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(updateFields)) {
    if (allowedFields.includes(key) && value !== undefined) {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (setClauses.length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '没有要修改的字段')
  }

  // 重复检测：公司名变更时检查是否与已有客户重名
  if (updateFields.company_name && updateFields.company_name !== customer.company_name) {
    const [dups] = await pool.query(
      'SELECT id, company_name FROM crm_customer WHERE company_name = ? AND id != ? AND deleted_at IS NULL LIMIT 5',
      [updateFields.company_name, id]
    );
    if (dups.length > 0) {
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, `公司名称"${updateFields.company_name}"已存在（${dups.length} 个同名客户），请确认是否重复`, { possibleDuplicates: dups });
    }
  }

  params.push(id);

  await pool.query(
    `UPDATE crm_customer SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  clearByPrefix('cache:');

  return { customer, oldData: customer };
}

/**
 * 删除客户（逻辑删除，含权限检查）
 * @param {object} pool
 * @param {number} id
 * @param {object} user - 当前用户
 * @throws {Error} 含 code / message 的业务异常
 */
async function deleteCustomer(pool, id, user) {
  const { clearByPrefix } = require('../config/redis');

  const [customers] = await pool.query(
    'SELECT id, owner_id FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [id]
  );

  if (customers.length === 0) {
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, '客户不存在')
  }

  if (!(await canManageCustomer(pool, user, customers[0].owner_id))) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权删除该客户')
  }

  await pool.query(
    'UPDATE crm_customer SET deleted_at = NOW() WHERE id = ?',
    [id]
  );

  clearByPrefix('cache:');
}

/**
 * 获取客户详情（含联系人、跟进记录、附件，带数据权限校验）
 * @param {object} pool
 * @param {number} customerId
 * @param {object} permission - { clause, params } 数据权限片段
 * @returns {{ customer: object, contacts: Array, followRecords: Array }}
 * @throws {Error} 404 客户不存在
 */
async function getCustomerDetail(pool, customerId, permission) {
  const { clause: permissionWhere, params: permParams } = permission;

  const [customers] = await pool.query(
    `SELECT
      c.id, c.company_name,
      c.address, c.industry, c.source, c.level,
      c.owner_id, c.status, c.customer_type, c.lifecycle_status, c.remark, c.create_time, c.update_time,
      c.pool_status, c.protect_until, c.last_follow_time, c.converted_at,
      u.real_name as owner_name
    FROM crm_customer c
    LEFT JOIN sys_user u ON c.owner_id = u.id
    WHERE c.id = ? AND c.deleted_at IS NULL AND ${permissionWhere}`,
    [customerId, ...permParams]
  );

  if (customers.length === 0) {
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND);
  }

  const customer = customers[0];

  const [contacts] = await pool.query(
    `SELECT id, customer_id, name, position, phone, email, wechat, is_decision, is_primary, remark
    FROM crm_contact
    WHERE customer_id = ? AND deleted_at IS NULL
    ORDER BY is_primary DESC, is_decision DESC, id ASC`,
    [customerId]
  );

  // 数据兼容：若没有任何主联系人标记，自动将第一个联系人标记为主联系人
  if (contacts.length > 0 && !contacts.some(c => c.is_primary === 1)) {
    contacts[0].is_primary = 1;
  }

  const [followRecords] = await pool.query(
    `SELECT f.id, f.customer_id, f.contact_id, f.follow_type, f.content,
      f.next_time, f.next_content, f.create_by, f.create_time,
      f.is_plan, f.plan_status, f.finish_time,
      u.real_name as creator_name,
      c.name as contact_name
    FROM crm_follow_up f
    LEFT JOIN sys_user u ON f.create_by = u.id
    LEFT JOIN crm_contact c ON f.contact_id = c.id AND c.deleted_at IS NULL
    WHERE f.customer_id = ? AND f.deleted_at IS NULL
    ORDER BY f.create_time DESC
    LIMIT 50`,
    [customerId]
  );

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
 * 客户360度视图（含联系人、标签、跟进、商机、报价、合同、回款、工单、评分）
 * @param {object} pool
 * @param {number} customerId
 * @returns {object} { customer, contacts, tags, scoreLogs, stats, followRecords, opportunities, quotes, contracts, payments, serviceOrders }
 * @throws {Error} 404 客户不存在
 */
async function getCustomer360(pool, customerId) {
  const [[customer]] = await pool.query(`
    SELECT c.id, c.company_name, c.contact_name, c.phone, c.email, c.address, c.industry, c.source, c.level, c.lead_level, c.follow_status, c.converted_at, c.owner_id, c.status, c.customer_type, c.lifecycle_status, c.original_lead_id, c.score, c.remark, c.create_time, c.update_time, c.deleted_at, c.pool_status, c.pool_type, c.protect_until, c.last_follow_time, c.old_status_int,
           u.real_name as owner_name
    FROM crm_customer c
    LEFT JOIN sys_user u ON c.owner_id = u.id
    WHERE c.id = ? AND c.deleted_at IS NULL
  `, [customerId]);

  if (!customer) {
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND);
  }

  const [
    [contacts],
    [tags],
    [followRecords],
    [opportunities],
    [quotes],
    [contracts],
    [payments],
    [serviceOrders],
    [scoreLogs]
  ] = await Promise.all([
    pool.query(
      'SELECT id, name, position, phone, email, wechat, is_decision FROM crm_contact WHERE customer_id = ? AND deleted_at IS NULL ORDER BY is_decision DESC, id',
      [customerId]
    ),
    pool.query(`
      SELECT t.id, t.name, t.color FROM crm_tag t
      JOIN crm_customer_tag ct ON t.id = ct.tag_id
      WHERE ct.customer_id = ? ORDER BY t.sort
    `, [customerId]),
    pool.query(`
      SELECT f.id, f.follow_type, f.content, f.next_time, f.next_content, f.create_time,
             f.is_plan, f.plan_status, f.finish_time,
             u.real_name as creator_name, c.name as contact_name
      FROM crm_follow_up f
      LEFT JOIN sys_user u ON f.create_by = u.id
      LEFT JOIN crm_contact c ON f.contact_id = c.id
      WHERE f.customer_id = ? AND f.deleted_at IS NULL
      ORDER BY f.create_time DESC LIMIT 100
    `, [customerId]),
    pool.query(`
      SELECT o.id, o.name, o.expected_amount, o.expected_date, o.stage, o.win_rate, o.create_time,
             u.real_name as owner_name
      FROM crm_opportunity o
      LEFT JOIN sys_user u ON o.owner_id = u.id
      WHERE o.customer_id = ? AND o.deleted_at IS NULL
      ORDER BY o.create_time DESC
    `, [customerId]),
    pool.query(`
      SELECT q.id, q.quote_no, q.amount, q.final_amount, q.status, q.create_time, q.opportunity_id,
             u.real_name as create_by_name
      FROM crm_quote q
      LEFT JOIN sys_user u ON q.create_by = u.id
      WHERE q.customer_id = ? AND q.deleted_at IS NULL
      ORDER BY q.create_time DESC
    `, [customerId]),
    pool.query(`
      SELECT ct.id, ct.contract_no, ct.amount, ct.sign_date, ct.status, ct.create_time, ct.opportunity_id, ct.quote_id,
             u.real_name as create_by_name,
             (SELECT COALESCE(SUM(p.pay_amount), 0) FROM crm_payment p WHERE p.contract_id = ct.id AND p.deleted_at IS NULL) as paid_amount
      FROM crm_contract ct
      LEFT JOIN sys_user u ON ct.create_by = u.id
      WHERE ct.customer_id = ? AND ct.deleted_at IS NULL
      ORDER BY ct.create_time DESC
    `, [customerId]),
    pool.query(`
      SELECT p.id, p.pay_date, p.pay_amount, p.pay_method, p.remark, p.create_time,
             ct.contract_no
      FROM crm_payment p
      JOIN crm_contract ct ON p.contract_id = ct.id
      WHERE ct.customer_id = ? AND p.deleted_at IS NULL
      ORDER BY p.pay_date DESC
    `, [customerId]),
    pool.query(`
      SELECT s.id, s.order_no, s.title, s.type, s.priority, s.status, s.create_time,
             u.real_name as assignee_name
      FROM crm_service_order s
      LEFT JOIN sys_user u ON s.assignee_id = u.id
      WHERE s.customer_id = ? AND s.deleted_at IS NULL
      ORDER BY s.create_time DESC
    `, [customerId]),
    pool.query(`
      SELECT l.score, l.total_score, l.remark, l.create_time, r.name as rule_name
      FROM crm_customer_score_log l
      LEFT JOIN crm_score_rule r ON l.rule_id = r.id
      WHERE l.customer_id = ?
      ORDER BY l.create_time DESC LIMIT 20
    `, [customerId])
  ]);

  const stats = {
    follow_count: followRecords.length,
    opportunity_count: opportunities.length,
    opportunity_amount: opportunities.reduce((sum, o) => sum + parseFloat(o.expected_amount || 0), 0),
    quote_count: quotes.length,
    quote_amount: quotes.reduce((sum, q) => sum + parseFloat(q.final_amount || q.amount || 0), 0),
    contract_count: contracts.length,
    contract_amount: contracts.reduce((sum, c) => sum + parseFloat(c.amount || 0), 0),
    paid_amount: payments.reduce((sum, p) => sum + parseFloat(p.pay_amount || 0), 0),
    service_count: serviceOrders.length
  };

  return {
    customer, contacts, tags, scoreLogs, stats,
    followRecords, opportunities, quotes, contracts, payments, serviceOrders
  };
}

/**
 * 导出客户列表为 XLSX
 * @param {object} pool
 * @param {object} filters - { company_name, contact_name, phone, source, level, status, customer_type, lifecycle_status, owner_id, start_date, end_date }
 * @param {object} permission - { clause, params } 数据权限片段
 * @returns {Buffer} XLSX 文件 buffer
 */
async function exportCustomers(pool, filters, permission) {
  const {
    company_name, contact_name, phone, source, level, status,
    customer_type, lifecycle_status, owner_id, start_date, end_date
  } = filters;

  const params = [];
  const { clause: permissionClause, params: permParams } = permission;
  params.push(...permParams);

  let whereClause;
  if (status !== undefined && status !== null && status !== '') {
    const mappedStatus = isValidCustomerStatus(status)
      ? status
      : legacyStatusToCode(status);
    if (!mappedStatus) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, '无效的客户状态')
    }
    whereClause = `WHERE ${permissionClause} AND c.status = ?`;
    params.push(mappedStatus);
  } else {
    whereClause = `WHERE ${permissionClause} AND c.deleted_at IS NULL`;
  }

  if (owner_id) { whereClause += ' AND c.owner_id = ?'; params.push(owner_id); }
  if (company_name) { whereClause += ' AND c.company_name LIKE ?'; params.push(`%${company_name}%`); }
  if (contact_name) { whereClause += ' AND pc.name LIKE ?'; params.push(`%${contact_name}%`); }
  if (phone) { whereClause += ' AND pc.phone LIKE ?'; params.push(`%${phone}%`); }
  if (source) {
    if (SOURCE_PARENT_MAP[source]) {
      const children = SOURCE_PARENT_MAP[source];
      whereClause += ` AND c.source IN (${children.map(() => '?').join(',')})`;
      params.push(...children);
    } else {
      whereClause += ' AND c.source = ?';
      params.push(source);
    }
  }
  if (level) { whereClause += ' AND c.level = ?'; params.push(level); }
  if (customer_type) { whereClause += ' AND c.customer_type = ?'; params.push(customer_type); }
  if (lifecycle_status) { whereClause += ' AND c.lifecycle_status = ?'; params.push(lifecycle_status); }
  if (start_date) { whereClause += ' AND c.create_time >= ?'; params.push(start_date); }
  if (end_date) { whereClause += ' AND c.create_time < ?'; params.push(end_date + ' 23:59:59'); }

  const [list] = await pool.query(
    `SELECT c.company_name, pc.name as contact_name, pc.phone, pc.email,
      c.address, c.industry, c.source, c.level,
      c.status, c.customer_type, c.lifecycle_status, c.remark, c.create_time, c.last_follow_time,
      u.real_name as owner_name
    FROM crm_customer c
    LEFT JOIN sys_user u ON c.owner_id = u.id
    LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
    ${whereClause}
    ORDER BY c.create_time DESC
    LIMIT 10000`,
    params
  );

  const exportData = list.map(row => ({
    '公司名称': row.company_name,
    '联系人': row.contact_name || '',
    '电话': row.phone || '',
    '邮箱': row.email || '',
    '地址': row.address || '',
    '行业': row.industry || '',
    '来源': row.source || '',
    '等级': row.level || '',
    '状态': CUSTOMER_STATUS_NAME[row.status] || row.status || '',
    '客户类型': row.customer_type === 'customer' ? '正式客户' : '潜客',
    '生命周期': row.lifecycle_status || '',
    '负责人': row.owner_name || '',
    '最后跟进': row.last_follow_time ? new Date(row.last_follow_time).toISOString().slice(0, 10) : '',
    '创建时间': row.create_time ? new Date(row.create_time).toISOString().slice(0, 10) : '',
    '备注': row.remark || ''
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportData);
  XLSX.utils.book_append_sheet(wb, ws, '客户列表');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  VALID_SOURCES,
  SOURCE_PARENT_MAP,
  canManageCustomer,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerDetail,
  getCustomer360,
  exportCustomers
};
