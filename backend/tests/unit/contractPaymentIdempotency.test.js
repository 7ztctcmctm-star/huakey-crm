/**
 * [P0-07] 回款登记幂等键接线 —— 控制器必须读到请求头
 *
 * 背景：前端 `withIdempotencyKey` 统一把 key 放在 `Idempotency-Key` 请求头，
 * 而 `contractController.addPayment` 原先只把 `req.body` 交给 service，
 * 请求头里的 key 从未被读取 ⇒ 前端加了 key 也等于没加，双击照样登记两条回款。
 *
 * 本文件走真实路由（authenticateToken + Joi + controller），只 mock：
 *   - 数据库（认证查询 + 合同归属校验）
 *   - paymentService.recordPayment（断言收到的 key / 操作人）
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_payment_idempotency';

const mockPool = { query: jest.fn() };
jest.mock('../../config/database', () => mockPool);

const { installAuthAwareQuery } = require('../helpers/authMock');

jest.mock('../../services/paymentService', () => ({
  recordPayment: jest.fn().mockResolvedValue({ id: 1 }),
  updatePayment: jest.fn().mockResolvedValue(true),
  deletePayment: jest.fn().mockResolvedValue(true),
  getOverduePayments: jest.fn().mockResolvedValue({ list: [], total: 0 }),
  getMergedPayments: jest.fn().mockResolvedValue({ list: [], total: 0 }),
  getMonthlySummary: jest.fn().mockResolvedValue({})
}));

jest.mock('../../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  logFieldChanges: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1',
  createRouteLogger: () => jest.fn().mockResolvedValue(undefined)
}));

const paymentService = require('../../services/paymentService');

const app = express();
app.use(express.json());
app.use('/api/v1/contract', require('../../routes/contract'));
app.use((err, _req, res, _next) => {
  res.status(err.httpStatus || err.statusCode || 500)
    .json({ code: err.code || 500, message: err.message });
});

const token = jwt.sign(
  { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const basePayload = {
  contract_id: 1,
  plan_id: null,
  pay_date: '2026-10-23',
  pay_amount: 100,
  pay_method: '银行转账'
};

beforeEach(() => {
  mockPool.query.mockReset();
  paymentService.recordPayment.mockClear();
  // 认证查询由 helper 处理；合同归属校验返回「本人创建」
  installAuthAwareQuery(mockPool, async (sql) => {
    if (String(sql).includes('SELECT create_by FROM crm_contract')) {
      return [[{ create_by: 1 }]];
    }
    return [[]];
  });
});

describe('[P0-07] POST /contract/payment/add 幂等键接线', () => {
  it('Idempotency-Key 请求头必须透传到 paymentService.recordPayment', async () => {
    const res = await request(app)
      .post('/api/v1/contract/payment/add')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'hdr-payment-key')
      .send(basePayload);

    expect(res.status).toBe(200);
    expect(paymentService.recordPayment).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ contract_id: 1, pay_amount: 100 }),
      'hdr-payment-key',
      1 // 操作人 ID —— 幂等键按 user 命名空间隔离
    );
  });

  it('body.idempotency_key 作为兼容回退同样生效', async () => {
    const res = await request(app)
      .post('/api/v1/contract/payment/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...basePayload, idempotency_key: 'body-payment-key' });

    expect(res.status).toBe(200);
    expect(paymentService.recordPayment).toHaveBeenCalledWith(
      mockPool,
      expect.anything(),
      'body-payment-key',
      1
    );
  });

  it('两者同时存在时以请求头为准（前端统一走请求头）', async () => {
    await request(app)
      .post('/api/v1/contract/payment/add')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'header-wins')
      .send({ ...basePayload, idempotency_key: 'body-loses' });

    expect(paymentService.recordPayment.mock.calls[0][2]).toBe('header-wins');
  });

  it('未带 key 时仍可登记（key 为 null，不阻断业务）', async () => {
    const res = await request(app)
      .post('/api/v1/contract/payment/add')
      .set('Authorization', `Bearer ${token}`)
      .send(basePayload);

    expect(res.status).toBe(200);
    expect(paymentService.recordPayment.mock.calls[0][2]).toBeNull();
  });
});
