/**
 * [P2-05] 回款金额边界 —— 真实路由 Joi 契约
 *
 * 走真实 routes/contract 路由（authenticateToken + validate），只 mock
 * 数据库认证查询与 paymentService：断言 0 / 负数 / 超 DECIMAL(15,2) 上限
 * 在进入 controller 前即 400，合法边界可到达服务层。
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_payment_amount_bounds';

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
const money = require('../../utils/money');

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
  pay_date: '2026-10-26',
  pay_amount: 100,
  pay_method: '银行转账'
};

beforeEach(() => {
  mockPool.query.mockReset();
  paymentService.recordPayment.mockClear();
  paymentService.updatePayment.mockClear();
  installAuthAwareQuery(mockPool, async (sql) => {
    if (String(sql).includes('SELECT create_by FROM crm_contract')) {
      return [[{ create_by: 1 }]];
    }
    return [[]];
  });
});

describe('[P2-05] POST /contract/payment/add 金额边界', () => {
  it.each([
    [0, /greater than or equal to 0.01/],
    [-1, /greater than or equal to 0.01/],
    [money.MAX_AMOUNT + 0.01, /less than or equal to/]
  ])('pay_amount=%p 应 400 且不调用 recordPayment', async (amount, detailPattern) => {
    const res = await request(app)
      .post('/api/v1/contract/payment/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...basePayload, pay_amount: amount });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(400);
    expect(res.body.data.some(d => d.field === 'pay_amount' && detailPattern.test(d.message))).toBe(true);
    expect(paymentService.recordPayment).not.toHaveBeenCalled();
  });

  it('pay_amount=0.004 经精度归一化为 0 后同样拒绝', async () => {
    const res = await request(app)
      .post('/api/v1/contract/payment/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...basePayload, pay_amount: 0.004 });

    expect(res.status).toBe(400);
    expect(paymentService.recordPayment).not.toHaveBeenCalled();
  });

  it.each([0.01, money.MAX_AMOUNT])('pay_amount=%p 是合法边界，应到达服务层', async (amount) => {
    const res = await request(app)
      .post('/api/v1/contract/payment/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...basePayload, pay_amount: amount });

    expect(res.status).toBe(200);
    expect(paymentService.recordPayment).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ pay_amount: amount }),
      null,
      1
    );
  });
});

describe('[P2-05] POST /contract/payment/update 金额边界', () => {
  it('pay_amount=0 应 400 且不调用 updatePayment', async () => {
    const res = await request(app)
      .post('/api/v1/contract/payment/update')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: 3,
        pay_date: '2026-10-26',
        pay_amount: 0,
        pay_method: '银行转账'
      });

    expect(res.status).toBe(400);
    expect(res.body.data.some(d => d.field === 'pay_amount')).toBe(true);
    expect(paymentService.updatePayment).not.toHaveBeenCalled();
  });

  it('合法金额应到达服务层', async () => {
    const res = await request(app)
      .post('/api/v1/contract/payment/update')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: 3,
        pay_date: '2026-10-26',
        pay_amount: 50.25,
        pay_method: '银行转账'
      });

    expect(res.status).toBe(200);
    // contractPaymentService.updatePayment 只把 pool + data 传给核心服务
    expect(paymentService.updatePayment).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ id: 3, pay_amount: 50.25 })
    );
  });
});
