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
 * [认证说明] Cron 端点使用 CRON_SECRET 进行服务间认证，不使用内部用户 token（authenticateToken）
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { cleanExpiredLogs, autoReleaseCustomers } = require('../services/cronService');
const { checkAllSuppliersScores } = require('../utils/scoring');
const { checkQualificationExpiry, updateQualificationStatus } = require('../utils/qualification-reminder');
const { generateReminders } = require('../scripts/generate_reminders');
const logger = require('../config/logger');

// Vercel Cron 请求验证
// [安全] 生产环境必须设置 CRON_SECRET 为强随机字符串（≥32位），否则所有 Cron 端点将被拒绝
const verifyCron = (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[Cron] CRON_SECRET 未配置，拒绝所有请求', { traceId: req.traceId || 'N/A' });
    return res.status(500).json({ code: 500, message: '服务未配置', data: null });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
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
    logger.error('[Cron] 每日评分任务失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '评分任务执行失败' });
  }
});

// 2. 清理过期日志（保留 90 天）
router.get('/clean-logs', async (req, res) => {
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
router.get('/auto-release', async (req, res) => {
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
router.get('/generate-reminders', async (req, res) => {
  try {
    await generateReminders(pool);
    res.json({ code: 200, message: '跟进提醒生成完成' });
  } catch (error) {
    logger.error('[Cron] 提醒生成失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '提醒生成失败' });
  }
});

module.exports = router;
