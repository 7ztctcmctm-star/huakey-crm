// 客户公海服务
// 从 routes/customer/pool.js 提取的业务逻辑

const ROLES = require('../config/roles');
const { CUSTOMER_STATUS } = require('../constants/customerStatus');

/**
 * 获取公海客户列表
 */
async function listPoolCustomers(pool, { page = 1, pageSize = 10, company_name, industry, source, level, pool_type }, sourceParentMap) {
  const offset = (page - 1) * pageSize;
  const params = [];

  let whereClause = 'WHERE c.owner_id IS NULL AND c.deleted_at IS NULL';

  if (company_name) {
    whereClause += ' AND c.company_name LIKE ?';
    params.push(`%${company_name}%`);
  }
  if (industry) {
    whereClause += ' AND c.industry = ?';
    params.push(industry);
  }
  if (source) {
    if (sourceParentMap && sourceParentMap[source]) {
      const children = sourceParentMap[source];
      whereClause += ` AND c.source IN (${children.map(() => '?').join(',')})`;
      params.push(...children);
    } else {
      whereClause += ' AND c.source = ?';
      params.push(source);
    }
  }
  if (level) {
    whereClause += ' AND c.level = ?';
    params.push(level);
  }
  if (pool_type) {
    whereClause += ' AND c.pool_type = ?';
    params.push(pool_type);
  }

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_customer c ${whereClause}`,
    params
  );
  const total = countResult[0].total;

  const [list] = await pool.query(
    `SELECT c.id, c.company_name,
      pc.name as primary_contact_name, pc.phone as primary_contact_phone, pc.email as primary_contact_email,
      c.industry, c.source, c.level, c.status,
      c.pool_status, c.pool_type, c.protect_until, c.last_follow_time,
      c.create_time, c.update_time,
      u.real_name as owner_name
    FROM crm_customer c
    LEFT JOIN sys_user u ON c.owner_id = u.id
    LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
    ${whereClause}
    ORDER BY c.protect_until IS NULL ASC, c.protect_until ASC, c.create_time DESC
    LIMIT ? OFFSET ?`,
    [...params, parseInt(pageSize), parseInt(offset)]
  );

  return { list, total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

/**
 * 认领公海客户
 */
async function claimCustomer(pool, customer_id, userId, user) {
  if (!customer_id) return { error: '客户ID不能为空', status: 400 };

  const [customers] = await pool.query(
    'SELECT id, pool_status, pool_type, protect_until, owner_id, company_name FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customer_id]
  );

  if (customers.length === 0) return { error: '客户不存在', status: 404 };

  const customer = customers[0];

  if (customer.owner_id !== null) return { error: '该客户不在公海中', status: 400 };

  if (customer.pool_type === 'private' && !user.manageAll && user.roleId !== ROLES.ADMIN && user.roleId !== ROLES.MANAGER) {
    return { error: '私有池客户仅管理员可认领', status: 403 };
  }

  if (customer.protect_until && new Date(customer.protect_until) > new Date()) {
    const remainDays = Math.ceil((new Date(customer.protect_until) - new Date()) / (1000 * 60 * 60 * 24));
    return { error: `该客户在保护期内，还需等待 ${remainDays} 天`, status: 400, protect_until: customer.protect_until };
  }

  const protectUntil = new Date();
  protectUntil.setDate(protectUntil.getDate() + 7);

  await pool.query(
    'UPDATE crm_customer SET pool_status = 0, owner_id = ?, protect_until = ?, status = ?, last_follow_time = NOW() WHERE id = ?',
    [userId, protectUntil, CUSTOMER_STATUS.FOLLOWING, customer_id]
  );

  await pool.query(
    `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id)
     VALUES (?, 'claim', ?, ?)`,
    [customer_id, customer.owner_id, userId]
  );

  return { protect_until: protectUntil, company_name: customer.company_name };
}

/**
 * 批量认领公海客户
 */
async function batchClaimCustomers(pool, customer_ids, userId, user) {
  if (!customer_ids || !Array.isArray(customer_ids) || customer_ids.length === 0) {
    return { error: '请选择要认领的客户', status: 400 };
  }
  if (customer_ids.length > 20) {
    return { error: '单次批量认领不能超过20条', status: 400 };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let claimed = 0;
    const skipped = [];
    const now = new Date();

    for (const customerId of customer_ids) {
      const [customers] = await connection.query(
        'SELECT id, pool_status, pool_type, protect_until, owner_id, company_name FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
        [customerId]
      );

      if (customers.length === 0) { skipped.push(`${customerId}(不存在)`); continue; }
      const customer = customers[0];

      if (customer.owner_id !== null) { skipped.push(`${customer.company_name}(不在公海)`); continue; }

      if (customer.pool_type === 'private' && !user.manageAll && user.roleId !== ROLES.ADMIN && user.roleId !== ROLES.MANAGER) {
        skipped.push(`${customer.company_name}(私有池限制)`); continue;
      }

      if (customer.protect_until && new Date(customer.protect_until) > now) {
        const remainDays = Math.ceil((new Date(customer.protect_until) - now) / (1000 * 60 * 60 * 24));
        skipped.push(`${customer.company_name}(保护期剩余${remainDays}天)`); continue;
      }

      const protectUntil = new Date(now);
      protectUntil.setDate(protectUntil.getDate() + 7);

      await connection.query(
        'UPDATE crm_customer SET pool_status = 0, owner_id = ?, protect_until = ?, status = ?, last_follow_time = NOW() WHERE id = ?',
        [userId, protectUntil, CUSTOMER_STATUS.FOLLOWING, customerId]
      );

      await connection.query(
        'INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id) VALUES (?, \'claim\', ?, ?)',
        [customerId, customer.owner_id, userId]
      );

      claimed++;
    }

    await connection.commit();
    return { claimed, skipped };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 释放客户到公海
 */
async function releaseCustomer(pool, customer_id, userId, user) {
  if (!customer_id) return { error: '客户ID不能为空', status: 400 };

  const [customers] = await pool.query(
    'SELECT id, owner_id, company_name FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customer_id]
  );

  if (customers.length === 0) return { error: '客户不存在', status: 404 };

  const customer = customers[0];

  if (user.roleId !== ROLES.ADMIN && user.roleId !== ROLES.MANAGER && user.roleId !== ROLES.SALES) {
    if (customer.owner_id !== userId) return { error: '无权释放该客户', status: 403 };
  }

  await pool.query(
    'UPDATE crm_customer SET pool_status = 1, owner_id = NULL, protect_until = NULL, status = ? WHERE id = ?',
    [CUSTOMER_STATUS.SEA, customer_id]
  );

  await pool.query(
    `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id)
     VALUES (?, 'release', ?, NULL)`,
    [customer_id, userId]
  );

  return { company_name: customer.company_name };
}

/**
 * 批量释放客户到公海
 */
async function batchReleaseCustomers(pool, customer_ids, userId, user) {
  if (!customer_ids || !Array.isArray(customer_ids) || customer_ids.length === 0) {
    return { error: '请选择要释放的客户', status: 400 };
  }
  if (customer_ids.length > 100) {
    return { error: '单次批量操作不能超过100条', status: 400 };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let successCount = 0;
    for (const customerId of customer_ids) {
      const [customers] = await connection.query(
        'SELECT id, owner_id, pool_status FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
        [customerId]
      );

      if (customers.length === 0) continue;
      const customer = customers[0];

      if (user.roleId !== ROLES.ADMIN && user.roleId !== ROLES.MANAGER && user.roleId !== ROLES.SALES) {
        if (customer.owner_id !== userId) continue;
      }

      if (customer.owner_id === null) continue;

      await connection.query(
        'UPDATE crm_customer SET pool_status = 1, owner_id = NULL, protect_until = NULL, status = ? WHERE id = ?',
        [CUSTOMER_STATUS.SEA, customerId]
      );

      await connection.query(
        `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id)
         VALUES (?, 'release', ?, NULL)`,
        [customerId, userId]
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
 * 获取公海操作日志
 */
async function getPoolLogs(pool, { customer_id, page = 1, pageSize = 20 }) {
  const offset = (page - 1) * pageSize;
  const params = [];

  let whereClause = '1=1';
  if (customer_id) {
    whereClause += ' AND pl.customer_id = ?';
    params.push(customer_id);
  }

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_pool_log pl WHERE ${whereClause}`,
    params
  );
  const total = countResult[0].total;

  const [list] = await pool.query(
    `SELECT pl.*,
      cu.real_name as from_user_name,
      cu2.real_name as to_user_name,
      c.company_name
    FROM crm_pool_log pl
    LEFT JOIN crm_customer c ON pl.customer_id = c.id
    LEFT JOIN sys_user cu ON pl.from_user_id = cu.id
    LEFT JOIN sys_user cu2 ON pl.to_user_id = cu2.id
    WHERE ${whereClause}
    ORDER BY pl.create_time DESC
    LIMIT ? OFFSET ?`,
    [...params, parseInt(pageSize), parseInt(offset)]
  );

  return { list, total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

module.exports = {
  listPoolCustomers,
  claimCustomer,
  batchClaimCustomers,
  releaseCustomer,
  batchReleaseCustomers,
  getPoolLogs
};
