/**
 * 定时任务调度器
 * 从 app.js 抽取的 5 个 node-cron 任务，带失败重试和执行日志
 */

const cron = require('node-cron');
const { createSysCronLogTable, logCronRun } = require('./logger');

// 关键任务列表 — 失败时 console.error 醒目输出
const CRITICAL_JOBS = ['supplier-scoring', 'auto-release'];

/**
 * 带重试的任务执行器
 * @param {Function} fn - 要执行的异步函数
 * @param {string} jobName - 任务名称
 * @param {number} maxRetries - 最大重试次数（默认3）
 */
async function executeWithRetry(fn, jobName, maxRetries = 3) {
  const startTime = new Date();
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fn();
      const endTime = new Date();
      await logCronRun(jobName, startTime, endTime, 'success');
      return;
    } catch (error) {
      lastError = error;
      console.error(`[定时任务] ${jobName} 第${attempt}次执行失败: ${error.message}`);

      if (attempt < maxRetries) {
        // 递增间隔: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`[定时任务] ${jobName} ${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // 全部重试失败
  const endTime = new Date();
  const errorMsg = lastError?.message || '未知错误';

  if (CRITICAL_JOBS.includes(jobName)) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`[严重] 关键定时任务 ${jobName} 执行失败（已重试${maxRetries}次）`);
    console.error(`[严重] 错误: ${errorMsg}`);
    console.error(`${'='.repeat(60)}\n`);

    const { alertError } = require('../utils/alert');
    alertError({
      level: 'critical',
      source: `CronJob:${jobName}`,
      message: errorMsg,
    });
  }

  await logCronRun(jobName, startTime, endTime, 'failed', errorMsg);
}

/**
 * 启动所有定时任务
 * @param {object} pool - 数据库连接池
 */
function startAllCronJobs(pool) {
  // 确保日志表存在
  createSysCronLogTable();

  const { checkAllSuppliersScores } = require('../utils/scoring');
  const { checkQualificationExpiry, updateQualificationStatus } = require('../utils/qualification-reminder');
  const { generateReminders } = require('../scripts/generate_reminders');
  const AUTO_RELEASE_DAYS = parseInt(process.env.AUTO_RELEASE_DAYS) || 30;

  // 1. 每日 02:00 — 供应商评分 + 资质检查
  cron.schedule('0 2 * * *', () => {
    console.log('[定时任务] 开始执行供应商评分');
    executeWithRetry(async () => {
      await checkAllSuppliersScores();
      await updateQualificationStatus();
      await checkQualificationExpiry();
      console.log('[定时任务] 供应商评分完成');
    }, 'supplier-scoring');
  }, { timezone: 'Asia/Shanghai' });

  // 2. 每日 03:00 — 清理过期日志（保留90天）
  cron.schedule('0 3 * * *', () => {
    executeWithRetry(async () => {
      const [result] = await pool.query(
        'DELETE FROM sys_log WHERE create_time < NOW() - INTERVAL 90 DAY'
      );
      if (result.affectedRows > 0) {
        console.log(`[日志清理] 已清理 ${result.affectedRows} 条过期日志`);
      }
    }, 'log-cleanup');
  }, { timezone: 'Asia/Shanghai' });

  // 3. 每日 03:30 — 清理过期 token 黑名单
  cron.schedule('30 3 * * *', () => {
    executeWithRetry(async () => {
      const [result] = await pool.query(
        'DELETE FROM sys_token_blacklist WHERE expire_at < NOW()'
      );
      if (result.affectedRows > 0) {
        console.log(`[黑名单清理] 已清理 ${result.affectedRows} 条过期记录`);
      }
    }, 'token-blacklist-cleanup');
  }, { timezone: 'Asia/Shanghai' });

  // 4. 每日 01:00 — 公海池自动回收
  cron.schedule('0 1 * * *', () => {
    console.log('[公海回收] 开始检查超期未跟进客户...');
    executeWithRetry(async () => {
      const [customers] = await pool.query(
        `SELECT id, company_name, owner_id FROM crm_customer
         WHERE pool_status = 0 AND status != 0 AND owner_id IS NOT NULL
           AND (last_follow_time IS NULL AND create_time < NOW() - INTERVAL ? DAY
             OR last_follow_time < NOW() - INTERVAL ? DAY)`,
        [AUTO_RELEASE_DAYS, AUTO_RELEASE_DAYS]
      );
      if (customers.length === 0) {
        console.log('[公海回收] 无需要释放的客户');
        return;
      }
      let released = 0;
      for (const c of customers) {
        await pool.query(
          'UPDATE crm_customer SET pool_status = 1, owner_id = NULL, protect_until = NULL WHERE id = ?',
          [c.id]
        );
        await pool.query(
          `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id)
           VALUES (?, 'auto_release', ?, NULL)`,
          [c.id, c.owner_id]
        );
        released++;
      }
      console.log(`[公海回收] 已释放 ${released} 个客户（超过${AUTO_RELEASE_DAYS}天未跟进）`);
    }, 'auto-release');
  }, { timezone: 'Asia/Shanghai' });

  // 5. 每日 08:30 — 跟进提醒生成
  cron.schedule('30 8 * * *', () => {
    console.log('[提醒生成] 开始执行...');
    executeWithRetry(async () => {
      await generateReminders(pool);
      console.log('[提醒生成] 执行完成');
    }, 'reminder-generation');
  }, { timezone: 'Asia/Shanghai' });

  console.log('[定时任务] 全部定时任务已启动');
}

module.exports = { startAllCronJobs, executeWithRetry };
