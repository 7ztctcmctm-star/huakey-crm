/**
 * [P2-17] metrics/client 公开写接口专用限流
 *
 * 背景：`POST /api/v1/metrics/client` 为未认证、免 CSRF 的 sendBeacon 端点，
 * 修复前只有全局 apiLimiter（1000 次/15 分钟/IP）兜底，公开写接口缺少专用阈值。
 *
 * 本测试把 NODE_ENV 切到 production 后加载真实限流器与真实路由，
 * 直接打满 `metricsLimiter` 的生产阈值，验证：
 *   ① 阈值内的合法上报仍返回 204；
 *   ② 超过阈值返回 429 + 统一错误体；
 *   ③ 429 之后不再写库（防止绕过限流继续落库）。
 */

process.env.NODE_ENV = 'production';

const request = require('supertest');
const express = require('express');

const mockPool = { query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) };
jest.mock('../../config/database', () => mockPool);
jest.mock('../../config/redis', () => ({ redis: null, REDIS_ENABLED: false }));

const metricsRoutes = require('../../routes/metrics');
const { metricsLimiter } = require('../../middleware/rateLimiter');

const app = express();
app.use(express.json());
app.use('/metrics', metricsRoutes);
app.use((err, _req, res, _next) => {
  res.status(err.httpStatus || err.statusCode || 500).json({ code: err.code || 500, message: err.message });
});

describe('[P2-17] metrics/client 专用限流', () => {
  jest.setTimeout(60000);

  beforeEach(() => {
    mockPool.query.mockClear();
    metricsLimiter.resetKey('::ffff:127.0.0.1:/client');
    metricsLimiter.resetKey('127.0.0.1:/client');
  });

  it('生产阈值 300 次/15 分钟：第 301 次返回 429 且不再写库', async () => {
    const send = () => request(app)
      .post('/metrics/client')
      .send({ metric_type: 'CLS', value: 0.1 });

    for (let i = 0; i < 300; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await send();
      expect(res.status).toBe(204);
    }

    const insertsBefore = mockPool.query.mock.calls
      .filter(([sql]) => String(sql).includes('INSERT INTO sys_client_perf')).length;

    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe(429);
    expect(blocked.body.message).toContain('性能指标上报过于频繁');

    const insertsAfter = mockPool.query.mock.calls
      .filter(([sql]) => String(sql).includes('INSERT INTO sys_client_perf')).length;
    expect(insertsAfter).toBe(insertsBefore);
  });
});
