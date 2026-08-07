/**
 * poolService.refactored.js —— 公海服务样板
 *
 * 重构要点（对照评审报告 C2）：
 * 1. 所有 `return { error, status, ... }` 改为 `throw new AppError(ErrorCodes.XXX, message, details)`
 * 2. 调用方（controller）不再判 `result.error`，直接 await + res.json；错误由 appErrorHandler 渲染
 * 3. 保护期这类需要回传 details 的错误，用 AppError 第三参 details 携带（appErrorHandler 已支持 toJSON 带出 data）
 * 4. 批量操作里的“软跳过”（skipped）保留返回值，因为那是部分成功、不是错误
 *
 * 使用：直接覆盖 backend/services/poolService.js（导出签名不变）
 */

const ROLES = require('../config/roles')
const { CUSTOMER_STATUS } = require('../constants/customerStatus')
const { POOL_STATUS } = require('../constants/poolStatus')
const AppError = require('../errors/AppError')
const ErrorCodes = require('../errors/codes')

// 权限判定抽出来，避免重复
function canManagePrivatePool(user) {
  return user.manageAll || user.roleId === ROLES.ADMIN || user.roleId === ROLES.MANAGER
}

/**
 * 获取公海客户列表（本方法原本就不返回 error，保持不变）
 */
