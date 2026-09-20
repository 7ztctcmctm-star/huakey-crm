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
      expect(res.body.data[0].name).toBe('询盘');
    });
  });

  describe('GET /api/v1/analysis/funnel', () => {
    it('应该返回销售漏斗分析', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // blacklist check
        .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query
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

  describe('数据范围与权限闸门（2026-09-20 修复：移除 requireManager + 补数据范围）', () => {
    // 部门经理：roleCode='manager'、manage_all=0 —— 修复前会被 requireManager 全部 403
    const managerToken = jwt.sign(
      { userId: 7, username: 'mgr', roleId: 2, roleCode: 'manager' },
      process.env.JWT_SECRET, { expiresIn: '1h' }
    );

    it('部门经理不应再被 403，且按 dept_and_sub 过滤（本部门及子部门）', async () => {
      require('../services/permissionService').getDataPermissions.mockResolvedValueOnce([
        { module: 'analysis', data_scope: 'dept_and_sub' }
      ]);

      mockPool.query
        .mockResolvedValueOnce([[]])                               // blacklist
        .mockResolvedValueOnce([[{ view_all: 0, manage_all: 0 }]]) // role（经理：无 manageAll）
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])    // user status
        .mockResolvedValueOnce([[{ dept_id: 10 }]])                // dept_and_sub → 本人部门
        .mockResolvedValueOnce([[]])                               // getSubDeptIds → 无子部门
        .mockResolvedValueOnce([[{ stage: 1, count: 3 }]]);        // 业务主查询

      const res = await request(app)
        .get('/api/v1/analysis/win-rate')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).not.toContain('管理员或经理');

      const calls = mockPool.query.mock.calls;
      const [mainSql, mainParams] = calls[calls.length - 1];
      expect(String(mainSql)).toMatch(/owner_id IN \(SELECT id FROM sys_user WHERE dept_id IN \(/);
      expect(mainParams).toContain(10);   // 部门集参数已注入
    });

    it('self 范围：只查本人数据（owner_id = ?）', async () => {
      require('../services/permissionService').getDataPermissions.mockResolvedValueOnce([
        { module: 'analysis', data_scope: 'self' }
      ]);

      mockPool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ view_all: 0, manage_all: 0 }]])
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])
        .mockResolvedValueOnce([[{ stage: 1, count: 1 }]]);

      const res = await request(app)
        .get('/api/v1/analysis/win-rate')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);

      const calls = mockPool.query.mock.calls;
      const [mainSql, mainParams] = calls[calls.length - 1];
      expect(String(mainSql)).toMatch(/owner_id = \?/);
      expect(mainParams).toContain(7);   // 本人 userId
    });

    it('GET /suggestions/enhanced：5 条业务查询必须全部带归属谓词（无漏网查询）', async () => {
      require('../services/permissionService').getDataPermissions.mockResolvedValueOnce([
        { module: 'analysis', data_scope: 'self' }
      ]);

      mockPool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ view_all: 0, manage_all: 0 }]])
        .mockResolvedValueOnce([[{ must_change_password: 0 }]])
        .mockResolvedValueOnce([[]])                     // 停滞商机
        .mockResolvedValueOnce([[]])                     // 流失客户
        .mockResolvedValueOnce([[{ monthAmount: 0 }]])   // 本月合同额
        .mockResolvedValueOnce([[{ targetAmount: 0 }]])  // 本月目标
        .mockResolvedValueOnce([[]]);                    // 交叉销售

      const res = await request(app)
        .get('/api/v1/analysis/suggestions/enhanced')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);

      const bizCalls = mockPool.query.mock.calls.filter(
        (c) => /FROM\s+crm_(contract|customer|opportunity|sales_target)/i.test(String(c[0]))
      );
      expect(bizCalls).toHaveLength(5);   // 断言「没有一条业务查询被漏掉」
      for (const [sql, params] of bizCalls) {
        expect(String(sql)).toMatch(/(owner_id|create_by|user_id)\s*=\s*\?/);
        expect(params).toContain(7);       // self 范围 → 必须是本人
      }
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

