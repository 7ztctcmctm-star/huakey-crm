#!/usr/bin/env node
/**
 * 慢查询与错误告警演练脚本 (P1-3)
 *
 * 用途：在生产部署前验证慢查询日志和 500 错误窗口告警是否真实可达。
 *
 * 用法：
 *   node scripts/drill-alerts.js              # 默认 dry-run：模拟发送，不调用真实 webhook
 *   node scripts/drill-alerts.js --live       # 真实发送告警到 WECHAT_WEBHOOK_URL
 *   node scripts/drill-alerts.js --skip-slow  # 跳过慢查询演练
 *   node scripts/drill-alerts.js --skip-error # 跳过 500 错误窗口演练
 *
 * 退出码：
 *   0 - 演练完成
 *   1 - 环境不满足或发生未处理异常
 */

const fs = require('fs');
const path = require('path');

const SCRIPT_NAME = 'drill-alerts.js';

/**
 * 从项目根目录的 .env 文件加载环境变量（不覆盖已存在的环境变量）
 */
function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.substring(0, idx).trim();
    const value = trimmed.substring(idx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

/**
 * 解析命令行参数
 * @param {string[]} argv
 */
function parseArgs(argv) {
  return {
    live: argv.includes('--live'),
    skipSlow: argv.includes('--skip-slow'),
    skipError: argv.includes('--skip-error'),
    help: argv.includes('--help') || argv.includes('-h')
  };
}

function printUsage() {
  console.log(`
用法：node ${SCRIPT_NAME} [选项]

选项：
  --live        真实发送告警（默认 dry-run，仅模拟发送）
  --skip-slow   跳过慢查询演练
  --skip-error  跳过 500 错误窗口演练
  --help, -h    显示帮助
`);
}

/**
 * 校验 --live 模式所需环境变量
 * @param {NodeJS.ProcessEnv} env
 * @returns {string|null} 错误信息，通过时返回 null
 */
function validateEnvForLive(env) {
  if (env.ALERT_ENABLED !== 'true') {
    return 'ALERT_ENABLED 必须设置为 true';
  }
  if (!env.WECHAT_WEBHOOK_URL) {
    return 'WECHAT_WEBHOOK_URL 未配置';
  }
  return null;
}

/**
 * 慢查询演练：执行 SELECT SLEEP(2)，触发 slowQuery.js 的慢查询日志
 */
async function runSlowQueryDrill() {
  // 临时设置 NODE_ENV=test 防止 database.js 在连接失败时直接 process.exit
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  require('../config/slowQuery');
  const pool = require('../config/database');
  process.env.NODE_ENV = originalNodeEnv;

  console.log('\n[慢查询演练] 测试数据库连接...');
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    throw new Error(`数据库连接失败：${err.message}（可添加 --skip-slow 跳过慢查询演练）`);
  }

  console.log('[慢查询演练] 执行 SELECT SLEEP(2) ...');
  const start = Date.now();
  await pool.query('SELECT SLEEP(2)');
  const duration = Date.now() - start;
  console.log(`[慢查询演练] 查询完成，耗时 ${duration}ms`);
  console.log('[慢查询演练] 请检查应用日志中是否出现 "Slow query detected" 记录');
}

/**
 * 500 错误窗口演练：触发 11 次 record500Error，达到 alert.js 的阈值
 */
async function runErrorAlertDrill() {
  console.log('\n[500 错误窗口演练] 触发 11 次 record500Error ...');
  const { record500Error } = require('../utils/alert');
  for (let i = 1; i <= 11; i++) {
    record500Error();
    if (i % 5 === 0) {
      console.log(`[500 错误窗口演练] 已触发 ${i} 次`);
    }
  }
  console.log('[500 错误窗口演练] 请检查是否收到企业微信/邮件告警');
}

/**
 * 在 dry-run 模式下 mock 通知发送函数
 */
function mockNotifications() {
  const notification = require('../utils/notification');
  notification.sendMarkdown = async (markdown) => {
    console.log('\n[DRY-RUN] 企业微信消息:\n', markdown);
  };
  notification.sendEmailAlert = async (context) => {
    console.log('\n[DRY-RUN] 邮件告警:', JSON.stringify(context, null, 2));
  };
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  console.log('========================================');
  console.log('Huakey CRM 慢查询与错误告警演练');
  console.log('========================================');

  if (args.live) {
    const error = validateEnvForLive(process.env);
    if (error) {
      console.error(`\n❌ --live 模式环境校验失败: ${error}`);
      process.exit(1);
    }
    console.log('\n模式: LIVE（将真实发送告警）');
  } else {
    console.log('\n模式: DRY-RUN（模拟发送，不调用真实 webhook）');
  }

  // 确保 alert.js 加载时 ALERT_ENABLED 为 true
  process.env.ALERT_ENABLED = 'true';
  // 防止 alert.js 启动 5 分钟周期定时器，导致脚本无法自然退出
  process.env.JEST_WORKER_ID = process.env.JEST_WORKER_ID || 'drill';

  if (!args.live) {
    mockNotifications();
  }

  try {
    if (!args.skipSlow) {
      await runSlowQueryDrill();
    } else {
      console.log('\n[慢查询演练] 已跳过');
    }

    if (!args.skipError) {
      await runErrorAlertDrill();
    } else {
      console.log('\n[500 错误窗口演练] 已跳过');
    }

    console.log('\n✅ 演练完成');
  } catch (err) {
    console.error('\n❌ 演练失败:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadEnv,
  parseArgs,
  validateEnvForLive,
  runSlowQueryDrill,
  runErrorAlertDrill
};
