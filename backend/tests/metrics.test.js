process.env.JWT_SECRET = 'test_secret_key_for_metrics_tests';

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// 模块加载即执行 CREATE TABLE IF NOT EXISTS，query 必须有默认 Promise 返回（.catch 链）
const mockPool = { query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) };
jest.mock('../config/database', () => mockPool);
jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue([]),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const metricsRoutes = require('../routes/metrics');

const app = express();
app.use(express.json());

// metrics/client 为公开 beacon 接口（sendBeacon 无法携带认证信息），不挂 authenticateToken
app.use('/metrics', metricsRoutes);
app.use((err, _req, res, _next) => {
  res.status(err.httpStatus || err.statusCode || 500).json({ code: err.code || 500, message: err.message });
});

const token = jwt.sign(
  { userId: 7, username: 'sales01', roleId: 3, roleCode: 'sales', manageAll: false },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

describe('客户端性能指标路由 /api/v1/metrics', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
    // 模块加载时执行过一次 CREATE TABLE IF NOT EXISTS；之后所有 INSERT 一律成功
    mockPool.query.mockResolvedValue([{ affectedRows: 1 }]);
  });

  it('POST /metrics/client 上报成功返回 204', async () => {
    const res = await request(app)
      .post('/metrics/client')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 'jest-agent')
      .send({ metric_type: 'CLS', value: 0.12, rating: 'good', page_url: '/dashboard' });

    expect(res.status).toBe(204);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sys_client_perf'),
      ['CLS', 0.12, 'good', '/dashboard', 'jest-agent']
    );
  });

  it('POST /metrics/client 未登录也可上报（公开 beacon，返回 204）', async () => {
    const res = await request(app)
      .post('/metrics/client')
      .send({ metric_type: 'CLS', value: 0.12 });

    expect(res.status).toBe(204);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sys_client_perf'), expect.anything()
    );
  });

  it('POST /metrics/client value 非数字被 Joi 拒绝（400）', async () => {
    const res = await request(app)
      .post('/metrics/client')
      .set('Authorization', `Bearer ${token}`)
      .send({ metric_type: 'CLS', value: 'abc' });

    expect(res.status).toBe(400);
  });

  it('POST /metrics/client metric_type 超长被 Joi 拒绝（400）', async () => {
    const res = await request(app)
      .post('/metrics/client')
      .set('Authorization', `Bearer ${token}`)
      .send({ metric_type: 'VERYLONGTYPE', value: 1 });

    expect(res.status).toBe(400);
  });

  it('POST /metrics/client metric_type 缺失被 Joi 拒绝（400）', async () => {
    const res = await request(app)
      .post('/metrics/client')
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 1 });

    expect(res.status).toBe(400);
  });

  it('POST /metrics/client rating/page_url 可空：落库为 NULL', async () => {
    const res = await request(app)
      .post('/metrics/client')
      .set('Authorization', `Bearer ${token}`)
      .send({ metric_type: 'FCP', value: 1200 });

    expect(res.status).toBe(204);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sys_client_perf'),
      ['FCP', 1200, null, null, null]
    );
  });

  it('POST /metrics/client 库写失败返回 500', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app)
      .post('/metrics/client')
      .set('Authorization', `Bearer ${token}`)
      .send({ metric_type: 'CLS', value: 0.1 });

    expect(res.status).toBe(500);
  });
});
