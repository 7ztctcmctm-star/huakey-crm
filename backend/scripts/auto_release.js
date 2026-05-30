// 客户自动掉入公海定时任务
// 建议：每天凌晨1点执行一次
// crontab: 0 1 * * * node /path/to/auto_release.js
// Windows Task Scheduler 也可调用此脚本

const pool = require('../config/database');

const AUTO_RELEASE_DAYS = parseInt(process.env.AUTO_RELEASE_DAYS) || 30;

async function autoRelease() {
  console.log(`[${new Date().toISOString()}] 开始执行自动释放客户任务...`);
  console.log(`  配置: 超过 ${AUTO_RELEASE_DAYS} 天未跟进 → 自动掉入公海`);

  try {
    // 查找超过指定天数未跟进 且 不在公海的客户
    const [customers] = await pool.query(
      `SELECT id, company_name, owner_id
       FROM crm_customer
       WHERE pool_status = 0
         AND status != 0
         AND owner_id IS NOT NULL
         AND (
           last_follow_time IS NULL
           AND create_time < NOW() - (? * INTERVAL '1 day')
           OR last_follow_time < NOW() - (? * INTERVAL '1 day')
         )`,
      [AUTO_RELEASE_DAYS, AUTO_RELEASE_DAYS]
    );

    if (customers.length === 0) {
      console.log('  无需要自动释放的客户');
      process.exit(0);
    }

    console.log(`  找到 ${customers.length} 个超期未跟进的客户`);

    let releasedCount = 0;
    for (const customer of customers) {
      await pool.query(
        'UPDATE crm_customer SET pool_status = 1, owner_id = NULL, protect_until = NULL WHERE id = ?',
        [customer.id]
      );

      await pool.query(
        `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id)
         VALUES (?, 'auto_release', ?, NULL)`,
        [customer.id, customer.owner_id]
      );

      console.log(`    ✓ 已释放: ${customer.company_name} (ID:${customer.id})`);
      releasedCount++;
    }

    console.log(`\n[${new Date().toISOString()}] 执行完成，共释放 ${releasedCount} 个客户`);
    process.exit(0);
  } catch (error) {
    console.error('自动释放客户失败:', error);
    process.exit(1);
  }
}

autoRelease();
