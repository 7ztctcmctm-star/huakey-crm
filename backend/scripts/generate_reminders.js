/**
 * 每日跟进提醒生成任务
 * 独立运行: node scripts/generate_reminders.js
 * 被app.js调用: require('./scripts/generate_reminders').generateReminders(pool)
 *
 * Prompt 4-2: 跟进计划已合并进 crm_follow_up（is_plan=1），
 * 故提醒统一来源为 crm_follow_up（实际跟进 is_plan=0 与计划 is_plan=1 的 next_time）。
 */
require('dotenv').config();
const notification = require('../utils/notification');
const sseManager = require('../utils/sseManager');
const { isFollowupReminderEnabled } = require('../utils/config');

async function generateReminders(existingPool) {
  // 如果传入了连接池就用，否则自己创建（PG 兼容）
  const pool = existingPool || (() => {
    const { Pool } = require('pg');
    return new Pool({ connectionString: process.env.DATABASE_URL });
  })();

  const shouldClose = !existingPool;

  try {
    // 全局开关：可配置关闭提醒生成
    let enabled = true;
    try {
      enabled = await isFollowupReminderEnabled();
    } catch { /* 使用默认启用 */ }
    if (!enabled) {
      console.log('[提醒生成] 已跳过（followup_reminder_enabled=0）');
      return { overdue: 0, today: 0, upcoming: 0 };
    }

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
       WHERE c.status NOT IN ('signed', 'lost') AND c.status != '0'
         AND c.owner_id IS NOT NULL
         AND (c.last_follow_time IS NULL
           OR c.last_follow_time < NOW() - INTERVAL ? DAY)`,
      [OVERDUE_DAYS]
    );

    let inserted = 0;
    for (const customer of overdueCustomers) {
      const [managers] = await pool.query(
        `SELECT u.id, u.manager_id, u.real_name FROM sys_user u WHERE u.id = ? AND u.status = 1`,
        [customer.owner_id]
      );
      const managerId = managers.length > 0 ? managers[0].manager_id : null;
      const ownerName = managers.length > 0 ? managers[0].real_name : '';

      try {
        await pool.query(
          `INSERT INTO crm_follow_up_reminder (customer_id, owner_id, manager_id, reminder_type, reminder_date)
           VALUES (?, ?, ?, 'overdue', ?)`,
          [customer.customer_id, customer.owner_id, managerId, today]
        );
        inserted++;

        // 企业微信 + SSE 推送
        try {
          await notification.sendFollowupReminder({
            customerName: customer.company_name,
            ownerName,
            type: 'overdue',
            overdueDays: customer.overdue_days
          });
          sseManager.send(customer.owner_id, {
            type: 'followup_reminder',
            sub_type: 'overdue',
            customer_id: customer.customer_id,
            customer_name: customer.company_name,
            overdue_days: customer.overdue_days,
            message: `客户 ${customer.company_name} 已 ${customer.overdue_days} 天未跟进`
          });
        } catch (e) {
          console.error('发送逾期通知失败:', e.message);
        }
      } catch (e) {
        if (!e.message.includes('Duplicate')) console.error('插入overdue提醒失败:', e.message);
      }
    }
    console.log(`[提醒生成] 逾期: 生成${inserted}条, 跳过${overdueCustomers.length - inserted}条`);

    // ====== 2. 今日待跟进提醒（统一来源：crm_follow_up，is_plan IN (0,1)） ======
    let todayInserted = 0;
    const [todayItems] = await pool.query(
      `SELECT f.id, f.customer_id, c.owner_id, c.company_name, u.real_name as owner_name
       FROM crm_follow_up f
       JOIN crm_customer c ON f.customer_id = c.id AND c.status != '0' AND c.owner_id IS NOT NULL
       LEFT JOIN sys_user u ON c.owner_id = u.id
       WHERE f.deleted_at IS NULL AND f.next_time IS NOT NULL
         AND f.is_plan IN (0, 1)
         AND DATE(f.next_time) = ?`,
      [today]
    );

    for (const item of todayItems) {
      try {
        await pool.query(
          `INSERT INTO crm_follow_up_reminder (customer_id, owner_id, reminder_type, reminder_date)
           VALUES (?, ?, 'today', ?)`,
          [item.customer_id, item.owner_id, today]
        );
        todayInserted++;

        try {
          await notification.sendFollowupReminder({
            customerName: item.company_name,
            ownerName: item.owner_name || '',
            type: 'today'
          });
          sseManager.send(item.owner_id, {
            type: 'followup_reminder',
            sub_type: 'today',
            customer_id: item.customer_id,
            customer_name: item.company_name,
            message: `客户 ${item.company_name} 今天需要跟进`
          });
        } catch (e) {
          console.error('发送今日跟进通知失败:', e.message);
        }
      } catch (e) {
        if (!e.message.includes('Duplicate')) console.error('插入today提醒失败:', e.message);
      }
    }
    console.log(`[提醒生成] 今日待跟进: 生成${todayInserted}条`);

    // ====== 3. 明日待跟进提醒（统一来源：crm_follow_up，is_plan IN (0,1)） ======
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    let upcomingInserted = 0;
    const [tomorrowItems] = await pool.query(
      `SELECT f.id, f.customer_id, c.owner_id, c.company_name, f.next_time, u.real_name as owner_name
       FROM crm_follow_up f
       JOIN crm_customer c ON f.customer_id = c.id AND c.status != '0' AND c.owner_id IS NOT NULL
       LEFT JOIN sys_user u ON c.owner_id = u.id
       WHERE f.deleted_at IS NULL AND f.next_time IS NOT NULL
         AND f.is_plan IN (0, 1)
         AND DATE(f.next_time) = ?`,
      [tomorrowStr]
    );

    for (const item of tomorrowItems) {
      try {
        await pool.query(
          `INSERT INTO crm_follow_up_reminder (customer_id, owner_id, reminder_type, reminder_date)
           VALUES (?, ?, 'upcoming', ?)`,
          [item.customer_id, item.owner_id, tomorrowStr]
        );
        upcomingInserted++;

        try {
          await notification.sendFollowupReminder({
            customerName: item.company_name,
            ownerName: item.owner_name || '',
            type: 'upcoming',
            nextTime: item.next_time
          });
          sseManager.send(item.owner_id, {
            type: 'followup_reminder',
            sub_type: 'upcoming',
            customer_id: item.customer_id,
            customer_name: item.company_name,
            next_time: item.next_time,
            message: `客户 ${item.company_name} 明天需要跟进`
          });
        } catch (e) {
          console.error('发送明日跟进通知失败:', e.message);
        }
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
