const Redis = require('ioredis');

const REDIS_ENABLED = process.env.REDIS_ENABLED === 'true';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

let redis = null;

if (REDIS_ENABLED) {
  redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 3) return null; // 失败3次后放弃
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true
  });

  redis.on('error', (err) => {
    console.warn('[Redis] 连接错误（已降级为无缓存模式）:', err.message);
  });

  redis.on('connect', () => {
    console.log(`[Redis] 已连接: ${REDIS_HOST}:${REDIS_PORT}`);
  });
}

module.exports = {
  redis,
  REDIS_ENABLED,
  // 安全获取缓存：失败时返回 null，不影响业务
  async getCache(key) {
    if (!redis) return null;
    try {
      const val = await redis.get(key);
      return val ? JSON.parse(val) : null;
    } catch { return null; }
  },
  // 安全设置缓存：失败静默
  async setCache(key, value, ttl = 300) {
    if (!redis) return;
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch {}
  },
  // 批量清除缓存（按前缀）
  async clearByPrefix(prefix) {
    if (!redis) return;
    try {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length > 0) await redis.del(keys);
    } catch {}
  },
  // 按模式清除缓存（支持通配符）
  async delCacheByPattern(pattern) {
    if (!redis) return;
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(...keys);
    } catch {}
  }
};
