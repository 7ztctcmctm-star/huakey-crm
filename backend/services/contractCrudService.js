/**
 * 合同CRUD服务层
 * 从 routes/contract/crud.js 提取的业务逻辑
 */

const ROLES = require('../config/roles');
const contractService = require('./contractService');
const { paginatedQuery } = require('../utils/pagination');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

// 回款状态子查询条件
const PAYMENT_STATUS_CLAUSE = {
  overdue: `EXISTS (SELECT 1 FROM crm_payment_plan pp WHERE pp.contract_id = c.id AND pp.status = 'overdue')`,
  partial: `EXISTS (SELECT 1 FROM crm_payment p WHERE p.contract_id = c.id AND p.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM crm_payment_plan pp WHERE pp.contract_id = c.id AND pp.status != 'completed')`,
  completed: `EXISTS (SELECT 1 FROM crm_payment_plan pp WHERE pp.contract_id = c.id) AND NOT EXISTS (SELECT 1 FROM crm_payment_plan pp WHERE pp.contract_id = c.id AND pp.status != 'completed')`,
  pending: `NOT EXISTS (SELECT 1 FROM crm_payment p WHERE p.contract_id = c.id AND p.deleted_at IS NULL)`
};

/**
 * 合同列表（分页、筛选、权限）
 * @param {object} pool
 * @param {object} params - { page, pageSize, keyword, status, customer_id, approval_status, payment_status }
 * @param {object} [permission] - { clause, params } 数据权限片段
 * @returns {{ list: Array, total: number }}
 */
async function listContracts(pool, params = {}, permission = null) {
  const {
    page = 1, pageSize = 10, keyword = '', status = '',
    customer_id = '', approval_status = '', payment_status = ''
  } = params;

  let permissionClause = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionClause = permission.clause;
    permParams = permission.params || [];
  }

  let whereClause = `WHERE c.deleted_at IS NULL AND ${permissionClause}`;
  const queryParams = [...permParams];

  if (keyword) {
    whereClause += ' AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)';
    queryParams.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (status) {
    whereClause += ' AND c.status = ?';
    queryParams.push(status);
  }
  if (customer_id) {
    whereClause += ' AND c.customer_id = ?';
    queryParams.push(customer_id);
  }
  if (approval_status) {
    whereClause += ' AND c.approval_status = ?';
    queryParams.push(approval_status);
  }
  if (payment_status && PAYMENT_STATUS_CLAUSE[payment_status]) {
    whereClause += ` AND ${PAYMENT_STATUS_CLAUSE[payment_status]}`;
  }

  return paginatedQuery(pool, {
    baseQuery: `SELECT c.id, c.contract_no, c.customer_id, c.opportunity_id, c.amount, c.currency, c.exchange_rate, c.sign_date, c.delivery_date, c.payment_terms, c.status, c.approval_status, c.approver_id, c.approval_remark, c.remark, c.file_url, c.create_by, c.create_time, c.deleted_at, c.quote_id,
           cu.company_name as customer_name, u.real_name as create_by_name,
    (SELECT COALESCE(SUM(p.pay_amount), 0) FROM crm_payment p WHERE p.contract_id = c.id AND p.deleted_at IS NULL) as paid_amount,
    (SELECT COALESCE(SUM(pp.plan_amount), 0) FROM crm_payment_plan pp WHERE pp.contract_id = c.id) as plan_total,
    cur.symbol as currency_symbol
    FROM crm_contract c
    LEFT JOIN crm_customer cu ON c.customer_id = cu.id
    LEFT JOIN sys_user u ON c.create_by = u.id
    LEFT JOIN crm_currency cur ON c.currency = cur.code COLLATE utf8mb4_unicode_ci
    ${whereClause}`,
    countQuery: `SELECT COUNT(*) as total FROM crm_contract c
    LEFT JOIN crm_customer cu ON c.customer_id = cu.id
    ${whereClause}`,
    params: queryParams,
    page,
    pageSize,
    orderBy: 'c.create_time DESC'
  });
}

/**
 * 合同详情（含权限校验）
 * @param {object} pool
 * @param {number} id
 * @param {object} [permission] - { clause, params }
 * @returns {object|null}
 */
async function getContractDetail(pool, id, permission = null) {
  if (permission && permission.clause) {
    const [permCheck] = await pool.query(
      `SELECT c.id FROM crm_contract c WHERE c.id = ? AND c.deleted_at IS NULL AND ${permission.clause}`,
      [id, ...permission.params]
    );
    if (!permCheck.length) return null;
  }

  return contractService.getContract(pool, id);
}

/**
 * 创建合同后发送审批通知
 * @param {object} pool
 * @param {number} contractId
 * @param {string} contractNo
 * @param {number} amount
 * @param {number} customerId
 * @param {number} userId
 */
async function createContractNotification(pool, contractId, contractNo, amount, customerId, userId) {
  try {
    const [custInfo] = await pool.query('SELECT company_name FROM crm_customer WHERE id = ? AND deleted_at IS NULL', [customerId]);
    const customerName = custInfo.length > 0 ? custInfo[0].company_name : '未知客户';
    const [userInfo] = await pool.query('SELECT real_name FROM sys_user WHERE id = ?', [userId]);
    const userName = userInfo.length > 0 ? userInfo[0].real_name : '未知';
    await pool.query(
      `INSERT INTO crm_notification (type, title, content, business_type, business_id, from_user_id, to_role_id)
       SELECT 'contract_approval', ?, ?, 'contract', ?, ?, r.id
       FROM sys_role r
       WHERE (r.manage_all IS TRUE OR r.id IN (1, 2))
         AND NOT EXISTS (
           SELECT 1 FROM crm_notification n
           WHERE n.business_type = 'contract' AND n.business_id = ? AND n.to_role_id = r.id AND n.is_dismissed = 0
         )`,
      [
        '新合同待审批',
        `${userName} 为客户"${customerName}"创建合同 ${contractNo}，金额 ¥${amount}，待审批`,
        contractId,
        userId,
        contractId
      ]
    );
  } catch (error) {
    console.error('[合同] 创建合同通知失败（不影响主流程）:', error);
  }
}

