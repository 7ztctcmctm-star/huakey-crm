/**
 * 健康检查端点集成测试
 * 真实数据库连接，验证 GET /api/health
 */

const request = require('supertest');
const { app, getPool } = require('../setup-integration');

const pool = getPool();

describe('健康检查 /api/health', () => {
  test('返回 200，db 状态正常', async () => {
    const res = await request(app)
      .get('/api/health')
      .expect(200);

    expect(res.body.code).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.db).toBe(true);
  });
});
