/**
 * 社媒路由服务层
 * 从 routes/social.js 提取的业务逻辑，供路由层复用
 */

/**
 * 沟通记录列表
 * @param {object} pool
 * @param {object} params - { customer_id, contact_id, platform, page, pageSize }
 * @returns {{ list: Array, total: number }}
 */
async function listRecords(pool, params = {}) {
  const { customer_id, contact_id, platform, page = 1, pageSize = 20 } = params;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = 'WHERE 1=1 AND s.deleted_at IS NULL';
  const queryParams = [];
  if (customer_id) { where += ' AND s.customer_id = ?'; queryParams.push(customer_id); }
  if (contact_id) { where += ' AND s.contact_id = ?'; queryParams.push(contact_id); }
  if (platform) { where += ' AND s.platform = ?'; queryParams.push(platform); }

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_social_contact s ${where}`, queryParams);
  const [rows] = await pool.query(`
    SELECT s.*, c.company_name as customer_name, ct.name as contact_name, u.real_name as create_by_name
    FROM crm_social_contact s
    LEFT JOIN crm_customer c ON s.customer_id = c.id
    LEFT JOIN crm_contact ct ON s.contact_id = ct.id
    LEFT JOIN sys_user u ON s.create_by = u.id
    ${where} ORDER BY s.message_time DESC LIMIT ? OFFSET ?
  `, [...queryParams, parseInt(pageSize), offset]);

  return { list: rows, total };
}

/**
 * 创建沟通记录
 * @param {object} pool
 * @param {object} data - { customer_id, contact_id, platform, direction, content, attachment_url, message_time }
 * @param {number} userId
 * @returns {{ id: number }}
 */
async function createRecord(pool, data, userId) {
  const { customer_id, contact_id, platform, direction, content, attachment_url, message_time } = data;
  if (!platform || !direction) {
    const err = new Error('平台和方向必填');
    err.code = 400;
    throw err;
  }
  const [result] = await pool.query(
    'INSERT INTO crm_social_contact (customer_id, contact_id, platform, direction, content, attachment_url, message_time, create_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [customer_id || null, contact_id || null, platform, direction, content || null, attachment_url || null, message_time || null, userId]
  );
  return { id: result.insertId };
}

/**
 * 更新记录
 * @param {object} pool
 * @param {number|string} id
 * @param {object} data - { platform, direction, content, attachment_url, message_time }
 */
async function updateRecord(pool, id, data) {
  const { platform, direction, content, attachment_url, message_time } = data;
  const fields = [], values = [];
  if (platform !== undefined) { fields.push('platform = ?'); values.push(platform); }
  if (direction !== undefined) { fields.push('direction = ?'); values.push(direction); }
  if (content !== undefined) { fields.push('content = ?'); values.push(content); }
  if (attachment_url !== undefined) { fields.push('attachment_url = ?'); values.push(attachment_url); }
  if (message_time !== undefined) { fields.push('message_time = ?'); values.push(message_time); }
  if (fields.length === 0) {
    const err = new Error('没有要更新的字段');
    err.code = 400;
    throw err;
  }
  values.push(id);
  await pool.query(`UPDATE crm_social_contact SET ${fields.join(', ')} WHERE id = ?`, values);
}

/**
 * 删除记录（软删除，含权限校验）
 * @param {object} pool
 * @param {number|string} id
 * @param {number} userId
 * @param {boolean} manageAll
 */
async function deleteRecord(pool, id, userId, manageAll) {
  const [[record]] = await pool.query('SELECT create_by FROM crm_social_contact WHERE id = ?', [id]);
  if (!record) {
    const err = new Error('记录不存在');
    err.code = 404;
    throw err;
  }
  if (record.create_by !== userId && !manageAll) {
    const err = new Error('无权删除此记录');
    err.code = 403;
    throw err;
  }

  await pool.query('UPDATE crm_social_contact SET deleted_at = NOW() WHERE id = ?', [id]);
}

/**
 * 社媒统计
 * @param {object} pool
 * @returns {{ total: number, week_new: number, platform_dist: Array, trend: Array }}
 */
async function getStats(pool) {
  const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM crm_social_contact WHERE deleted_at IS NULL');
  const [[{ week_new }]] = await pool.query("SELECT COUNT(*) as week_new FROM crm_social_contact WHERE deleted_at IS NULL AND create_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)");
  const [platformDist] = await pool.query('SELECT platform, COUNT(*) as count FROM crm_social_contact WHERE deleted_at IS NULL GROUP BY platform ORDER BY count DESC');
  const [trend] = await pool.query(`
    SELECT DATE(message_time) as date, COUNT(*) as count
    FROM crm_social_contact WHERE deleted_at IS NULL AND message_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    GROUP BY DATE(message_time) ORDER BY date
  `);

  return { total, week_new, platform_dist: platformDist, trend };
}

/**
 * 客户社媒时间线
 * @param {object} pool
 * @param {number|string} customerId
 * @returns {Array}
 */
async function getCustomerTimeline(pool, customerId) {
  const [rows] = await pool.query(`
    SELECT s.*, ct.name as contact_name, u.real_name as create_by_name
    FROM crm_social_contact s
    LEFT JOIN crm_contact ct ON s.contact_id = ct.id
    LEFT JOIN sys_user u ON s.create_by = u.id
    WHERE s.customer_id = ? AND s.deleted_at IS NULL
    ORDER BY s.message_time DESC LIMIT 100
  `, [customerId]);
  return rows;
}

module.exports = {
  listRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  getStats,
  getCustomerTimeline
};
