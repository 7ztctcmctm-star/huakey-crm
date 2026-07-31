const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({ release: jest.fn() })
};

jest.mock('../config/database', () => mockPool);

jest.mock('../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1',
  createRouteLogger: () => jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['customer:list', 'customer:add', 'customer:edit', 'customer:delete']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

jest.mock('../middleware/cache', () => ({
  cache: () => (req, res, next) => next(),
  createCache: () => (req, res, next) => next()
}));

jest.mock('../config/redis', () => ({
  clearByPrefix: jest.fn()
}));

jest.mock('../utils/config', () => ({
  getOverdueDays: jest.fn().mockResolvedValue(30)
}));

jest.mock('../utils/fieldLog', () => ({
  logFieldChanges: jest.fn().mockResolvedValue(undefined)
}));

const { appErrorHandler, globalErrorHandler } = require('../middleware/errorHandler');

const app = express();
app.use(express.json());

const detailRoutes = require('../routes/customer/detail');
app.use('/api/v1/customer', detailRoutes);
app.use(appErrorHandler);
app.use(globalErrorHandler);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('客户详情模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/v1/customer/detail/:id', () => {
    it('应该返回客户详情', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[{ id: 1, company_name: '测试公司', contact_name: '张三', status: 1, owner_id: 1 }]]) // customer
        .mockResolvedValueOnce([[ // contacts
          { id: 1, name: '张三', position: '采购经理', phone: '13800138000', is_decision: 1 }
        ]])
        .mockResolvedValueOnce([[ // follow records
          { id: 1, follow_type: '电话', content: '沟通报价事宜', creator_name: '李四' }
        ]])
        .mockResolvedValueOnce([[]]); // follow attachments

      const res = await request(app)
        .get('/api/v1/customer/detail/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.customer.company_name).toBe('测试公司');
      expect(res.body.data.contacts).toHaveLength(1);
      expect(res.body.data.followRecords).toHaveLength(1);
    });

    it('应该返回404当客户不存在', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[]]); // customer not found

      const res = await request(app)
        .get('/api/v1/customer/detail/999')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(404002);
    });
  });

  describe('GET /api/v1/customer/:id/360', () => {
    it('应该返回客户360视图', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[{ id: 1, company_name: '测试公司', owner_name: '李四' }]]) // customer
        .mockResolvedValueOnce([[]]) // contacts
        .mockResolvedValueOnce([[]]) // tags
        .mockResolvedValueOnce([[]]) // follow records
        .mockResolvedValueOnce([[]]) // opportunities
        .mockResolvedValueOnce([[]]) // quotes
        .mockResolvedValueOnce([[]]) // contracts
        .mockResolvedValueOnce([[]]) // payments
        .mockResolvedValueOnce([[]]) // service orders
        .mockResolvedValueOnce([[]]); // score logs

      const res = await request(app)
        .get('/api/v1/customer/1/360')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.customer.company_name).toBe('测试公司');
      expect(res.body.data).toHaveProperty('stats');
    });
  });

  describe('POST /api/v1/customer/export', () => {
    it('应该返回200当正常导出客户', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[ // export list
          { company_name: '测试公司', contact_name: '张三', phone: '13800138000', level: 'A', status: 1, owner_name: '李四' }
        ]]);

      const res = await request(app)
        .post('/api/v1/customer/export')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/v1/customer/detail/1');

      expect(res.status).toBe(401);
    });
  });
});