/**
 * 更新合同（事务保护，含回款计划）
 * @param {object} pool
 * @param {object} data - { id, customer_id, opportunity_id, amount, sign_date, delivery_date, payment_terms, status, remark, plans, delete_plan_ids }
 * @returns {object|null} oldData - 旧合同数据，用于字段变更日志
 */
async function updateContract(pool, data) {
  const { id, customer_id, opportunity_id, amount, sign_date, delivery_date, payment_terms, status, remark, plans, delete_plan_ids } = data;
  const connection = await pool.getConnection();

  try {
    const [oldRows] = await pool.query(
      'SELECT customer_id, opportunity_id, amount, sign_date, delivery_date, payment_terms, status, remark FROM crm_contract WHERE id=? AND deleted_at IS NULL',
      [id]
    );
    const oldData = oldRows.length > 0 ? oldRows[0] : null;

    await connection.beginTransaction();

    await connection.query(
      'UPDATE crm_contract SET customer_id=?, opportunity_id=?, amount=?, sign_date=?, delivery_date=?, payment_terms=?, status=?, remark=? WHERE id=?',
      [customer_id, opportunity_id || null, amount, sign_date, delivery_date, payment_terms, status, remark, id]
    );

    if (delete_plan_ids && delete_plan_ids.length > 0) {
      const phs = delete_plan_ids.map(() => '?').join(', ');
      await connection.query(`DELETE FROM crm_payment_plan WHERE id IN (${phs})`, delete_plan_ids);
    }

    if (plans && plans.length > 0) {
      for (const plan of plans) {
        if (plan.id) {
          await connection.query(
            'UPDATE crm_payment_plan SET plan_date=?, plan_amount=?, remark=? WHERE id=?',
            [plan.plan_date, plan.plan_amount, plan.remark || null, plan.id]
          );
        } else {
          await connection.query(
            'INSERT INTO crm_payment_plan (contract_id, plan_date, plan_amount, remark) VALUES (?, ?, ?, ?)',
            [id, plan.plan_date, plan.plan_amount, plan.remark || null]
          );
        }
      }
    }

    await connection.commit();
    return oldData;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 删除合同（软删除，含关联数据）
 * @param {object} pool
 * @param {number} id
 * @param {object} user - { manageAll, roleId, userId }
 * @returns {{ code: number, message: string }}
 */
async function deleteContract(pool, id, user) {
  const [contract] = await pool.query('SELECT status, create_by FROM crm_contract WHERE id=? AND deleted_at IS NULL', [id]);
  if (!contract.length) {
    throw new AppError(ErrorCodes.CONTRACT_NOT_FOUND);
  }
  if (contract[0].status === 3) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '已终止的合同不能删除');
  }

  const { manageAll, roleId, userId } = user;
  if (!manageAll && ![ROLES.ADMIN, ROLES.MANAGER].includes(roleId) && contract[0].create_by !== userId) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权删除该合同');
  }

  await pool.query('UPDATE crm_contract SET deleted_at = NOW() WHERE id=?', [id]);
  await pool.query('UPDATE crm_payment SET deleted_at = NOW() WHERE contract_id=? AND deleted_at IS NULL', [id]);
  await pool.query('UPDATE crm_payment_plan SET deleted_at = NOW() WHERE contract_id=? AND deleted_at IS NULL', [id]);

  return { message: '删除合同成功' };
}

/**
 * 合同搜索（轻量级）
 * @param {object} pool
 * @param {string} keyword
 * @returns {Array}
 */
async function searchContracts(pool, keyword) {
  if (!keyword || keyword.length < 1) return [];

  const [rows] = await pool.query(
    `SELECT c.id, c.contract_no, cu.company_name, c.amount
     FROM crm_contract c
     JOIN crm_customer cu ON c.customer_id = cu.id
     WHERE c.deleted_at IS NULL AND c.status IN (1, 2)
       AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)
     ORDER BY c.create_time DESC LIMIT 20`,
    [`%${keyword}%`, `%${keyword}%`]
  );
  return rows;
}

/**
 * 商机列表（供合同关联选择）
 * @param {object} pool
 * @param {object} [permission] - { clause, params }
 * @returns {Array}
 */
async function getOpportunityList(pool, permission = null) {
  let permissionClause = '1=1';
  let permParams = [];
  if (permission && permission.clause) {
    permissionClause = permission.clause;
    permParams = permission.params || [];
  }

  const [rows] = await pool.query(
    `SELECT o.id, o.name FROM crm_opportunity o WHERE ${permissionClause} AND o.stage != 5 AND o.stage != 6 AND o.deleted_at IS NULL ORDER BY o.name`,
    permParams
  );
  return rows;
}

module.exports = {
  listContracts,
  getContractDetail,
  createContractNotification,
  updateContract,
  deleteContract,
  searchContracts,
  getOpportunityList
};