async function listPoolCustomers(pool, { page = 1, pageSize = 10, company_name, industry, source, level, pool_type }, sourceParentMap) {
  const offset = (page - 1) * pageSize
  const params = []

  let whereClause = 'WHERE c.owner_id IS NULL AND c.deleted_at IS NULL'

  if (company_name) {
    whereClause += ' AND c.company_name LIKE ?'
    params.push(`%${company_name}%`)
  }
  if (industry) {
    whereClause += ' AND c.industry = ?'
    params.push(industry)
  }
  if (source) {
    if (sourceParentMap && sourceParentMap[source]) {
      const children = sourceParentMap[source]
      whereClause += ` AND c.source IN (${children.map(() => '?').join(',')})`
      params.push(...children)
    } else {
      whereClause += ' AND c.source = ?'
      params.push(source)
    }
  }
  if (level) {
    whereClause += ' AND c.level = ?'
    params.push(level)
  }
  if (pool_type) {
    whereClause += ' AND c.pool_type = ?'
    params.push(pool_type)
  }

  const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM crm_customer c ${whereClause}`, params)
  const total = countResult[0].total

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
  )

  return { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }
}

/**
 * 认领公海客户
 * 变更：return { error } → throw AppError；保护期用 details 携带 protect_until
 */
async function claimCustomer(pool, customer_id, userId, user) {
  if (!customer_id) throw new AppError(ErrorCodes.VALIDATION_ERROR, '客户ID不能为空');

  const [customers] = await pool.query(
    'SELECT id, pool_status, pool_type, protect_until, owner_id, company_name FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customer_id]
  )

  if (customers.length === 0) throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, '客户不存在');

  const customer = customers[0]

  if (customer.owner_id !== null) throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '该客户不在公海中');

  // 判断来源：线索池(lead) 还是 公海(sea)
  const isLead = customer.status === CUSTOMER_STATUS.LEAD

  // 公海私有池权限检查（线索池不限制）
  if (!isLead && customer.pool_type === 'private' && !canManagePrivatePool(user)) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '私有池客户仅管理员可认领');
  }

  // 公海保护期检查（线索池无保护期）
  if (!isLead && customer.protect_until && new Date(customer.protect_until) > new Date()) {
    const remainDays = Math.ceil((new Date(customer.protect_until) - new Date()) / (1000 * 60 * 60 * 24))
    throw new AppError(
      ErrorCodes.BUSINESS_VALIDATION,
      `该客户在保护期内，还需等待 ${remainDays} 天`,
      { protect_until: customer.protect_until }
    );
  }

  // 线索池认领无保护期，公海认领有 7 天保护期
  const protectUntil = isLead ? null : new Date()
  if (protectUntil) protectUntil.setDate(protectUntil.getDate() + 7)

  await pool.query(
    'UPDATE crm_customer SET pool_status = ?, owner_id = ?, protect_until = ?, status = ?, last_follow_time = NOW() WHERE id = ?',
    [POOL_STATUS.PRIVATE, userId, protectUntil, CUSTOMER_STATUS.FOLLOWING, customer_id]
  )

  await pool.query(
    `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id) VALUES (?, 'claim', ?, ?)`,
    [customer_id, customer.owner_id, userId]
  )

  return { protect_until: protectUntil, company_name: customer.company_name }
}

/**
 * 批量认领公海客户
 * 变更：入参校验 throw AppError；单条跳过仍走 skipped（部分成功语义）
 */
async function batchClaimCustomers(pool, customer_ids, userId, user) {
  if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '请选择要认领的客户');
  }
  if (customer_ids.length > 20) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '单次批量认领不能超过20条');
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    let claimed = 0
    const skipped = []
    const now = new Date()

    for (const customerId of customer_ids) {
      const [customers] = await connection.query(
        'SELECT id, pool_status, pool_type, protect_until, owner_id, company_name FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
        [customerId]
      )

      if (customers.length === 0) { skipped.push(`${customerId}(不存在)`); continue }
      const customer = customers[0]

      if (customer.owner_id !== null) { skipped.push(`${customer.company_name}(不在公海)`); continue }
      if (customer.pool_type === 'private' && !canManagePrivatePool(user)) {
        skipped.push(`${customer.company_name}(私有池限制)`); continue
      }

      if (customer.protect_until && new Date(customer.protect_until) > now) {
        const remainDays = Math.ceil((new Date(customer.protect_until) - now) / (1000 * 60 * 60 * 24))
        skipped.push(`${customer.company_name}(保护期剩余${remainDays}天)`); continue
      }

      const protectUntil = new Date(now)
      protectUntil.setDate(protectUntil.getDate() + 7)

      await connection.query(
        'UPDATE crm_customer SET pool_status = ?, owner_id = ?, protect_until = ?, status = ?, last_follow_time = NOW() WHERE id = ?',
        [POOL_STATUS.PRIVATE, userId, protectUntil, CUSTOMER_STATUS.FOLLOWING, customerId]
      )
      await connection.query(
        `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id) VALUES (?, 'claim', ?, ?)`,
        [customerId, customer.owner_id, userId]
      )

      claimed++
    }

    await connection.commit()
    return { claimed, skipped }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

/**
 * 释放客户到公海
 */
async function releaseCustomer(pool, customer_id, userId, user) {
  if (!customer_id) throw new AppError(ErrorCodes.VALIDATION_ERROR, '客户ID不能为空');

  const [customers] = await pool.query(
    'SELECT id, owner_id, company_name FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
    [customer_id]
  )

  if (customers.length === 0) throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, '客户不存在');

  const customer = customers[0]

  const isPrivileged = user.roleId === ROLES.ADMIN || user.roleId === ROLES.MANAGER || user.roleId === ROLES.SALES
  if (!isPrivileged && customer.owner_id !== userId) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权释放该客户');
  }

  await pool.query(
    'UPDATE crm_customer SET pool_status = ?, owner_id = NULL, protect_until = NULL, status = ? WHERE id = ?',
    [POOL_STATUS.SEA, CUSTOMER_STATUS.SEA, customer_id]
  )
  await pool.query(
    `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id) VALUES (?, 'release', ?, NULL)`,
    [customer_id, userId]
  )

  return { company_name: customer.company_name }
}

/**
 * 批量释放客户到公海
 */
async function batchReleaseCustomers(pool, customer_ids, userId, user) {
  if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '请选择要释放的客户');
  }
  if (customer_ids.length > 100) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '单次批量操作不能超过100条');
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    let successCount = 0
    for (const customerId of customer_ids) {
      const [customers] = await connection.query(
        'SELECT id, owner_id, pool_status FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
        [customerId]
      )

      if (customers.length === 0) continue
      const customer = customers[0]

      const isPrivileged = user.roleId === ROLES.ADMIN || user.roleId === ROLES.MANAGER || user.roleId === ROLES.SALES
      if (!isPrivileged && customer.owner_id !== userId) continue
      if (customer.owner_id === null) continue

      await connection.query(
        'UPDATE crm_customer SET pool_status = ?, owner_id = NULL, protect_until = NULL, status = ? WHERE id = ?',
        [POOL_STATUS.SEA, CUSTOMER_STATUS.SEA, customerId]
      )
      await connection.query(
        `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id) VALUES (?, 'release', ?, NULL)`,
        [customerId, userId]
      )

      successCount++
    }

    await connection.commit()
    return { count: successCount }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

/**
 * 获取公海操作日志（无错误分支，保持不变）
 */
async function getPoolLogs(pool, { customer_id, page = 1, pageSize = 20 }) {
  const offset = (page - 1) * pageSize
  const params = []

  let whereClause = '1=1'
  if (customer_id) {
    whereClause += ' AND pl.customer_id = ?'
    params.push(customer_id)
  }

  const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM crm_pool_log pl WHERE ${whereClause}`, params)
  const total = countResult[0].total

  const [list] = await pool.query(
    `SELECT pl.id, pl.customer_id, pl.action, pl.from_user_id, pl.to_user_id, pl.create_time, pl.deleted_at,
      cu.real_name as from_user_name,
      cu2.real_name as to_user_name,
      c.company_name
    FROM crm_pool_log pl
    LEFT JOIN crm_customer c ON pl.customer_id = c.id
    LEFT JOIN sys_user cu ON pl.from_user_id = cu.id
    LEFT JOIN sys_user cu2 ON pl.to_user_id = cu.id
    WHERE ${whereClause}
    ORDER BY pl.create_time DESC
    LIMIT ? OFFSET ?`,
    [...params, parseInt(pageSize), parseInt(offset)]
  )

  return { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }
}

module.exports = {
  listPoolCustomers,
  claimCustomer,
  batchClaimCustomers,
  releaseCustomer,
  batchReleaseCustomers,
  getPoolLogs
}
