/**
 * P1-10：Redis 故障不得放大为全站 500。
 *
 * 审计结论：RedisRateLimitStore.increment 直接 await redis pipeline；
 * express-rate-limit v8 默认 passOnStoreError=false ⇒ Redis 抖动时所有挂
 * apiLimiter/authLimiter 的请求直接 500，且恢复依赖重启。
 * 修复：store 内部降级为进程内计数；另开 passOnStoreError 兜底放行。
 */

const express = require('express');
const request = require('supertest');

jest.mock('../../config/redis', () => {
  const pipeline = {
    incr: jest.fn().mockReturnThis(),
    pexpire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
  };
  return {
    REDIS_ENABLED: true,
    redis: {
      pipeline: jest.fn(() => pipeline),
      decr: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      del: jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    }
  };
});

const { createRateLimiter, RedisRateLimitStore } = require('../../middleware/rateLimiter');

function appWith(limiter) {
  const app = express();
  app.use(limiter);
  app.get('/ping', (req, res) => res.json({ ok: true }));
  return app;
}

describe('RedisRateLimitStore 降级（P1-10）', () => {
  it('Redis pipeline 失败时返回可用的内存计数，而不是抛错', async () => {
    const store = new RedisRateLimitStore(60000);
    const first = await store.increment('1.2.3.4:/login');
    const second = await store.increment('1.2.3.4:/login');
    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(second.resetTime.getTime()).toBeGreaterThan(Date.now());
  });

  it('decrement / resetKey 在 Redis 失败时静默', async () => {
    const store = new RedisRateLimitStore(60000);
    await store.increment('k');
    await expect(store.decrement('k')).resolves.toBeUndefined();
    await expect(store.resetKey('k')).resolves.toBeUndefined();
  });

  it('降级期间仍按内存计数触发 429（限流未失效）', async () => {
    const app = appWith(createRateLimiter({ windowMs: 60000, max: 2 }));
    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(200);
    const third = await request(app).get('/ping');
    expect(third.status).toBe(429);
  });

  it('store 完全抛错时 passOnStoreError 放行，不返回 500', async () => {
    const spy = jest.spyOn(RedisRateLimitStore.prototype, 'increment')
      .mockRejectedValue(new Error('store exploded'));
    try {
      const app = appWith(createRateLimiter({ windowMs: 60000, max: 10 }));
      const res = await request(app).get('/ping');
      expect(res.status).toBe(200);
    } finally {
      spy.mockRestore();
    }
  });
});
