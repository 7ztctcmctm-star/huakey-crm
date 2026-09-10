/**
 * transferService —— 客户转移（双方同意制）
 *
 * 【业务规则（委托人 2026-09-10 确认）】
 *   1. 销售可发起转移给其他销售，**必须接收人同意**才生效
 *   2. 转移申请**不可撤回** → 状态机无 cancelled
 *   3. 超过 **3 天**未处理 → 自动置 expired（客户仍归原负责人）
 *   4. 老板/管理员走 assignService **直接分配**，不经过本流程（但需填交接备注）
 *
 * 【并发与一致性要点】
 *   · 同意/拒绝都以「原子 UPDATE + affectedRows 校验」实现，避免重复处理与竞态
 *   · 客户归属变更时以 `owner_id = 期望的原负责人` 作为条件，
 *     若期间客户已被他人接手则中止本次转移（不静默覆盖）
 *   · 归属变更与状态流转、pool_log 写入在同一事务内，避免半条数据
 */

const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');
const notificationService = require('./notificationService');

/** 转移状态机：刻意没有 cancelled（申请不可撤回） */
const TRANSFER_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
};

/** 申请有效期（天）。超期由定时任务置为 expired。 */
const EXPIRE_DAYS = 3;

/**
 * 发起转移申请
 * @param {object} pool
 * @param {{customer_id:number, to_user_id:number, reason?:string}} data
 * @param {number} fromUserId 发起人（必须是该客户当前负责人）
 */
async function createTransfer(pool, data, fromUserId) {
  const customerId = Number(data.customer_id);
  const toUserId = Number(data.to_user_id);

  if (!customerId) throw new AppError(ErrorCodes.VALIDATION_ERROR, '客户ID不能为空');
  if (!toUserId) throw new AppError(ErrorCodes.VALIDATION_ERROR, '请选择接收人');
  if (toUserId === fromUserId) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '不能转移给自己');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [customers] = await connection.query(
      'SELECT id, company_name, owner_id FROM crm_customer WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [customerId]
    );
    if (customers.length === 0) throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND);
    const customer = customers[0];

    if (customer.owner_id === null) {
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '该客户当前无负责人，无需转移，可直接认领');
    }
    if (customer.owner_id !== fromUserId) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, '只能转移自己负责的客户');
    }

    const [users] = await connection.query(
      'SELECT id, real_name FROM sys_user WHERE id = ? AND deleted_at IS NULL AND status = 1',
      [toUserId]
    );
    if (users.length === 0) {
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '接收人不存在或已停用');
    }

    // 同一客户不允许多个待处理申请，避免归属歧义
    const [pending] = await connection.query(
      `SELECT id FROM crm_customer_transfer
        WHERE customer_id = ? AND status = ? AND deleted_at IS NULL
        FOR UPDATE`,
      [customerId, TRANSFER_STATUS.PENDING]
    );
    if (pending.length > 0) {
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '该客户已有待处理的转移申请，请等待对方处理');
    }

    const [result] = await connection.query(
      `INSERT INTO crm_customer_transfer
         (customer_id, from_user_id, to_user_id, status, reason, expire_at, create_time)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), NOW())`,
      [customerId, fromUserId, toUserId, TRANSFER_STATUS.PENDING, data.reason || null, EXPIRE_DAYS]
    );

    await connection.commit();

    // 通知放在事务外：通知失败不应回滚已成立的申请
    await notificationService.createNotification(pool, {
      user_id: toUserId,
      type: 'customer_transfer',
      title: '客户转移申请',
      content: `${customer.company_name} 的转移申请待你处理，${EXPIRE_DAYS} 天内未处理将自动失效`,
      link_url: `/customer/detail/${customerId}`
    });

    return { id: result.insertId, customer_id: customerId, to_user_id: toUserId, expire_days: EXPIRE_DAYS };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 接收人同意转移 —— 客户归属正式变更
 */
async function acceptTransfer(pool, transferId, userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, customer_id, from_user_id, to_user_id, status, expire_at
         FROM crm_customer_transfer
        WHERE id = ? AND deleted_at IS NULL
        FOR UPDATE`,
      [transferId]
    );
    if (rows.length === 0) throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '转移申请不存在');
    const transfer = rows[0];

    if (transfer.to_user_id !== userId) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, '只有接收人本人可以处理该申请');
    }
    if (transfer.status !== TRANSFER_STATUS.PENDING) {
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, `该申请已处理（当前状态：${transfer.status}）`);
    }
    if (new Date(transfer.expire_at) <= new Date()) {
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '该申请已超过有效期，请让对方重新发起');
    }

    // 客户归属变更：以「期望的原负责人」为条件，期间被他人接手则中止
    const [claimResult] = await connection.query(
      `UPDATE crm_customer
          SET owner_id = ?, pool_status = 'private', last_follow_time = NOW(), update_time = NOW()
        WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
      [userId, transfer.customer_id, transfer.from_user_id]
    );
    if (claimResult.affectedRows !== 1) {
      throw new AppError(
        ErrorCodes.BUSINESS_VALIDATION,
        '该客户负责人已变更，转移无法完成，请重新发起'
      );
    }

    const [upd] = await connection.query(
      `UPDATE crm_customer_transfer
          SET status = ?, handle_time = NOW()
        WHERE id = ? AND status = ?`,
      [TRANSFER_STATUS.ACCEPTED, transferId, TRANSFER_STATUS.PENDING]
    );
    if (upd.affectedRows !== 1) {
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '该申请已被处理，请刷新后重试');
    }

    await connection.query(
      `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id)
       VALUES (?, 'transfer', ?, ?)`,
      [transfer.customer_id, transfer.from_user_id, userId]
    );

    await connection.commit();

    await notificationService.createNotification(pool, {
      user_id: transfer.from_user_id,
      type: 'customer_transfer',
      title: '客户转移已通过',
      content: '你发起的客户转移申请已被接收人同意，客户归属已变更',
      link_url: `/customer/detail/${transfer.customer_id}`
    });

    return { id: transferId, customer_id: transfer.customer_id, status: TRANSFER_STATUS.ACCEPTED };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 接收人拒绝转移
 */
