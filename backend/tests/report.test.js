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
  getUserPermissions: jest.fn().mockResolvedValue(['report']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

jest.mock('../middleware/cache', () => ({
  cache: () => (req, res, next) => next(),
  createCache: () => (req, res, next) => next()
}));

jest.mock('../utils/config', () => ({
  getOverdueDays: jest.fn().mockResolvedValue(30)
}));

const app = express();
app.use(express.json());

const reportRoutes = require('../routes/report');
app.use('/api/v1/report', reportRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('报表中心模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/v1/report/overview', () => {
    it('应该返回概览数据', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        // Promise.all with 7 parallel queries
        .mockResolvedValueOnce([[{ amount: 500000 }]]) // monthSales
        .mockResolvedValueOnce([[{ count: 10 }]]) // monthCustomers
        .mockResolvedValueOnce([[{ count: 5 }]]) // monthContracts
        .mockResolvedValueOnce([[{ amount: 300000 }]]) // monthPayments
        .mockResolvedValueOnce([[{ amount: 800000 }]]) // opportunityAmount
        .mockResolvedValueOnce([[{ count: 8 }]]) // monthLeads
        .mockResolvedValueOnce([[{ count: 3 }]]); // monthConverted

      const res = await request(app)
        .get('/api/v1/report/overview')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('month_sales');
      expect(res.body.data).toHaveProperty('month_customers');
      expect(res.body.data).toHaveProperty('opportunity_amount');
    });
  });

  describe('GET /api/v1/report/sales-funnel', () => {
    it('应该返回销售漏斗', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[ // funnel data
          { stage: 1, count: 20, amount: '500000' },
          { stage: 2, count: 15, amount: '400000' },
          { stage: 5, count: 5, amount: '200000' }
        ]]);

      const res = await request(app)
        .get('/api/v1/report/sales-funnel')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(6);
      expect(res.body.data[0].stage).toBe('询盘');
    });
  });

  describe('GET /api/v1/report/customer', () => {
    it('应该返回客户报表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ count: 15 }]]) // monthCount
        .mockResolvedValueOnce([[ // sourceDist
          { source: '网络', count: 8 },
          { source: '展会', count: 5 }
        ]])
        .mockResolvedValueOnce([[ // sourceDetailDist
          { source: 'Facebook', count: 4 },
          { source: '展会', count: 5 }
        ]])
        .mockResolvedValueOnce([[ // levelDist
          { level: 'A', count: 3 },
          { level: 'B', count: 7 },
          { level: 'C', count: 5 }
        ]]);

      const res = await request(app)
        .get('/api/v1/report/customer')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('month_new');
      expect(res.body.data).toHaveProperty('source_dist');
      expect(res.body.data).toHaveProperty('level_dist');
    });
  });

  describe('GET /api/v1/report/today-tasks', () => {
    it('应该返回今日任务', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[ // follow list
          { id: 1, follow_type: '电话', content: '回访客户', company_name: '测试公司' }
        ]])
        .mockResolvedValueOnce([[{ total: 1 }]]) // follow total
        .mockResolvedValueOnce([[ // service list
          { id: 1, order_no: 'SO-001', title: '设备维修', status: 1 }
        ]])
        .mockResolvedValueOnce([[{ total: 1 }]]); // service total

      const res = await request(app)
        .get('/api/v1/report/today-tasks')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.follow_list).toHaveLength(1);
      expect(res.body.data.service_list).toHaveLength(1);
    });
  });

  describe('POST /api/v1/report/export', () => {
    it('应该返回200当正常导出报表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ '销售姓名': '张三', '成交金额': 100000, '回款金额': 80000 }]]) // perfRows
        .mockResolvedValueOnce([[{ '阶段编码': 1, '商机数量': 10, '预期金额': 300000 }]]) // funnelRows
        .mockResolvedValueOnce([[{ '客户来源': '展会', '客户数量': 5 }]]) // sourceRows
        .mockResolvedValueOnce([[{ '供应商': '供应商A', '采购单数': 3, '采购总额': 150000 }]]); // purchaseRows

      const res = await request(app)
        .post('/api/v1/report/export')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/v1/report/overview');

      expect(res.status).toBe(401);
    });
  });
});

