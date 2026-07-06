// 定时任务服务
// 从 routes/cronJobs.js 提取的业务逻辑

/**
 * 清理超过指定天数的操作日志
 * @param {object} pool - 数据库连接池
 * @param {number} [days=90] - 保留天数，默认90天
 * @returns {Promise<number>} - 已清理的记录数
 */
async function cleanExpiredLogs(pool, days = 90) {
  const [result] = await pool.query(
    'DELETE FROM sys_log WHERE create_time < NOW() - INTERVAL ? DAY',
    [days]
  );
  return result.affectedRows || 0;
}

/**
 * 将超过指定天数未跟进的客户自动释放到公海
 * @param {object} pool - 数据库连接池
 * @param {number} [releaseDays=30] - 未跟进天数阈值，默认30天
 * @returns {Promise<number>} - 已释放的客户数
 */
async function autoReleaseCustomers(pool, releaseDays = 30) {
  const [customers] = await pool.query(
    `SELECT id, company_name, owner_id FROM crm_customer
     WHERE pool_status = 0 AND deleted_at IS NULL AND owner_id IS NOT NULL
       AND (last_follow_time IS NULL AND create_time < NOW() - INTERVAL ? DAY
         OR last_follow_time < NOW() - INTERVAL ? DAY)`,
    [releaseDays, releaseDays]
  );

  if (!customers || customers.length === 0) {
    return 0;
  }

  const ids = customers.map(c => c.id);
  const logValues = customers.map(c => [c.id, 'auto_release', c.owner_id, null]);

  await pool.query(
    'UPDATE crm_customer SET pool_status = 1, owner_id = NULL, protect_until = NULL WHERE id IN (?)',
    [ids]
  );

  await pool.query(
    'INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id) VALUES ?',
    [logValues]
  );

  return ids.length;
}

module.exports = {
  cleanExpiredLogs,
  autoReleaseCustomers
};
