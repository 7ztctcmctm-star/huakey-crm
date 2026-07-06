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
 * 安全：所有 Cron 端点必须经管理员认证后才能触发
 * [认证说明] 每个路由使用 authenticateToken + requireAdmin，拒绝未认证或非管理员请求
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const requireAdmin = require('../middleware/admin');
const pool = require('../config/database');
const { cleanExpiredLogs, autoReleaseCustomers } = require('../services/cronService');
const { checkAllSuppliersScores } = require('../utils/scoring');
const { checkQualificationExpiry, updateQualificationStatus } = require('../utils/qualification-reminder');
const { generateReminders } = require('../scripts/generate_reminders');
const logger = require('../config/logger');

// 1. 每日评分任务（供应商评分 + 资质状态更新 + 到期检查）
router.get('/daily-scoring', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await checkAllSuppliersScores();
    await updateQualificationStatus();
    await checkQualificationExpiry();
    res.json({ code: 200, message: '每日评分任务完成' });
  } catch (error) {
    logger.error('[Cron] 每日评分任务失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '评分任务执行失败' });
  }
});

// 2. 清理过期日志（保留 90 天）
router.get('/clean-logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const cleaned = await cleanExpiredLogs(pool);
    res.json({
      code: 200,
      message: `日志清理完成，已清理 ${cleaned} 条`
    });
  } catch (error) {
    logger.error('[Cron] 日志清理失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '日志清理失败' });
  }
});

// 3. 公海自动回收
router.get('/auto-release', authenticateToken, requireAdmin, async (req, res) => {
  const AUTO_RELEASE_DAYS = parseInt(process.env.AUTO_RELEASE_DAYS) || 30;
  try {
    const released = await autoReleaseCustomers(pool, AUTO_RELEASE_DAYS);
    res.json({
      code: 200,
      message: `公海回收完成，已释放 ${released} 个客户（超过 ${AUTO_RELEASE_DAYS} 天未跟进）`
    });
  } catch (error) {
    logger.error('[Cron] 公海回收失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '公海回收执行失败' });
  }
});

// 4. 跟进提醒生成
router.get('/generate-reminders', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await generateReminders(pool);
    res.json({ code: 200, message: '跟进提醒生成完成' });
  } catch (error) {
    logger.error('[Cron] 提醒生成失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '提醒生成失败' });
  }
});

module.exports = router;
