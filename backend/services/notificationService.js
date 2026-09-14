const sseManager = require('../utils/sseManager');

function buildLink(businessType, businessId) {
  if (!businessType) return null;
  if (businessType === 'quote') return '/quote';
  if (businessType === 'contract') return '/contract';
  if (businessType === 'customer') return `/customer/detail/${businessId}`;
  return null;
}

/**
 * 获取通知列表
 * @param {object} pool
 * @param {number} userId
 * @param {object} params - { page, pageSize, unread_only }
 */
async function listNotifications(pool, userId, params = {}) {
  const { page = 1, pageSize = 20, unread_only = false } = params;
  const limit = parseInt(pageSize, 10) || 20;
  const currentPage = parseInt(page, 10) || 1;
  const offset = (currentPage - 1) * limit;

  const readFilter = unread_only ? ' AND is_read = 0' : '';
  const where = `WHERE to_user_id = ? AND is_dismissed = 0${readFilter}`;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_notification ${where}`,
    [userId]
  );

  const [rows] = await pool.query(
    `SELECT id, type, title, content, link_url, business_type, business_id, is_read, create_time as created_at
     FROM crm_notification ${where}
     ORDER BY create_time DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );

  const [[unreadRow]] = await pool.query(
    'SELECT COUNT(*) as count FROM crm_notification WHERE to_user_id = ? AND is_read = 0 AND is_dismissed = 0',
    [userId]
  );

  const list = rows.map(row => ({
    ...row,
    link_url: row.link_url || buildLink(row.business_type, row.business_id)
  }));

  return { list, total: countRows[0].total, unread_count: unreadRow.count };
}

/**
 * 标记单条通知已读
 */
async function markAsRead(pool, id, userId) {
  const [result] = await pool.query(
    'UPDATE crm_notification SET is_read = 1 WHERE id = ? AND to_user_id = ?',
    [id, userId]
  );
  return { affectedRows: result.affectedRows };
}

/**
 * 标记全部通知已读
 */
async function markAllAsRead(pool, userId) {
  const [result] = await pool.query(
    'UPDATE crm_notification SET is_read = 1 WHERE to_user_id = ? AND is_read = 0',
    [userId]
  );
  return { affectedRows: result.affectedRows };
}

/**
 * 获取未读通知数
 */
async function getUnreadCount(pool, userId) {
  const [[row]] = await pool.query(
    'SELECT COUNT(*) as count FROM crm_notification WHERE to_user_id = ? AND is_read = 0 AND is_dismissed = 0',
    [userId]
  );
  return { count: row.count };
}

/**
 * 创建通知并推送 SSE
 *
 * @param {object} data
 * @param {number} data.user_id       接收人
 * @param {string} data.type          通知类型
 * @param {string} data.title
 * @param {string} [data.content]
 * @param {string} [data.link_url]    不传时若给了 business_type/business_id 则由 buildLink 派生
 * @param {string} [data.business_type] 关联业务类型（用于按业务消除通知）
 * @param {number} [data.business_id]   关联业务记录 ID
 */
async function createNotification(pool, data) {
  const { user_id, type, title, content, link_url, business_type, business_id } = data;
  const resolvedLink = link_url || buildLink(business_type, business_id);
  const [result] = await pool.query(
    `INSERT INTO crm_notification
       (to_user_id, type, title, content, link_url, business_type, business_id, is_read, is_dismissed, create_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NOW())`,
    [user_id, type, title, content, resolvedLink || null, business_type || null, business_id ?? null]
  );

  const notification = {
    id: result.insertId,
    user_id,
    type,
    title,
    content,
    link_url: resolvedLink || null,
    business_type: business_type || null,
    business_id: business_id ?? null,
    is_read: 0,
    created_at: new Date().toISOString()
  };

  sseManager.send(user_id, { type: 'notification', data: notification });
  return { id: result.insertId };
}

/**
 * 按业务消除通知（业务已处理完毕 → 相关通知标记为已处理 + 已读）
 *
 * 为什么需要：报价/合同/审批通过后，原「待审批」通知若不清除，
 * 铃铛角标会常亮（已处理的事仍提示未读）。
 *
 * @param {object} pool
 * @param {string} businessType 业务类型（如 'quote' / 'contract' / 'customer_transfer'）
 * @param {number} businessId   业务记录 ID
 */
async function dismissByBusiness(pool, businessType, businessId) {
  const [result] = await pool.query(
    `UPDATE crm_notification
        SET is_dismissed = 1, is_read = 1
      WHERE business_type = ? AND business_id = ? AND is_dismissed = 0`,
    [businessType, businessId]
  );
  return { affectedRows: result.affectedRows };
}

module.exports = {
  listNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  createNotification,
  dismissByBusiness
};
