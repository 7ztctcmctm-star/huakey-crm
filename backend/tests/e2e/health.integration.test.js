/**
 * 健康检查端点集成测试
 * 真实数据库连接，验证 GET /api/v1/health
 */

const request = require('supertest');
const { app } = require('../setup-integration');

describe('健康检查 /api/health', () => {
  test('返回 200，db 状态正常', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .expect(200);

    expect(res.body.code).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.db).toBe(true);
  });

  test('旧路径 /api/health 不再重定向，返回 404', async () => {
    const res = await request(app)
      .get('/api/health')
      .redirects(0)
      .expect(404);

    expect(res.headers.deprecation).toBeUndefined();
    expect(res.headers.sunset).toBeUndefined();
    expect(res.headers.location).toBeUndefined();
  });
});

