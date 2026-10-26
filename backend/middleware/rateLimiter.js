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
    // [P1-10] Redis 故障时的进程内降级计数（不跨实例，但不阻断请求）
    this.fallback = new Map();
  }

  _fallbackIncrement(key) {
    const now = Date.now();
    const record = this.fallback.get(key);
    if (!record || record.resetTime.getTime() <= now) {
      const resetTime = new Date(now + this.windowMs);
      // 存储与返回必须是两个对象：返回的计数快照不能被后续 increment 原地改掉
      this.fallback.set(key, { totalHits: 1, resetTime });
      // 防止降级期间 Map 无限增长：超过阈值时清理已过期项
      if (this.fallback.size > 5000) {
        for (const [k, v] of this.fallback) {
          if (v.resetTime.getTime() <= now) this.fallback.delete(k);
        }
      }
      return { totalHits: 1, resetTime };
    }
    record.totalHits += 1;
    // 快照返回，避免 express-rate-limit 持有的 rateLimit 对象随 Map 记录一起变化
    return { totalHits: record.totalHits, resetTime: new Date(record.resetTime.getTime()) };
  }

  async increment(key) {
    const fullKey = `${this.prefix}:${key}`;
    try {
      const pipeline = redis.pipeline();
      pipeline.incr(fullKey);
      pipeline.pexpire(fullKey, this.windowMs);
      const results = await pipeline.exec();
      const totalHits = results?.[0]?.[1];
      if (typeof totalHits !== 'number') throw new Error('Redis 限流返回值异常');
      return { totalHits, resetTime: new Date(Date.now() + this.windowMs) };
    } catch (error) {
      // [P1-10] Redis 抖动不得放大为全站 500：降级为进程内计数，请求继续
      if (!this._degradedLoggedAt || Date.now() - this._degradedLoggedAt > 60000) {
        this._degradedLoggedAt = Date.now();
        console.warn('[RateLimit] Redis 不可用，已降级为内存计数:', error.message);
      }
      return this._fallbackIncrement(key);
    }
  }

  async decrement(key) {
    const fullKey = `${this.prefix}:${key}`;
    const record = this.fallback.get(key);
    if (record && record.totalHits > 0) record.totalHits -= 1;
    try {
      await redis.decr(fullKey);
    } catch { /* Redis 不可用：降级计数已回退 */ }
  }

  async resetKey(key) {
    const fullKey = `${this.prefix}:${key}`;
    this.fallback.delete(key);
    try {
      await redis.del(fullKey);
    } catch { /* Redis 不可用：忽略 */ }
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
    // [P1-10] store 抛错时放行请求（配合 RedisRateLimitStore 的降级计数），
    // 避免 Redis 抖动期间登录/API 全部 500（express-rate-limit v8 默认 false）
    passOnStoreError: true,
    // X-Forwarded-For: 仅当 TRUST_PROXY=true 时信任代理 IP
    validate: {
      xForwardedForHeader: process.env.TRUST_PROXY === 'true',
      forwardedHeader: process.env.TRUST_PROXY === 'true',
    },
    // eslint-disable-next-line no-unused-vars
    keyGenerator: (req, res) => {
      // [2026-10-23 修复] express-rate-limit v8 的 ipKeyGenerator 签名是 (ip字符串)，
      // 不再是 v7 的 (req)。旧写法 ipKeyGenerator(req) 把 req 对象传进去后原样返回，
      // 模板字符串化成 "[object Object]" —— Redis 实测所有端点的限流 key 全是
      // ratelimit:[object Object]:/xxx，全公司共享每个端点同一个桶（登录 30 次/15min
      // 全员共摊，同事轮流登录+重试迅速打满 429，且 Redis 持久化重启无效）。
      const ip = ipKeyGenerator(req.ip);
      const endpoint = req.path || req.route?.path || 'unknown';
      return `${ip}:${endpoint}`;
    },
    skip: options.skip || (() => false),
    handler: (req, res) => {
      // [P2-17] express-rate-limit v8 只在默认 handler 中消费 options.message，
      // 自定义 handler 读 req.rateLimit.message 恒为 undefined，导致 authLimiter /
      // survey 等配置的专属文案从未生效（一律显示通用文案）。这里直接使用配置值。
      const configured = config.message;
      const message = typeof configured === 'string'
        ? configured
        : (configured && configured.message) || '请求过于频繁，请稍后再试';
      const extraData = (configured && typeof configured === 'object' && configured.data) || {};
      res.status(429).json({
        code: 429,
        message,
        data: {
          ...extraData,
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

// [安全修复] 验证码获取限流：生产环境15分钟内60次，开发环境1000次（防止验证码内存/CPU DoS）
const captchaLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 60 : 1000,
  message: {
    code: 429,
    message: '验证码获取过于频繁，请15分钟后再试',
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
    // [2026-10-23 修复] 同上：v8 签名为 (ip) 非 (req)
    const ip = ipKeyGenerator(req.ip);
    const campaignId = req.params.campaign_id || 'unknown';
    return `${ip}:survey:respond:${campaignId}`;
  }
});

// [安全修复] 公开调查回复全局限流：按 IP 维度，生产环境1小时内20次，防止跨活动刷量
const surveyGlobalResponderLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: isProduction ? 20 : 200,
  message: {
    code: 429,
    message: '调查提交过于频繁，请稍后再试',
    data: null
  },
  // eslint-disable-next-line no-unused-vars
  keyGenerator: (req, res) => {
    // [2026-10-23 修复] 同上：v8 签名为 (ip) 非 (req)
    const ip = ipKeyGenerator(req.ip);
    return `${ip}:survey:respond:global`;
  }
});

// [P2-17] 公开性能上报专用限流：sendBeacon 无法携带认证/CSRF，仅靠全局
// apiLimiter（1000 次/15 分钟/IP）对公开写接口过宽。每次页面加载约上报 5 项
// Web Vitals，生产阈值 300 次/15 分钟（≈60 次页面加载/IP）；超限只丢弃性能样本，
// 不影响业务功能，因此无需与业务接口共享额度。开发/测试环境维持 1000 避免误伤。
const metricsLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 300 : 1000,
  message: {
    code: 429,
    message: '性能指标上报过于频繁，请稍后再试',
    data: null
  }
});

module.exports = {
  createRateLimiter,
  apiLimiter,
  captchaLimiter,
  authLimiter,
  surveyRespondLimiter,
  surveyGlobalResponderLimiter,
  metricsLimiter,
  RedisRateLimitStore
};
