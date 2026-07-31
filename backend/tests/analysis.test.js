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
  getIpAddress: () => '127.0.0.1'
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(["analysis"]),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());

const analysisRoutes = require('../routes/analysis');
app.use('/api/v1/analysis', analysisRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('数据分析模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/v1/analysis/win-rate', () => {
    it('应该返回赢单率分析', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[ // stage counts
          { stage: 1, count: 10 },
          { stage: 3, count: 5 },
          { stage: 5, count: 3 }
        ]]);

      const res = await request(app)
        .get('/api/v1/analysis/win-rate')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(6);
      expect(res.body.data[0].name).toBe('璇㈢洏');
    });
  });

  describe('GET /api/v1/analysis/funnel', () => {
    it('应该返回销售漏斗分析', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[ // funnel data
          { stage: 1, count: 20, amount: '500000' },
          { stage: 2, count: 15, amount: '400000' },
          { stage: 5, count: 5, amount: '200000' }
        ]]);

      const res = await request(app)
        .get('/api/v1/analysis/funnel')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(6);
    });
  });

  describe('GET /api/v1/analysis/rfm', () => {
    it('应该返回RFM分析', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[ // RFM data
          { id: 1, company_name: 'A客户', recency: 5, frequency: 10, monetary: 300000 },
          { id: 2, company_name: 'B客户', recency: 30, frequency: 2, monetary: 50000 }
        ]]);

      const res = await request(app)
        .get('/api/v1/analysis/rfm')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(2);
      expect(res.body.data.summary).toHaveProperty('A');
    });
  });

  describe('GET /api/v1/analysis/churn-alert', () => {
    it('应该返回流失预警', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ total: 1 }]]) // count
        .mockResolvedValueOnce([[ // list
          { id: 1, company_name: '流失客户', overdue_days: 45, owner_name: '张三' }
        ]]);

      const res = await request(app)
        .get('/api/v1/analysis/churn-alert')
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, pageSize: 20 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(1);
      expect(res.body.data).toHaveProperty('overdueDays');
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/v1/analysis/win-rate');

      expect(res.status).toBe(401);
    });
  });
});

