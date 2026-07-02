/**
 * 批量任务消费者（独立进程）
 * 启动: node workers/batchWorker.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = require('../config/database');
const { processBatch } = require('../utils/queue');
const importService = require('../services/importService');

async function handleJob(poolConn, job) {
  switch (job.type) {
    case 'customer_import': {
      const { customers } = job.payload || {};
      if (!Array.isArray(customers) || customers.length === 0) {
        console.warn('[Worker] 客户导入任务数据为空');
        return;
      }
      const result = await importService.batchImport(poolConn, customers, job.userId);
      console.log(`[Worker] 客户导入完成: 成功${result.success}条, 跳过重复${result.duplicates}条, 验证失败${result.invalid}条, 失败${result.fail}条`);
      break;
    }
    default:
      console.warn('[Worker] 未知任务类型:', job.type);
  }
}

async function main() {
  console.log('[Worker] 批量任务消费者已启动');
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await processBatch(pool, handleJob);
    await new Promise(r => setTimeout(r, 2000)); // 每 2 秒轮询
  }
}

main().catch((error) => {
  console.error('[Worker] 异常退出:', error);
  process.exit(1);
});
