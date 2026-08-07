/**
 * Sales Analytics API 测试 (Phase 5.5.2)
 * 覆盖: admin 全部 / sales 自己数据 / 无token 401
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_analytics';

// Mock salesAnalyticsService - 记录调用与 user
const mockGetOverview = jest.fn().mockResolvedValue({ opportunity_amount: '1000.00' });
const mockGetSalesFunnel = jest.fn().mockResolvedValue({ stages: [], win_rate: 0 });
const mockGetContractRevenue = jest.fn().mockResolvedValue({ total_amount: '0.00' });
const mockGetPaymentCollection = jest.fn().mockResolvedValue({ receivable_amount: '0.00' });

jest.mock('../../services/salesAnalyticsService', () => ({
  getOverview: (...args) => mockGetOverview(...args),
  getSalesFunnel: (...args) => mockGetSalesFunnel(...args),
  getContractRevenue: (...args) => mockGetContractRevenue(...args),
  getPaymentCollection: (...args) => mockGetPaymentCollection(...args)
}));

jest.mock('../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const app = express();
app.use(express.json());
app.use('/api/v1/analytics', require('../../routes/analytics'));

const makeToken = (overrides = {}) => jwt.sign({
  userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true, ...overrides
}, process.env.JWT_SECRET, { expiresIn: '1h' });

describe('Sales Analytics API', () => {
  beforeEach(() => {
    mockGetOverview.mockClear();
    mockGetSalesFunnel.mockClear();
    mockGetContractRevenue.mockClear();
    mockGetPaymentCollection.mockClear();
  });

  it('1. admin 访问 overview 返回全部数据', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/sales/overview')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(mockGetOverview).toHaveBeenCalledTimes(1);
    // 确认传入了 admin user (manageAll true)
    expect(mockGetOverview.mock.calls[0][1].manageAll).toBe(true);
    expect(res.body.data.opportunity_amount).toBe('1000.00');
  });

  it('2. sales 只能看到自己数据 (owner_id 过滤)', async () => {
    const salesToken = makeToken({ userId: 10, roleCode: 'sales', manageAll: false });
    await request(app)
      .get('/api/v1/analytics/sales/funnel')
      .set('Authorization', `Bearer ${salesToken}`);
    // service 收到 sales user (manageAll false), 由 service 拼 owner_id
    expect(mockGetSalesFunnel).toHaveBeenCalledTimes(1);
    expect(mockGetSalesFunnel.mock.calls[0][1].userId).toBe(10);
    expect(mockGetSalesFunnel.mock.calls[0][1].manageAll).toBe(false);
    expect(mockGetSalesFunnel.mock.calls[0][1].roleCode).toBe('sales');
  });

  it('3. 无 token 返回 401', async () => {
    const res = await request(app).get('/api/v1/analytics/sales/overview');
    expect(res.status).toBe(401);
    expect(mockGetOverview).not.toHaveBeenCalled();
  });

  it('4. contract/revenue + payment/collection 路由可访问', async () => {
    const token = makeToken();
    const res1 = await request(app).get('/api/v1/analytics/contract/revenue').set('Authorization', `Bearer ${token}`);
    expect(res1.status).toBe(200);
    expect(mockGetContractRevenue).toHaveBeenCalledTimes(1);
    const res2 = await request(app).get('/api/v1/analytics/payment/collection').set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBe(200);
    expect(mockGetPaymentCollection).toHaveBeenCalledTimes(1);
  });
});