async function rejectTransfer(pool, transferId, userId, remark) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      'SELECT id, customer_id, from_user_id, to_user_id, status FROM crm_customer_transfer WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [transferId]
    );
    if (rows.length === 0) throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '转移申请不存在');
    const transfer = rows[0];

    if (transfer.to_user_id !== userId) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, '只有接收人本人可以处理该申请');
    }
    if (transfer.status !== TRANSFER_STATUS.PENDING) {
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, `该申请已处理（当前状态：${transfer.status}）`);
    }

    const [upd] = await connection.query(
      `UPDATE crm_customer_transfer
          SET status = ?, handle_remark = ?, handle_time = NOW()
        WHERE id = ? AND status = ?`,
      [TRANSFER_STATUS.REJECTED, remark || null, transferId, TRANSFER_STATUS.PENDING]
    );
    if (upd.affectedRows !== 1) {
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '该申请已被处理，请刷新后重试');
    }

    await connection.commit();

    await notificationService.createNotification(pool, {
      user_id: transfer.from_user_id,
      type: 'customer_transfer',
      title: '客户转移被拒绝',
      content: remark ? `对方拒绝了转移申请，理由：${remark}` : '对方拒绝了你的客户转移申请',
      link_url: `/customer/detail/${transfer.customer_id}`
    });

    return { id: transferId, status: TRANSFER_STATUS.REJECTED };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 超时回流：把超过有效期仍为 pending 的申请置为 expired。
 * 客户归属不受影响（仍归原负责人）。
 * 供定时任务调用。
 */
async function expireTransfers(pool) {
  const [result] = await pool.query(
    `UPDATE crm_customer_transfer
        SET status = ?, handle_time = NOW()
      WHERE status = ? AND expire_at <= NOW() AND deleted_at IS NULL`,
    [TRANSFER_STATUS.EXPIRED, TRANSFER_STATUS.PENDING]
  );
  return { expired: result.affectedRows };
}

/**
 * 我收到的待处理申请（用于通知栏 / 待办）
 */
async function listMyPending(pool, userId, params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(params.pageSize, 10) || 20));
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `SELECT t.id, t.customer_id, t.status, t.reason, t.expire_at, t.create_time,
            c.company_name,
            u.real_name AS from_user_name
       FROM crm_customer_transfer t
       LEFT JOIN crm_customer c ON c.id = t.customer_id
       LEFT JOIN sys_user u ON u.id = t.from_user_id
      WHERE t.to_user_id = ? AND t.status = ? AND t.deleted_at IS NULL
      ORDER BY t.create_time DESC
      LIMIT ? OFFSET ?`,
    [userId, TRANSFER_STATUS.PENDING, pageSize, offset]
  );
  const [cnt] = await pool.query(
    'SELECT COUNT(*) AS total FROM crm_customer_transfer WHERE to_user_id = ? AND status = ? AND deleted_at IS NULL',
    [userId, TRANSFER_STATUS.PENDING]
  );

  return { list: rows, total: cnt[0].total, page, pageSize };
}

/** 某客户的转移记录（含历史） */
async function listByCustomer(pool, customerId) {
  const [rows] = await pool.query(
    `SELECT t.id, t.status, t.reason, t.handle_remark, t.expire_at, t.handle_time, t.create_time,
            uf.real_name AS from_user_name, ut.real_name AS to_user_name
       FROM crm_customer_transfer t
       LEFT JOIN sys_user uf ON uf.id = t.from_user_id
       LEFT JOIN sys_user ut ON ut.id = t.to_user_id
      WHERE t.customer_id = ? AND t.deleted_at IS NULL
      ORDER BY t.create_time DESC`,
    [customerId]
  );
  return rows;
}

module.exports = {
  TRANSFER_STATUS,
  EXPIRE_DAYS,
  createTransfer,
  acceptTransfer,
  rejectTransfer,
  expireTransfers,
  listMyPending,
  listByCustomer
};
