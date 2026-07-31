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
  getUserPermissions: jest.fn().mockResolvedValue(['team']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

jest.mock('../utils/config', () => ({
  getOverdueDays: jest.fn().mockResolvedValue(30),
  getConfig: jest.fn().mockResolvedValue('14')
}));

const app = express();
app.use(express.json());

const teamDashboardRoutes = require('../routes/teamDashboard');
app.use('/api/v1/team-dashboard', teamDashboardRoutes);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, manageAll: true, viewAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('团队仪表盘模块', () => {
  const token = generateToken();

  beforeEach(() => { mockPool.query.mockReset(); });

  describe('GET /api/v1/team-dashboard/overview', () => {
    it('应该返回概览数据', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[{ count: 100 }]]) // totalCustomers
        .mockResolvedValueOnce([[{ count: 5 }]]) // weekNew
        .mockResolvedValueOnce([[{ count: 20, total_amount: '500000' }]]) // activeOpps
        .mockResolvedValueOnce([[{ count: 3 }]]) // overdueCount
        .mockResolvedValueOnce([[{ total: '200000' }]]) // contractAmount
        .mockResolvedValueOnce([[{ total: '150000' }]]) // paymentAmount
        .mockResolvedValueOnce([[{ target_total: '300000' }]]); // targetResult

      const res = await request(app)
        .get('/api/v1/team-dashboard/overview')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('total_customers');
      expect(res.body.data).toHaveProperty('contract_amount');
      expect(res.body.data.total_customers).toBe(100);
    });
  });

  describe('GET /api/v1/team-dashboard/sales-breakdown', () => {
    it('应该返回销售分解数据', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[ // salesUsers
          { id: 1, real_name: '张三', username: 'zhangsan', dept_name: '销售部' },
          { id: 2, real_name: '李四', username: 'lisi', dept_name: '销售部' }
        ]])
        .mockResolvedValueOnce([[ // aggStats
          { user_id: 1, customer_count: 30, active_opp_count: 5, active_opp_amount: '200000', contract_amount: '100000', payment_amount: '80000', no_follow_count: 3 },
          { user_id: 2, customer_count: 20, active_opp_count: 3, active_opp_amount: '150000', contract_amount: '50000', payment_amount: '40000', no_follow_count: 1 }
        ]])
        .mockResolvedValueOnce([[ // taskStats
          { user_id: 1, task_count: 2 }
        ]])
        .mockResolvedValueOnce([[ // targetStats
          { user_id: 1, total: '150000' },
          { user_id: 2, total: '100000' }
        ]]);

      const res = await request(app)
        .get('/api/v1/team-dashboard/sales-breakdown')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toHaveProperty('customer_count');
      expect(res.body.data[0]).toHaveProperty('target_achievement');
    });
  });

  describe('GET /api/v1/team-dashboard/pending-approvals', () => {
    it('应该返回待审批列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[ // notifications
          { id: 1, type: 'quote_approval', business_type: 'quote', business_id: 1, content: '报价审批', from_user_name: '张三' },
          { id: 2, type: 'contract_approval', business_type: 'contract', business_id: 1, content: '合同审批', from_user_name: '李四' }
        ]])
        .mockResolvedValueOnce([[{ quote_no: 'Q-001', final_amount: 50000 }]]) // quote detail
        .mockResolvedValueOnce([[{ contract_no: 'C-001', amount: 100000 }]]); // contract detail

      const res = await request(app)
        .get('/api/v1/team-dashboard/pending-approvals')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('GET /api/v1/team-dashboard/stuck-opportunities', () => {
    it('应该返回卡住商机列表', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status

        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status
        .mockResolvedValueOnce([[ // stuck opportunities
          { id: 1, name: '大项目商机', stage: 3, expected_amount: 200000, stuck_days: 21, customer_name: '测试公司', owner_name: '张三' }
        ]]);

      const res = await request(app)
        .get('/api/v1/team-dashboard/stuck-opportunities')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.list).toHaveLength(1);
      expect(res.body.data).toHaveProperty('stuck_days');
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/v1/team-dashboard/overview');

      expect(res.status).toBe(401);
    });
  });
});

