// 客户自动掉入公海 —— 运维脚本（crontab / Windows 计划任务可调用）
// 建议：每天凌晨 1 点执行一次
//   crontab:  0 1 * * * node /path/to/auto_release.js
//   环境变量: AUTO_RELEASE_DAYS=30 可覆盖「超期天数」（缺省取系统配置的公海回收天数）
//
// [R-06 边界收敛 2026-09-17] 本脚本原先自建了一套释放 SQL，存在四个问题：
//   ① 越界写：非 Customer 模块直接 UPDATE crm_customer（违反 R-06 架构铁律）；
//   ② 选客条件 `status != 0` 在 status 改为字符串后**恒不成立**（MySQL 把 'following' 当 0 比较）
//      ⇒ 实测该脚本**从未真正释放过任何客户**；
//   ③ 释放时未同步 status='sea'，会留下 pool_status='sea' 而 status='following' 的不一致状态；
//   ④ 逐条 autocommit、无事务，中途失败会留下半释放状态。
// 现改为调用客户域规则 poolService.autoReleaseCustomers —— 与系统定时任务
// （cron/scheduler.js 的 01:00 作业）使用**完全相同**的实现：
// 事务内批量释放 + 公海日志 + status 同步 + SSE 通知。

const pool = require('../config/database');
const poolService = require('../services/poolService');
const { getRecycleDays } = require('../utils/config');

const ENV_DAYS = parseInt(process.env.AUTO_RELEASE_DAYS, 10);
const HAS_ENV_DAYS = Number.isInteger(ENV_DAYS) && ENV_DAYS > 0;

async function autoRelease() {
  try {
    const days = HAS_ENV_DAYS ? ENV_DAYS : await getRecycleDays();

    console.log(`[${new Date().toISOString()}] 开始执行自动释放客户任务...`);
    console.log(`  配置: 超过 ${days} 天未跟进 → 自动掉入公海（${HAS_ENV_DAYS ? '来自 AUTO_RELEASE_DAYS' : '来自系统配置'}）`);

    const released = await poolService.autoReleaseCustomers(pool, days);

    if (released === 0) {
      console.log('  无需要自动释放的客户');
    } else {
      console.log(`  已释放 ${released} 个客户（含公海日志与状态同步）`);
    }
    console.log(`[${new Date().toISOString()}] 执行完成`);
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('自动释放客户失败:', error.message);
    try { await pool.end(); } catch { /* ignore */ }
    process.exit(1);
  }
}

autoRelease();
