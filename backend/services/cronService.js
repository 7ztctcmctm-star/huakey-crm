// 定时任务服务
// 从 routes/cronJobs.js 提取的业务逻辑

const { getRecycleDays, getNearRecycleDays } = require('../utils/config');
const { POOL_STATUS } = require('../constants/poolStatus');
const notification = require('../utils/notification');
const sseManager = require('../utils/sseManager');
const logger = require('../config/logger');
// [R-06 边界收敛 2026-09-16] 公海自动回收实现已迁入客户域（poolService），本模块仅保留薄委托
const poolService = require('./poolService');

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
 * 清理超过指定天数的幂等键记录（crm_idempotency）
 *
 * 【为什么需要（步骤 B2 · 2026-10-19）】
 *   crm_idempotency 是「一写一留」的登记表：每笔带幂等键的成功写入都永久留一行。
 *   不加清理会无限增长，且随着行数上升，幂等查询（按主键查）虽仍是 O(1)，
 *   但备份体积与表碎片会持续累积。保留窗口取 30 天 — 远长于常规重试/对账周期，
 *   短于此窗口的重放仍能命中缓存结果。
 *
 * @param {object} pool - 数据库连接池
 * @param {number} [days=30] - 保留天数，默认 30
 * @returns {Promise<number>} - 已清理的记录数
 */
async function cleanExpiredIdempotency(pool, days = 30) {
  const [result] = await pool.query(
    'DELETE FROM crm_idempotency WHERE create_time < NOW() - INTERVAL ? DAY',
    [days]
  );
  return result.affectedRows || 0;
}

/**
 * 获取即将回收的客户列表（following 状态超过 N 天未跟进）
 * @param {object} pool - 数据库连接池
 * @param {number} [nearDays] - 未跟进天数阈值，默认读取 sys_config.near_recycle_days
 * @returns {Promise<Array>} - 客户列表
 */
async function getNearRecycleCustomers(pool, nearDays) {
  const threshold = nearDays || await getNearRecycleDays();
  const [customers] = await pool.query(
    `SELECT c.id, c.company_name, c.owner_id, c.last_follow_time, c.create_time,
            DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) as overdue_days,
            u.real_name as owner_name
     FROM crm_customer c
     LEFT JOIN sys_user u ON c.owner_id = u.id
     WHERE c.pool_status = ? AND c.deleted_at IS NULL AND c.owner_id IS NOT NULL
       AND c.status = 'following'
       AND (c.last_follow_time IS NULL AND c.create_time < NOW() - INTERVAL ? DAY
         OR c.last_follow_time < NOW() - INTERVAL ? DAY)
     ORDER BY overdue_days DESC`,
    [POOL_STATUS.PRIVATE, threshold, threshold]
  );
  return customers;
}

/**
 * 发送释放前 1 天通知
 * @param {object} pool - 数据库连接池
 * @param {number} [recycleDays] - 回收天数阈值，默认读取 sys_config.recycle_days
 * @returns {Promise<number>} - 通知的客户数
 */
async function notifyPreReleaseCustomers(pool, recycleDays) {
  const threshold = recycleDays || await getRecycleDays();
  const preReleaseDays = threshold - 1;
  if (preReleaseDays <= 0) return 0;

  const [customers] = await pool.query(
    `SELECT c.id, c.company_name, c.owner_id,
            DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) as overdue_days,
            u.real_name as owner_name
     FROM crm_customer c
     LEFT JOIN sys_user u ON c.owner_id = u.id
     WHERE c.pool_status = ? AND c.deleted_at IS NULL AND c.owner_id IS NOT NULL
       AND c.status = 'following'
       AND DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) = ?`,
    [POOL_STATUS.PRIVATE, preReleaseDays]
  );

  for (const customer of customers) {
    try {
      // 插入 pre_release 提醒记录
      await pool.query(
        `INSERT INTO crm_follow_up_reminder (customer_id, owner_id, reminder_type, reminder_date)
         VALUES (?, ?, 'pre_release', CURDATE())`,
        [customer.id, customer.owner_id]
      );
    } catch (e) {
      if (!e.message.includes('Duplicate')) {
        logger.error('[公海回收] 插入pre_release提醒失败:', e.message);
      }
    }

    try {
      const title = '⚠️ 客户即将被释放到公海';
      const content = `客户 ${customer.company_name} 已 ${customer.overdue_days} 天未跟进，将于明天自动释放到公海\n> 请及时跟进或申请保护期`;
      await notification.sendMarkdown(`## ${title}\n${content}\n> 负责人: @${customer.owner_name || ''}`);
      sseManager.send(customer.owner_id, {
        type: 'followup_reminder',
        sub_type: 'pre_release',
        customer_id: customer.id,
        customer_name: customer.company_name,
        overdue_days: customer.overdue_days,
        message: `客户 ${customer.company_name} 即将被释放到公海`
      });
    } catch (e) {
      logger.error('[公海回收] 发送释放前通知失败:', e.message);
    }
  }

  return customers.length;
}

/**
 * 将超过指定天数未跟进的 following 状态客户自动释放到公海
 * @param {object} pool - 数据库连接池
 * @param {number} [releaseDays] - 未跟进天数阈值，默认读取 sys_config.recycle_days
 * @returns {Promise<number>} - 已释放的客户数
 */
/**
 * 【R-06 边界收敛 2026-09-16】公海自动回收的**实现已迁入客户域**：
 *   services/poolService.autoReleaseCustomers(pool, releaseDays)
 * 本模块属非 Customer 域，不再直接写 crm_customer；此处保留同名薄委托，
 * 以免改动既有调用方（cron/scheduler.js 的 `0 1 * * *` 作业、routes/cronJobs.js 的手动触发）。
 */
function autoReleaseCustomers(pool, releaseDays) {
  return poolService.autoReleaseCustomers(pool, releaseDays);
}

module.exports = {
  cleanExpiredLogs,
  cleanExpiredIdempotency,
  getNearRecycleCustomers,
  notifyPreReleaseCustomers,
  autoReleaseCustomers
};
