/**
 * Vercel Cron Jobs 端点
 * 替换原 node-cron 定时任务
 *
 * 配置见根目录 vercel.json 的 crons 字段：
 *   - 每天 02:00 → /api/cron/daily-scoring
 *   - 每天 03:00 → /api/cron/clean-logs
 *   - 每天 01:00 → /api/cron/auto-release
 *   - 每天 08:30 → /api/cron/generate-reminders
 *
 * 安全：仅允许 Vercel Cron（通过 CRON_SECRET 验证），拒绝外部请求
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { checkAllSuppliersScores } = require('../utils/scoring');
const { checkQualificationExpiry, updateQualificationStatus } = require('../utils/qualification-reminder');
const { generateReminders } = require('../scripts/generate_reminders');

// Vercel Cron 请求验证（生产环境必须设置 CRON_SECRET 环境变量）
const verifyCron = (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ code: 401, message: '未授权的 Cron 请求', data: null });
  }
  next();
};

router.use(verifyCron);

// 1. 每日评分任务（供应商评分 + 资质状态更新 + 到期检查）
router.get('/daily-scoring', async (req, res) => {
  try {
    await checkAllSuppliersScores();
    await updateQualificationStatus();
    await checkQualificationExpiry();
    res.json({ code: 200, message: '每日评分任务完成' });
  } catch (error) {
    console.error('[Cron] 每日评分任务失败:', error.message);
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 2. 清理过期日志（保留 90 天）
router.get('/clean-logs', async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM sys_log WHERE create_time < NOW() - INTERVAL '90 days'"
    );
    res.json({
      code: 200,
      message: `日志清理完成，已清理 ${result.rowCount || 0} 条`
    });
  } catch (error) {
    console.error('[Cron] 日志清理失败:', error.message);
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 3. 公海自动回收
router.get('/auto-release', async (req, res) => {
  const AUTO_RELEASE_DAYS = parseInt(process.env.AUTO_RELEASE_DAYS) || 30;
  try {
    const { rows: customers } = await pool.query(
      `SELECT id, company_name, owner_id FROM crm_customer
       WHERE pool_status = 0 AND status != 0 AND owner_id IS NOT NULL
         AND (last_follow_time IS NULL AND create_time < NOW() - ($1 * INTERVAL '1 day')
           OR last_follow_time < NOW() - ($1 * INTERVAL '1 day'))`,
      [AUTO_RELEASE_DAYS]
    );

    let released = 0;
    for (const c of customers) {
      await pool.query(
        'UPDATE crm_customer SET pool_status = 1, owner_id = NULL, protect_until = NULL WHERE id = $1',
        [c.id]
      );
      await pool.query(
        "INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id) VALUES ($1, 'auto_release', $2, NULL)",
        [c.id, c.owner_id]
      );
      released++;
    }

    res.json({
      code: 200,
      message: `公海回收完成，已释放 ${released} 个客户（超过 ${AUTO_RELEASE_DAYS} 天未跟进）`
    });
  } catch (error) {
    console.error('[Cron] 公海回收失败:', error.message);
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 4. 跟进提醒生成
router.get('/generate-reminders', async (req, res) => {
  try {
    await generateReminders(pool);
    res.json({ code: 200, message: '跟进提醒生成完成' });
  } catch (error) {
    console.error('[Cron] 提醒生成失败:', error.message);
    res.status(500).json({ code: 500, message: error.message });
  }
});

module.exports = router;
