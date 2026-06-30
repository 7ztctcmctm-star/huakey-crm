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
 */
async function createNotification(pool, data) {
  const { user_id, type, title, content, link_url } = data;
  const [result] = await pool.query(
    `INSERT INTO crm_notification (to_user_id, type, title, content, link_url, is_read, is_dismissed, create_time)
     VALUES (?, ?, ?, ?, ?, 0, 0, NOW())`,
    [user_id, type, title, content, link_url || null]
  );

  const notification = {
    id: result.insertId,
    user_id,
    type,
    title,
    content,
    link_url: link_url || null,
    is_read: 0,
    created_at: new Date().toISOString()
  };

  sseManager.send(user_id, { type: 'notification', data: notification });
  return { id: result.insertId };
}

module.exports = {
  listNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  createNotification
};
