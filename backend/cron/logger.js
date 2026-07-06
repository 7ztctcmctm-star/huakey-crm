/**
 * 定时任务执行日志器
 * 记录每个 cron 任务的执行情况到 sys_cron_log 表
 */

const logger = require('../config/logger');
const pool = require('../config/database');

/**
 * 确保 sys_cron_log 表存在
 */
async function createSysCronLogTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sys_cron_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_name VARCHAR(100) NOT NULL COMMENT '任务名称',
        start_time DATETIME NOT NULL COMMENT '开始时间',
        end_time DATETIME DEFAULT NULL COMMENT '结束时间',
        status ENUM('success', 'failed') NOT NULL COMMENT '执行状态',
        error_msg TEXT DEFAULT NULL COMMENT '错误信息',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
        INDEX idx_job_name (job_name),
        INDEX idx_start_time (start_time),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='定时任务执行日志'
    `);
  } catch (error) {
    logger.error('[CronLogger] 创建 sys_cron_log 表失败:', error.message);
  }
}

/**
 * 记录一次定时任务执行
 * @param {string} jobName - 任务名称
 * @param {Date} startTime - 开始时间
 * @param {Date} endTime - 结束时间
 * @param {'success'|'failed'} status - 执行状态
 * @param {string|null} errorMsg - 错误信息
 */
async function logCronRun(jobName, startTime, endTime, status, errorMsg = null) {
  try {
    await pool.query(
      `INSERT INTO sys_cron_log (job_name, start_time, end_time, status, error_msg)
       VALUES (?, ?, ?, ?, ?)`,
      [jobName, startTime, endTime, status, errorMsg ? errorMsg.substring(0, 2000) : null]
    );
  } catch (error) {
    logger.error(`[CronLogger] 记录任务 ${jobName} 失败:`, error.message);
  }
}

module.exports = { createSysCronLogTable, logCronRun };
