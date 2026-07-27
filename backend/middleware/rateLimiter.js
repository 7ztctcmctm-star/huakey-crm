const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { redis, REDIS_ENABLED } = require('../config/redis');

const isProduction = process.env.NODE_ENV === 'production';

/**
 * 基于 ioredis 的限流存储后端
 * Key 格式: ratelimit:{ip}:{endpoint}
 * TTL 等于窗口时间，重启后计数不丢失
 */
class RedisRateLimitStore {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this.prefix = 'ratelimit';
  }

  async increment(key) {
    const fullKey = `${this.prefix}:${key}`;
    const pipeline = redis.pipeline();
    pipeline.incr(fullKey);
    pipeline.pexpire(fullKey, this.windowMs);
    const results = await pipeline.exec();
    const totalHits = results[0][1];
    const resetTime = new Date(Date.now() + this.windowMs);
    return { totalHits, resetTime };
  }

  async decrement(key) {
    const fullKey = `${this.prefix}:${key}`;
    await redis.decr(fullKey);
  }

  async resetKey(key) {
    const fullKey = `${this.prefix}:${key}`;
    await redis.del(fullKey);
  }
}

const createRateLimiter = (options = {}) => {
  const windowMs = options.windowMs || 15 * 60 * 1000;
  const config = {
    windowMs,
    max: options.max || (isProduction ? 100 : 1000),
    message: options.message || {
      code: 429,
      message: '请求过于频繁，请稍后再试',
      data: null
    },
    standardHeaders: true,
    legacyHeaders: false,
    // X-Forwarded-For: 仅当 TRUST_PROXY=true 时信任代理 IP
    validate: {
      xForwardedForHeader: process.env.TRUST_PROXY === 'true',
      forwardedHeader: process.env.TRUST_PROXY === 'true',
    },
    // eslint-disable-next-line no-unused-vars
    keyGenerator: (req, res) => {
      const ip = ipKeyGenerator(req);
      const endpoint = req.path || req.route?.path || 'unknown';
      return `${ip}:${endpoint}`;
    },
    skip: options.skip || (() => false),
    handler: (req, res) => {
      res.status(429).json({
        code: 429,
        message: req.rateLimit?.message || '请求过于频繁，请稍后再试',
        data: {
          retryAfter: Math.ceil(req.rateLimit.resetTime / 1000) - Date.now() / 1000
        }
      });
    }
  };

  // Redis 可用时使用 Redis 存储，否则回退到内存 Map
  if (REDIS_ENABLED && redis) {
    config.store = new RedisRateLimitStore(windowMs);
  }

  return rateLimit(config);
};

const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  skip: (req) => req.path === '/health'
});

// [安全修复] 登录限流：生产环境15分钟内30次，开发环境1000次
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 30 : 1000,
  message: {
    code: 429,
    message: '登录尝试次数过多，请15分钟后再试',
    data: null
  }
});

// [安全修复] 公开调查回复限流：按 IP + campaign_id 维度，生产环境15分钟内10次，开发环境100次
const surveyRespondLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 10 : 100,
  message: {
    code: 429,
    message: '该调查提交过于频繁，请15分钟后再试',
    data: null
  },
  // eslint-disable-next-line no-unused-vars
  keyGenerator: (req, res) => {
    const ip = ipKeyGenerator(req);
    const campaignId = req.params.campaign_id || 'unknown';
    return `${ip}:survey:respond:${campaignId}`;
  }
});

module.exports = {
  createRateLimiter,
  apiLimiter,
  authLimiter,
  surveyRespondLimiter,
  RedisRateLimitStore
};
