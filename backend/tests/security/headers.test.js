/**
 * 安全响应头测试
 * 验证 Helmet 安全头配置的正确性
 */

const request = require('supertest');
const express = require('express');
const helmet = require('helmet');

function createApp(helmetConfig) {
  const app = express();

  app.use(helmet(helmetConfig || {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      }
    },
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  }));

  app.get('/api/v1/health', (req, res) => res.json({ code: 200, message: 'ok' }));

  return app;
}

describe('安全响应头配置', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  describe('基础安全头', () => {
    it('应包含 X-Content-Type-Options: nosniff', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('应包含 X-Frame-Options: DENY 或 CSP frame-ancestors', async () => {
      const res = await request(app).get('/api/v1/health');
      const hasFrameProtection =
        res.headers['x-frame-options'] === 'DENY' ||
        res.headers['x-frame-options'] === 'SAMEORIGIN' ||
        (res.headers['content-security-policy'] || '').includes('frame-ancestors');
      expect(hasFrameProtection).toBe(true);
    });

    it('应包含 Referrer-Policy', async () => {
      const appWithReferrer = express();
      appWithReferrer.use(helmet({ referrerPolicy: { policy: 'strict-origin-when-cross-origin' } }));
      appWithReferrer.get('/test', (req, res) => res.json({ ok: true }));

      const res = await request(appWithReferrer).get('/test');
      expect(res.headers['referrer-policy']).toBeDefined();
    });

    it('应包含 X-DNS-Prefetch-Control: off', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.headers['x-dns-prefetch-control']).toBe('off');
    });

    it('应包含 X-Permitted-Cross-Domain-Policies: none', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.headers['x-permitted-cross-domain-policies']).toBe('none');
    });

    it('应移除 X-Powered-By 头', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('CSP (Content-Security-Policy)', () => {
    it('应包含 CSP 头', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.headers['content-security-policy']).toBeDefined();
    });

    it("object-src 应为 'none'", async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.headers['content-security-policy']).toContain("object-src 'none'");
    });

    it("frame-ancestors 应限制为 'none'", async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    });

    it("default-src 应为 'self'", async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    });
  });

  describe('HSTS (HTTP Strict-Transport-Security)', () => {
    it('应包含 HSTS 头（生产环境）', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['strict-transport-security']).toContain('max-age=');
    });

    it('应包含 includeSubDomains', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.headers['strict-transport-security']).toContain('includeSubDomains');
    });
  });

  describe('X-XSS-Protection', () => {
    it('应设置为 0（禁用浏览器内置 XSS 过滤器，避免误报）', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.headers['x-xss-protection']).toBe('0');
    });
  });
});
