/**
 * [P1-26] /quote/update Joi schema 契约测试（真实路由中间件）
 *
 * validate.js 的 stripUnknown=true：schema 未声明的字段会在进入 service 前被删除。
 * 这里直接挂真实 router + 真实 validate，只替换鉴权/控制器，
 * 保证“前端提交的字段能否穿过校验层”由实际代码决定，而不是源码字符串断言。
 */

jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req, res, next) => next()
}));

jest.mock('../../middleware/permission', () => ({
  checkPermission: () => (req, res, next) => next(),
  checkDataPermission: () => (req, res, next) => next(),
  checkFieldPermission: () => (req, res, next) => next()
}));

jest.mock('../../middleware/admin', () => ({
  requireManager: (req, res, next) => next()
}));

jest.mock('../../controllers/quoteController', () => {
  const echo = (req, res) => res.json({ code: 200, received: req.body });
  return { add: echo, list: echo, detail: echo, update: echo, remove: echo, toContract: echo, approve: echo };
});

const express = require('express');
const request = require('supertest');
const router = require('../../routes/quote');

const app = express();
app.use(express.json());
app.use('/api/v1/quote', router);

describe('[P1-26] POST /quote/update 参数契约', () => {
  it('currency/exchange_rate/opportunity_id 必须穿过 stripUnknown 到达控制器', async () => {
    const res = await request(app).post('/api/v1/quote/update').send({
      id: 1,
      opportunity_id: 5,
      currency: 'usd',
      exchange_rate: 7.25,
      remark: '编辑'
    });

    expect(res.status).toBe(200);
    expect(res.body.received).toMatchObject({
      id: 1,
      opportunity_id: 5,
      currency: 'USD', // Joi uppercase 归一化
      exchange_rate: 7.25,
      remark: '编辑'
    });
  });

  it('未提交可选字段时不应被补默认值（service 据此判断“保持不变”）', async () => {
    const res = await request(app).post('/api/v1/quote/update').send({ id: 1, remark: '只改备注' });

    expect(res.status).toBe(200);
    expect(res.body.received).toEqual({ id: 1, remark: '只改备注' });
  });

  it('汇率必须大于 0（0/负数拒绝）', async () => {
    for (const rate of [0, -1]) {
      const res = await request(app).post('/api/v1/quote/update').send({ id: 1, exchange_rate: rate });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    }
  });

  it('未知字段仍应被剥离（防止接口变成任意字段写入口）', async () => {
    const res = await request(app).post('/api/v1/quote/update').send({ id: 1, hacked: 'x' });

    expect(res.status).toBe(200);
    expect(res.body.received.hacked).toBeUndefined();
  });
});
