/**
 * Redis 批量任务队列工具
 */
const { redis, REDIS_ENABLED } = require('../config/redis');
const logger = require('../config/logger');

const QUEUE_KEY = 'crm:batch:queue';
const DEAD_LETTER_KEY = 'crm:batch:dead';

/**
 * 将批量任务推入队列
 * @param {string} type - 任务类型 (customer_import 等)
 * @param {object} payload - 任务参数
 * @param {number} userId - 操作用户ID
 */
async function enqueue(type, payload, userId) {
  if (!REDIS_ENABLED || !redis) {
    throw new Error('Redis 不可用，无法加入队列');
  }
  const job = JSON.stringify({ type, payload, userId, createdAt: Date.now() });
  await redis.lpush(QUEUE_KEY, job);
  return { queued: true };
}

/**
 * 从队列取出并逐条处理
 * @param {object} pool - 数据库连接池
 * @param {Function} handler - (pool, job) => Promise<void>
 */
async function processBatch(pool, handler) {
  let hasMore = true;
  while (hasMore) {
    const jobStr = await redis.rpop(QUEUE_KEY);
    if (!jobStr) {
      hasMore = false;
      break;
    }

    const job = JSON.parse(jobStr);
    try {
      await handler(pool, job);
    } catch (error) {
      logger.error('[Queue] 批量任务失败', { job, error: error.stack || error.message });
      // 失败任务写入死信队列
      await redis.lpush(DEAD_LETTER_KEY, JSON.stringify({ ...job, error: error.message, failedAt: Date.now() }));
    }
  }
}

/**
 * 获取死信队列中的失败任务（用于排查）
 * @param {number} limit - 返回条数
 */
async function getDeadLetters(limit = 100) {
  if (!REDIS_ENABLED || !redis) return [];
  const items = await redis.lrange(DEAD_LETTER_KEY, 0, limit - 1);
  return items.map(item => {
    try {
      return JSON.parse(item);
    } catch {
      return item;
    }
  });
}

module.exports = { enqueue, processBatch, getDeadLetters, QUEUE_KEY, DEAD_LETTER_KEY };
