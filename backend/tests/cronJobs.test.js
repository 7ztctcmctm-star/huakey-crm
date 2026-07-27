const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

const mockConnection = {
  query: jest.fn(),
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  release: jest.fn()
};

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue(mockConnection)
};

jest.mock('../config/database', () => mockPool);

jest.mock('../utils/scoring', () => ({
  checkAllSuppliersScores: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../utils/qualification-reminder', () => ({
  checkQualificationExpiry: jest.fn().mockResolvedValue(undefined),
  updateQualificationStatus: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../scripts/generate_reminders', () => ({
  generateReminders: jest.fn().mockResolvedValue(undefined)
}));

const { appErrorHandler, globalErrorHandler } = require('../middleware/errorHandler');

const app = express();
app.use(express.json());

const cronRoutes = require('../routes/cronJobs');
app.use('/api/v1/cron', cronRoutes);
app.use(appErrorHandler);
app.use(globalErrorHandler);

const adminToken = `Bearer ${jwt.sign(
  { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', viewAll: true, manageAll: true },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
)}`;

describe('定时任务模块', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
    mockConnection.query.mockReset();
    mockConnection.beginTransaction.mockClear();
    mockConnection.commit.mockClear();
    mockConnection.rollback.mockClear();
    mockConnection.release.mockClear();
  });

  // 模拟 authenticateToken 需要的两次数据库查询：黑名单 + 角色权限
  function mockAdminAuth() {
    mockPool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1, role_code: 'super_admin' }]]);
  }

  describe('GET /api/v1/cron/daily-scoring', () => {
    it('应该返回200当正常执行每日评分', async () => {
      mockAdminAuth();

      const res = await request(app)
        .get('/api/v1/cron/daily-scoring')
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('GET /api/v1/cron/auto-release', () => {
    it('应该返回200当正常执行公海回收', async () => {
      mockAdminAuth();
      mockConnection.query.mockResolvedValueOnce([[]]); // customers to release (empty)

      const res = await request(app)
        .get('/api/v1/cron/auto-release')
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });

    it('应该批量更新并一次性插入日志', async () => {
      mockAdminAuth();
      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1, owner_id: 10 }, { id: 2, owner_id: 20 }]]) // customers
        .mockResolvedValueOnce([{ affectedRows: 2 }]) // batch UPDATE
        .mockResolvedValueOnce([{ affectedRows: 2 }]); // batch INSERT

      const res = await request(app)
        .get('/api/v1/cron/auto-release')
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/已释放 2 个客户/);
      expect(mockConnection.query).toHaveBeenCalledTimes(3); // 1 SELECT + 1 UPDATE + 1 INSERT

      const updateCall = mockConnection.query.mock.calls[1];
      expect(updateCall[0]).toMatch(/UPDATE crm_customer SET pool_status = 1/);
      expect(updateCall[0]).toMatch(/WHERE id IN \(\?\)/);
      expect(updateCall[1]).toEqual(['sea', [1, 2]]);

      const insertCall = mockConnection.query.mock.calls[2];
      expect(insertCall[0]).toMatch(/INSERT INTO crm_pool_log/);
      expect(insertCall[0]).toMatch(/VALUES \?/);
      expect(insertCall[1]).toEqual([[[1, 'auto_release', 10, null], [2, 'auto_release', 20, null]]]);
    });
  });

  describe('GET /api/v1/cron/generate-reminders', () => {
    it('应该返回200当正常生成提醒', async () => {
      mockAdminAuth();

      const res = await request(app)
        .get('/api/v1/cron/generate-reminders')
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .get('/api/v1/cron/daily-scoring');

      expect(res.status).toBe(401);
    });
  });
});
