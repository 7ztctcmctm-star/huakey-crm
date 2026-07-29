/**
 * CORS 安全测试
 * 验证跨域资源共享配置的正确性和安全性
 */

const request = require('supertest');
const express = require('express');
const cors = require('cors');

// 模拟生产 CORS 配置（与 app.js 保持一致）
function createApp(corsOrigin) {
  const app = express();

  app.use(cors({
    origin: corsOrigin || 'https://crm.example.com',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Trace-Id'],
    exposedHeaders: ['X-Trace-Id'],
    maxAge: 86400
  }));

  app.get('/api/v1/health', (req, res) => res.json({ code: 200, message: 'ok' }));
  app.post('/api/v1/customer', (req, res) => res.json({ code: 200, message: 'ok' }));

  // 错误处理
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    res.status(500).json({ code: 500, message: 'internal error' });
  });

  return app;
}

describe('CORS 安全配置', () => {
  describe('预检请求 (OPTIONS)', () => {
    it('应返回正确的 CORS 头', async () => {
      const app = createApp();
      const res = await request(app)
        .options('/api/v1/customer')
        .set('Origin', 'https://crm.example.com')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('https://crm.example.com');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-methods']).toContain('POST');
    });

    it('应拒绝不安全的请求方法（如 TRACE）', async () => {
      const app = createApp();
      const res = await request(app)
        .options('/api/v1/customer')
        .set('Origin', 'https://crm.example.com')
        .set('Access-Control-Request-Method', 'TRACE')
        .set('Access-Control-Request-Headers', 'Content-Type');

      // 不允许的方法不应出现在 Allow-Methods 中
      if (res.headers['access-control-allow-methods']) {
        expect(res.headers['access-control-allow-methods']).not.toContain('TRACE');
      }
    });
  });

  describe('实际请求 CORS 头', () => {
    it('允许的 origin 应返回正确的 Access-Control-Allow-Origin', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'https://crm.example.com');

      expect(res.headers['access-control-allow-origin']).toBe('https://crm.example.com');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('不允许的 origin 应不返回 Access-Control-Allow-Origin', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'https://evil.com');

      // 不应将具体 origin 暴露给未授权域
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('不应使用通配符 *（credentials 模式下不安全）', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'https://crm.example.com');

      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('应暴露自定义 trace header', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'https://crm.example.com');

      expect(res.headers['access-control-expose-headers']).toContain('X-Trace-Id');
    });
  });
});
