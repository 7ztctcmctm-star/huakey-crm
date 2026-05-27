/**
 * 逾期跟进提醒定时任务
 * 建议执行频率：每天 8:00
 * crontab: 0 8 * * * node /path/to/overdue_reminder.js
 */
const pool = require('../config/database');

const OVERDUE_DAYS = 15;

async function run() {
  console.log(`[${new Date().toISOString()}] 逾期跟进检查开始（阈值: ${OVERDUE_DAYS}天）`);

  try {
    // 1. 找出所有逾期客户
    const [overdue] = await pool.query(
      `SELECT c.id, c.company_name, c.owner_id, c.last_follow_time, c.create_time,
              COALESCE(c.last_follow_time, c.create_time) as ref_time,
              DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) as days
       FROM crm_customer c
       WHERE c.pool_status = 0 AND c.status != 0 AND c.owner_id IS NOT NULL
         AND ((c.last_follow_time IS NULL AND c.create_time < DATE_SUB(NOW(), INTERVAL ? DAY))
           OR c.last_follow_time < DATE_SUB(NOW(), INTERVAL ? DAY))
       ORDER BY days DESC`,
      [OVERDUE_DAYS, OVERDUE_DAYS]
    );

    console.log(`  逾期客户数: ${overdue.length}`);
    if (overdue.length === 0) { process.exit(0); }

    // 2. 按负责人分组
    const byOwner = {};
    for (const c of overdue) {
      if (!byOwner[c.owner_id]) byOwner[c.owner_id] = [];
      byOwner[c.owner_id].push(c);
    }

    // 3. 获取超管和老板ID
    const [admins] = await pool.query(
      "SELECT id FROM sys_user WHERE role_id IN (1, 2) AND status = 1"
    );
    const adminIds = admins.map(a => a.id);

    // 4. 按销售发送提醒
    for (const [ownerId, customers] of Object.entries(byOwner)) {
      // 获取销售经理
      const [managers] = await pool.query(
        `SELECT u.id FROM sys_user u
         WHERE u.dept_id = (SELECT dept_id FROM sys_user WHERE id = ?)
           AND u.role_id = 3 AND u.status = 1`,
        [ownerId]
      );

      const notifiedIds = new Set([...adminIds, parseInt(ownerId)]);
      for (const m of managers) notifiedIds.add(m.id);

      const top5 = customers.slice(0, 5).map(c => `${c.company_name}(${c.days}天)`).join(', ');
      const more = customers.length > 5 ? ` 等${customers.length}个` : '';

      for (const uid of notifiedIds) {
        console.log(`  通知用户${uid}: ${customers.length}个逾期客户 - ${top5}${more}`);
        // 这里可以接邮件/企业微信/站内信
      }
    }

    console.log(`[${new Date().toISOString()}] 逾期提醒完成`);
    process.exit(0);
  } catch (error) {
    console.error('逾期提醒失败:', error);
    process.exit(1);
  }
}

run();
