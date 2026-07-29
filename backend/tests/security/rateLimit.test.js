/**
 * 速率限制安全测试
 * 验证 API 限流中间件配置和行为的正确性
 */

const request = require('supertest');
const express = require('express');
const { rateLimit, MemoryStore } = require('express-rate-limit');

const { createRateLimiter } = require('../../middleware/rateLimiter');

// 使用测试专用的内存存储限流器
function createTestLimiter(max = 5, windowMs = 60 * 1000) {
  return rateLimit({
    windowMs,
    max,
    store: new MemoryStore(),
    message: { code: 429, message: '请求过于频繁，请稍后再试', data: null },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    skip: () => false,
  });
}

function createApp(limiter) {
  const app = express();
  app.use(express.json());
  app.use(limiter);

  app.get('/api/v1/test', (req, res) => res.json({ code: 200, message: 'ok' }));
  app.post('/api/v1/test', (req, res) => res.json({ code: 200, message: 'ok' }));

  return app;
}

describe('速率限制', () => {
  describe('基础限流', () => {
    it('在未超限时应返回 200', async () => {
      const app = createApp(createTestLimiter(10, 60 * 1000));
      const res = await request(app).get('/api/v1/test');
      expect(res.status).toBe(200);
    });

    it('超过限制时应返回 429', async () => {
      const app = createApp(createTestLimiter(3, 60 * 1000));

      // 发送 4 次请求（最大 3 次）
      for (let i = 0; i < 3; i++) {
        await request(app).get('/api/v1/test');
      }
      const res = await request(app).get('/api/v1/test');

      expect(res.status).toBe(429);
    });

    it('429 响应应包含标准 RateLimit 头', async () => {
      const app = createApp(createTestLimiter(2, 60 * 1000));

      for (let i = 0; i < 2; i++) {
        await request(app).get('/api/v1/test');
      }
      const res = await request(app).get('/api/v1/test');

      // 标准头 RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset
      // 或旧式头 X-RateLimit-Limit 应该存在其中之一
      const hasRateLimitHeaders =
        res.headers['ratelimit-limit'] !== undefined ||
        res.headers['x-ratelimit-limit'] !== undefined ||
        res.headers['ratelimit-remaining'] !== undefined ||
        res.headers['x-ratelimit-remaining'] !== undefined;
      expect(hasRateLimitHeaders).toBe(true);
    });

    it('429 响应体应包含结构化错误码', async () => {
      const app = createApp(createTestLimiter(2, 60 * 1000));

      for (let i = 0; i < 2; i++) {
        await request(app).get('/api/v1/test');
      }
      const res = await request(app).get('/api/v1/test');

      expect(res.status).toBe(429);
      expect(res.body).toHaveProperty('code', 429);
      expect(res.body).toHaveProperty('message');
    });
  });

  describe('createRateLimiter 工厂函数', () => {
    it('应正确创建限流中间件', () => {
      const limiter = createRateLimiter({ windowMs: 60000, max: 50 });
      expect(limiter).toBeDefined();
      expect(typeof limiter).toBe('function');
    });

    it('apiLimiter 应正确导出', () => {
      const { apiLimiter } = require('../../middleware/rateLimiter');
      expect(apiLimiter).toBeDefined();
    });

    it('authLimiter 应正确导出', () => {
      const { authLimiter } = require('../../middleware/rateLimiter');
      expect(authLimiter).toBeDefined();
    });

    it('surveyRespondLimiter 应正确导出', () => {
      const { surveyRespondLimiter } = require('../../middleware/rateLimiter');
      expect(surveyRespondLimiter).toBeDefined();
    });

    it('skip 选项应支持跳过健康检查', async () => {
      const app = express();
      const skipLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 2,
        store: new MemoryStore(),
        keyGenerator: (req) => req.ip,
        skip: (req) => req.path === '/health',
        message: { code: 429, message: 'too many', data: null },
        standardHeaders: true,
        legacyHeaders: false,
      });

      app.use(skipLimiter);
      app.get('/health', (req, res) => res.json({ code: 200 }));
      app.get('/api/test', (req, res) => res.json({ code: 200 }));

      // 健康检查不应受限于限流
      for (let i = 0; i < 10; i++) {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
      }
    });
  });

  describe('限流维度验证', () => {
    it('不同 IP 应使用独立计数器', async () => {
      const app = createApp(createTestLimiter(2, 60 * 1000));

      // IP A 用满额度
      await request(app).get('/api/v1/test').set('X-Forwarded-For', '10.0.0.1');
      await request(app).get('/api/v1/test').set('X-Forwarded-For', '10.0.0.1');

      // IP B 应不受影响
      const res = await request(app).get('/api/v1/test').set('X-Forwarded-For', '10.0.0.2');
      expect(res.status).toBe(200);
    });
  });
});
