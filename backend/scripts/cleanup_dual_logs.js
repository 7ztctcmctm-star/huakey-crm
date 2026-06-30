/**
 * 一次性清理脚本：处理 sys_log / sys_operation_log 双表并存问题
 * 运行方式：node backend/scripts/cleanup_dual_logs.js
 */

const pool = require('../config/database');
const { queryTableUsage, scanCodeReferences, cleanupDualLogs } = require('../services/logService');

async function main() {
  try {
    console.log('=== 双表并存诊断 ===');

    const usage = await queryTableUsage(pool);
    console.log('表使用情况:', JSON.stringify(usage, null, 2));

    const refs = scanCodeReferences();
    console.log('代码引用情况:', JSON.stringify(refs, null, 2));

    console.log('\n=== 执行清理 ===');
    const result = await cleanupDualLogs(pool, usage);
    console.log('清理结果:', JSON.stringify(result, null, 2));

    if (result.dropped) {
      console.log('\n✓ sys_operation_log 已成功删除');
    } else if (result.skipped) {
      console.log('\n! 清理已跳过:', result.message);
    }
  } catch (error) {
    console.error('清理失败:', error.stack || error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
