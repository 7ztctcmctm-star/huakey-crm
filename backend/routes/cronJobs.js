/**
 * 定时任务手动触发端点
 *
 * [C1 2026-10-20 · GET → POST 改造]
 *   原实现把 4 个**写操作**（评分落库、删日志、改客户归属、插提醒）挂在 GET 上：
 *     · 语义违反 HTTP：GET 应当是安全的、可缓存的、可被预取/重放的；
 *     · 可被引擎预取、浏览器预加载、代理缓存、聊天软件链接预览静默触发；
 *     · 日志里难以区分「调度触发」与「爬虫误触」。
 *   现改为 POST，并挂功能权限码 system:cron —— 原实现只有 requireAdmin
 *   （硬编码角色判断），没有权限码 ⇒ 无法按角色矩阵授权/回收，也无法被
 *   权限治理脚本扫描到。
 *
 * 【常规调度不经过本文件】
 *   常驻进程的定时任务由 backend/cron/scheduler.js（node-cron，Asia/Shanghai）承担：
 *     02:00 资质检查（qualification-check）    ← 对应本文件 /daily-scoring 的资质部分
 *     03:00 清理过期日志（log-cleanup）         ← 对应 /clean-logs
 *     01:00 公海自动回收（auto-release）        ← 对应 /auto-release
 *     08:30 跟进提醒生成（reminder-generation） ← 对应 /generate-reminders
 *   故本文件 4 个端点定位为**管理员应急补跑通道**，不再作为调度主路径；
 *   backend/vercel.json 的 crons 配置已同步摘除（Vercel Cron 仅发 GET，无法调用）。
 *
 * 安全：POST + authenticateToken + checkPermission('system:cron') + requireAdmin
 *       未认证 → 401；无码 → 403「没有操作权限」；非管理员 → 403「需要管理员权限」
 */

const express = require('express');
const registry = require('../core/ModuleRegistry');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const requireAdmin = require('../middleware/admin');
const pool = require('../config/database');
const { cleanExpiredLogs, autoReleaseCustomers } = require('../services/cronService');
const { checkAllSuppliersScores } = require('../utils/scoring');
const { checkQualificationExpiry, updateQualificationStatus } = require('../utils/qualification-reminder');
const { generateReminders } = require('../scripts/generate_reminders');
const logger = require('../config/logger');

// 4 个端点共用的守卫链：认证 → 功能码 → 管理员。
// 保留 requireAdmin 是纵深防御：即便将来误把 system:cron 授予 manager，
// 也不会把「删日志 / 改客户归属」这类破坏性写操作放开。
const cronGuards = [authenticateToken, checkPermission('system:cron'), requireAdmin];

// 1. 每日评分任务（供应商评分 + 资质状态更新 + 到期检查）
router.post('/daily-scoring', ...cronGuards, async (req, res, next) => {
  try {
    await checkAllSuppliersScores();
    await updateQualificationStatus();
    await checkQualificationExpiry();
    res.json({ code: 200, message: '每日评分任务完成' });
  } catch (error) {
    logger.error('[Cron] 每日评分任务失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 2. 清理过期日志（保留 90 天）
router.post('/clean-logs', ...cronGuards, async (req, res, next) => {
  try {
    const cleaned = await cleanExpiredLogs(pool);
    res.json({
      code: 200,
      message: `日志清理完成，已清理 ${cleaned} 条`
    });
  } catch (error) {
    logger.error('[Cron] 日志清理失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 3. 公海自动回收
router.post('/auto-release', ...cronGuards, async (req, res, next) => {
  const AUTO_RELEASE_DAYS = parseInt(process.env.AUTO_RELEASE_DAYS) || 30;
  try {
    const released = await autoReleaseCustomers(pool, AUTO_RELEASE_DAYS);
    res.json({
      code: 200,
      message: `公海回收完成，已释放 ${released} 个客户（超过 ${AUTO_RELEASE_DAYS} 天未跟进）`
    });
  } catch (error) {
    logger.error('[Cron] 公海回收失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 4. 跟进提醒生成
router.post('/generate-reminders', ...cronGuards, async (req, res, next) => {
  try {
    await generateReminders(pool);
    res.json({ code: 200, message: '跟进提醒生成完成' });
  } catch (error) {
    logger.error('[Cron] 提醒生成失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// [C1 2026-10-20] GET 兼容层：不再静默 404，显式返回 405 并指明正确方法。
//   没有这一层时，老的外部调度（曾配置在 backend/vercel.json 的 crons）会拿到 404，
//   表现为「任务不报错但再也不执行」——这类静默失败最难排查。
//   放在 POST 路由注册之后，不影响正常路径。
const CRON_PATHS = ['/daily-scoring', '/clean-logs', '/auto-release', '/generate-reminders'];
CRON_PATHS.forEach((path) => {
  // 先过 authenticateToken：未登录应得 401，而不是 405。
  // 若方法检查先于认证，未认证请求返回 405 会泄露「该路径存在且只接受 POST」，
  // 等于给匿名用户一份端点清单。
  router.get(path, authenticateToken, (req, res) => {
    res.set('Allow', 'POST');
    res.status(405).json({
      code: 405,
      message: `定时任务已改为 POST 触发，请使用 POST ${req.baseUrl}${path}`,
      data: null
    });
  });
});

registry.register('cron', { routes: router, permissions: ['system:cron'] });
module.exports = router;
