/**
 * customerController 集成测试
 * 验证 Controller 层编排逻辑：service 调用、日志写入、缓存失效、统一错误码
 */

const request = require('supertest');
const express = require('express');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

// ============ Mock pool ============
const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({ release: jest.fn() })
};
jest.mock('../../../config/database', () => mockPool);

// ============ Mock services ============
const mockAddCustomer = jest.fn();
const mockUpdateCustomer = jest.fn();
const mockDeleteCustomer = jest.fn();
jest.mock('../../../services/customerDetailService', () => ({
  addCustomer: mockAddCustomer,
  updateCustomer: mockUpdateCustomer,
  deleteCustomer: mockDeleteCustomer,
  VALID_SOURCES: ['website', 'referral', 'exhibition', 'cold_call', 'other'],
  SOURCE_PARENT_MAP: { website: '线上', referral: '转介绍' }
}));

jest.mock('../../../services/customerService', () => ({
  listCustomers: jest.fn()
}));

// ============ Mock middleware ============
jest.mock('../../../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true };
    next();
  }
}));

jest.mock('../../../middleware/permission', () => ({
  checkPermission: () => (req, res, next) => next(),
  checkDataPermission: () => (req, res, next) => next()
}));

jest.mock('../../../middleware/cache', () => ({
  createCache: () => (req, res, next) => next(),
  invalidateCache: jest.fn().mockResolvedValue(undefined)
}));

const mockLogAction = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../middleware/logger', () => ({
  createRouteLogger: () => mockLogAction,
  getIpAddress: () => '127.0.0.1'
}));

jest.mock('../../../utils/fieldLog', () => ({
  logFieldChanges: jest.fn().mockResolvedValue(undefined)
}));

// ============ Setup app ============
const app = express();
app.use(express.json({ limit: '5mb' }));
const customerRoutes = require('../../../routes/customer/detail');
app.use('/api/v1/customer', customerRoutes);

// 统一错误处理中间件（模拟 app.js）
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    code: err.code || statusCode,
    message: err.message || '服务器内部错误',
    data: null
  });
});

describe('customerController 集成测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/customer/add', () => {
    it('创建客户成功：调用 service、记录日志、清除缓存', async () => {
      mockAddCustomer.mockResolvedValue({ id: 42, company_name: '铧旗科技', assignedOwner: null });
      const { invalidateCache } = require('../../../middleware/cache');

      const res = await request(app)
        .post('/api/v1/customer/add')
        .send({ company_name: '铧旗科技', source: 'website', contacts: [{ name: '张三', phone: '13800138000' }] });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.id).toBe(42);
      expect(mockAddCustomer).toHaveBeenCalledWith(mockPool, expect.objectContaining({ company_name: '铧旗科技' }), 1);
      expect(mockLogAction).toHaveBeenCalledWith(
        expect.objectContaining({ user: expect.objectContaining({ userId: 1 }) }),
        'add',
        expect.stringContaining('新增客户: 铧旗科技')
      );
      expect(invalidateCache).toHaveBeenCalledWith(['customer:list:1:*']);
    });

    it('创建客户参数校验失败：缺少公司名称返回 400', async () => {
      const res = await request(app)
        .post('/api/v1/customer/add')
        .send({ source: 'website' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
      expect(res.body.message).toContain('校验失败');
      expect(mockAddCustomer).not.toHaveBeenCalled();
    });

    it('创建客户 service 异常：返回统一错误码 500', async () => {
      mockAddCustomer.mockRejectedValue(new Error('数据库连接失败'));

      const res = await request(app)
        .post('/api/v1/customer/add')
        .send({ company_name: '铧旗科技', contacts: [{ name: '张三' }] });

      expect(res.status).toBe(500);
      expect(res.body.code).toBe(500);
      expect(res.body.message).toBe('数据库连接失败');
    });
  });

  describe('POST /api/v1/customer/update', () => {
    it('修改客户成功：记录字段变更日志', async () => {
      mockUpdateCustomer.mockResolvedValue({
        customer: { id: 1, company_name: '铧旗科技' },
        oldData: { company_name: '旧名称' }
      });
      const { invalidateCache } = require('../../../middleware/cache');

      const res = await request(app)
        .post('/api/v1/customer/update')
        .send({ id: 1, company_name: '铧旗科技' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(mockUpdateCustomer).toHaveBeenCalledWith(mockPool, 1, expect.objectContaining({ company_name: '铧旗科技' }), expect.any(Object));
      expect(mockLogAction).toHaveBeenCalled();
      expect(invalidateCache).toHaveBeenCalledWith(['customer:list:1:*']);
    });

    it('修改客户缺少 id：返回 400', async () => {
      const res = await request(app)
        .post('/api/v1/customer/update')
        .send({ company_name: '铧旗科技' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });
  });

  describe('POST /api/v1/customer/delete', () => {
    it('删除客户成功：调用 service、记录日志、清除缓存', async () => {
      mockDeleteCustomer.mockResolvedValue(undefined);
      const { invalidateCache } = require('../../../middleware/cache');

      const res = await request(app)
        .post('/api/v1/customer/delete')
        .send({ id: 1 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(mockDeleteCustomer).toHaveBeenCalledWith(mockPool, 1, expect.any(Object));
      expect(mockLogAction).toHaveBeenCalledWith(
        expect.anything(),
        'delete',
        '删除客户: ID=1'
      );
      expect(invalidateCache).toHaveBeenCalledWith(['customer:list:1:*']);
    });
  });
});
