/**
 * 每日跟进提醒生成任务
 * 每天上午 9:00 执行一次
 * 使用方式: node scripts/generate_reminders.js
 * 群晖计划任务: 0 9 * * * cd /path/to/backend && node scripts/generate_reminders.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'huakey_crm',
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 0
  });

  try {
    const today = new Date().toISOString().slice(0, 10);

    // 从配置表读取逾期天数
    let OVERDUE_DAYS = 15;
    try {
      const [cfg] = await pool.query("SELECT config_value FROM sys_config WHERE config_key = 'overdue_days'");
      if (cfg.length > 0) OVERDUE_DAYS = parseInt(cfg[0].config_value) || 15;
    } catch { /* 使用默认值 */ }

    // 查找所有超过15天未跟进的活跃客户
    const [overdueCustomers] = await pool.query(
      `SELECT c.id as customer_id, c.owner_id, c.company_name,
              DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) as overdue_days
       FROM crm_customer c
       WHERE c.status NOT IN (2, 3) AND c.status != 0
         AND c.owner_id IS NOT NULL
         AND (c.last_follow_time IS NULL
           OR c.last_follow_time < DATE_SUB(NOW(), INTERVAL ${OVERDUE_DAYS} DAY))`
    );

    console.log(`[${today}] 发现 ${overdueCustomers.length} 个逾期客户`);

    if (overdueCustomers.length === 0) {
      await pool.end();
      return;
    }

    let inserted = 0;
    for (const customer of overdueCustomers) {
      // 获取负责人上级（老板）
      const [managers] = await pool.query(
        `SELECT u.id, u.email, u.manager_id
         FROM sys_user u
         LEFT JOIN sys_role r ON u.role_id = r.id
         WHERE u.id = ? AND u.status = 1`,
        [customer.owner_id]
      );

      const managerId = managers.length > 0 ? managers[0].manager_id : null;

      // 检查今天是否已生成过该客户的提醒（防重复）
      const [existing] = await pool.query(
        'SELECT id FROM crm_follow_up_reminder WHERE customer_id = ? AND reminder_date = ?',
        [customer.customer_id, today]
      );

      if (existing.length > 0) continue;

      // 插入提醒
      await pool.query(
        `INSERT INTO crm_follow_up_reminder (customer_id, owner_id, manager_id, reminder_type, reminder_date)
         VALUES (?, ?, ?, 'overdue', ?)`,
        [customer.customer_id, customer.owner_id, managerId, today]
      );

      inserted++;
    }

    console.log(`[${today}] 成功生成 ${inserted} 条提醒`);
    console.log(`[${today}] 跳过 ${overdueCustomers.length - inserted} 条（已存在）`);
  } catch (error) {
    console.error('生成提醒失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
