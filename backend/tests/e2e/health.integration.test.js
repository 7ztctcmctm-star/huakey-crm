/**
 * 健康检查端点集成测试
 * 真实数据库连接，验证 GET /api/v1/health
 */

const request = require('supertest');
const { app, getPool } = require('../setup-integration');

const pool = getPool();

describe('健康检查 /api/health', () => {
  test('返回 200，db 状态正常', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .expect(200);

    expect(res.body.code).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.db).toBe(true);
  });

  test('旧路径 /api/health 返回 307 重定向并带 Deprecation 头', async () => {
    const res = await request(app)
      .get('/api/health')
      .redirects(0)
      .expect(307);

    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.sunset).toBe('Sat, 01 Aug 2026 00:00:00 GMT');
    expect(res.headers.location).toBe('/api/v1/health');
  });
});

