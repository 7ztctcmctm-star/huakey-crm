/**
 * 每日跟进提醒生成任务
 * 独立运行: node scripts/generate_reminders.js
 * 被app.js调用: require('./scripts/generate_reminders').generateReminders(pool)
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function generateReminders(existingPool) {
  // 如果传入了连接池就用，否则自己创建
  const pool = existingPool || mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'huakey_crm',
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 0
  });

  const shouldClose = !existingPool;

  try {
    const today = new Date().toISOString().slice(0, 10);

    // 从配置表读取逾期天数
    let OVERDUE_DAYS = 15;
    try {
      const [cfg] = await pool.query("SELECT config_value FROM sys_config WHERE config_key = 'overdue_days'");
      if (cfg.length > 0) OVERDUE_DAYS = parseInt(cfg[0].config_value) || 15;
    } catch { /* 使用默认值 */ }

    // ====== 1. 逾期提醒 ======
    const [overdueCustomers] = await pool.query(
      `SELECT c.id as customer_id, c.owner_id, c.company_name,
              DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) as overdue_days
       FROM crm_customer c
       WHERE c.status NOT IN (2, 3) AND c.status != 0
         AND c.owner_id IS NOT NULL
         AND (c.last_follow_time IS NULL
           OR c.last_follow_time < DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [OVERDUE_DAYS]
    );

    let inserted = 0;
    for (const customer of overdueCustomers) {
      const [managers] = await pool.query(
        `SELECT u.id, u.manager_id FROM sys_user u WHERE u.id = ? AND u.status = 1`,
        [customer.owner_id]
      );
      const managerId = managers.length > 0 ? managers[0].manager_id : null;

      try {
        await pool.query(
          `INSERT INTO crm_follow_up_reminder (customer_id, owner_id, manager_id, reminder_type, reminder_date)
           VALUES (?, ?, ?, 'overdue', ?)`,
          [customer.customer_id, customer.owner_id, managerId, today]
        );
        inserted++;
      } catch (e) {
        if (!e.message.includes('Duplicate')) console.error('插入overdue提醒失败:', e.message);
      }
    }
    console.log(`[提醒生成] 逾期: 生成${inserted}条, 跳过${overdueCustomers.length - inserted}条`);

    // ====== 2. 今日待跟进提醒 ======
    const [todayPlans] = await pool.query(
      `SELECT fp.id, fp.customer_id, c.owner_id
       FROM crm_follow_plan fp
       JOIN crm_customer c ON fp.customer_id = c.id AND c.status != 0 AND c.owner_id IS NOT NULL
       WHERE fp.status = 'pending' AND fp.deleted_at IS NULL
         AND DATE(fp.plan_time) = ?`,
      [today]
    );

    let todayInserted = 0;
    for (const plan of todayPlans) {
      try {
        await pool.query(
          `INSERT INTO crm_follow_up_reminder (customer_id, owner_id, reminder_type, reminder_date, follow_plan_id)
           VALUES (?, ?, 'today', ?, ?)`,
          [plan.customer_id, plan.owner_id, today, plan.id]
        );
        todayInserted++;
      } catch (e) {
        if (!e.message.includes('Duplicate')) console.error('插入today提醒失败:', e.message);
      }
    }
    console.log(`[提醒生成] 今日待跟进: 生成${todayInserted}条`);

    // ====== 3. 明日待跟进提醒 ======
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const [tomorrowPlans] = await pool.query(
      `SELECT fp.id, fp.customer_id, c.owner_id
       FROM crm_follow_plan fp
       JOIN crm_customer c ON fp.customer_id = c.id AND c.status != 0 AND c.owner_id IS NOT NULL
       WHERE fp.status = 'pending' AND fp.deleted_at IS NULL
         AND DATE(fp.plan_time) = ?`,
      [tomorrowStr]
    );

    let upcomingInserted = 0;
    for (const plan of tomorrowPlans) {
      try {
        await pool.query(
          `INSERT INTO crm_follow_up_reminder (customer_id, owner_id, reminder_type, reminder_date, follow_plan_id)
           VALUES (?, ?, 'upcoming', ?, ?)`,
          [plan.customer_id, plan.owner_id, today, plan.id]
        );
        upcomingInserted++;
      } catch (e) {
        if (!e.message.includes('Duplicate')) console.error('插入upcoming提醒失败:', e.message);
      }
    }
    console.log(`[提醒生成] 明日待跟进: 生成${upcomingInserted}条`);

    return { overdue: inserted, today: todayInserted, upcoming: upcomingInserted };
  } catch (error) {
    console.error('[提醒生成] 失败:', error);
    throw error;
  } finally {
    if (shouldClose) await pool.end();
  }
}

// 独立运行时直接执行
if (require.main === module) {
  generateReminders().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { generateReminders };
