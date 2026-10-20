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

// 权限码按需注入：管理员用例给 system:cron，无权限用例给空列表
jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn(),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([]),
  clearPermissionCache: jest.fn(),
  clearAllPermissionCache: jest.fn()
}));

const { appErrorHandler, globalErrorHandler } = require('../middleware/errorHandler');

const app = express();
app.use(express.json());

const cronRoutes = require('../routes/cronJobs');
app.use('/api/v1/cron', cronRoutes);
app.use(appErrorHandler);
app.use(globalErrorHandler);

const { getUserPermissions } = require('../services/permissionService');

const ROLE_IDS = { BOSS: 1, MANAGER: 2, SALES: 3, FINANCE: 6 };

const generateToken = (roleId, roleCode, overrides = {}) =>
  jwt.sign(
    { userId: 100 + roleId, username: `user_${roleId}`, roleId, roleCode, ...overrides },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

// 超管走 checkPermission 的 bypass 分支，不查询权限表
const adminToken = `Bearer ${generateToken(ROLE_IDS.BOSS, 'super_admin', { viewAll: true, manageAll: true })}`;
// 销售：非管理员、无 system:cron
const salesToken = `Bearer ${generateToken(ROLE_IDS.SALES, 'sales')}`;

describe('定时任务模块', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
    mockConnection.query.mockReset();
    mockConnection.beginTransaction.mockClear();
    mockConnection.commit.mockClear();
    mockConnection.rollback.mockClear();
    mockConnection.release.mockClear();
    getUserPermissions.mockReset();
    getUserPermissions.mockResolvedValue([]);
  });

  // 模拟 authenticateToken 需要的三次数据库查询：黑名单 + 角色 + 账号状态
  function mockAuth(roleId = ROLE_IDS.BOSS) {
    mockPool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ view_all: roleId === ROLE_IDS.BOSS ? 1 : 0, manage_all: roleId === ROLE_IDS.BOSS ? 1 : 0, role_code: roleId === ROLE_IDS.BOSS ? 'boss' : 'sales' }]])
      .mockResolvedValueOnce([[{ must_change_password: 0 }]]);
  }

  describe('POST /api/v1/cron/daily-scoring', () => {
    it('应该返回200当正常执行每日评分', async () => {
      mockAuth(ROLE_IDS.BOSS);

      const res = await request(app)
        .post('/api/v1/cron/daily-scoring')
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });

    it('应该返回403当无 system:cron 权限', async () => {
      mockAuth(ROLE_IDS.SALES);
      getUserPermissions.mockResolvedValue(['customer:view']); // 有其他码但没有 system:cron

      const res = await request(app)
        .post('/api/v1/cron/daily-scoring')
        .set('Authorization', salesToken);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(403);
      expect(res.body.message).toBe('没有操作权限');
    });
  });

  describe('POST /api/v1/cron/auto-release', () => {
    it('应该返回200当正常执行公海回收', async () => {
      mockAuth(ROLE_IDS.BOSS);
      mockConnection.query.mockResolvedValueOnce([[]]); // customers to release (empty)

      const res = await request(app)
        .post('/api/v1/cron/auto-release')
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });

    it('应该批量更新并一次性插入日志', async () => {
      mockAuth(ROLE_IDS.BOSS);
      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1, owner_id: 10 }, { id: 2, owner_id: 20 }]]) // customers
        .mockResolvedValueOnce([{ affectedRows: 2 }]) // batch UPDATE
        .mockResolvedValueOnce([{ affectedRows: 2 }]); // batch INSERT

      const res = await request(app)
        .post('/api/v1/cron/auto-release')
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/已释放 2 个客户/);
      expect(mockConnection.query).toHaveBeenCalledTimes(3); // 1 SELECT + 1 UPDATE + 1 INSERT

      const updateCall = mockConnection.query.mock.calls[1];
      // 097 迁移后 pool_status 参数化（VARCHAR），不再是字面量 1
      expect(updateCall[0]).toMatch(/UPDATE crm_customer SET pool_status = \?/);
      expect(updateCall[0]).toMatch(/WHERE id IN \(\?\)/);
      expect(updateCall[1]).toEqual(['sea', 'sea', [1, 2]]);

      const insertCall = mockConnection.query.mock.calls[2];
      expect(insertCall[0]).toMatch(/INSERT INTO crm_pool_log/);
      expect(insertCall[0]).toMatch(/VALUES \?/);
      expect(insertCall[1]).toEqual([[[1, 'auto_release', 10, null], [2, 'auto_release', 20, null]]]);
    });

    it('应该返回403当无 system:cron 权限', async () => {
      mockAuth(ROLE_IDS.SALES);

      const res = await request(app)
        .post('/api/v1/cron/auto-release')
        .set('Authorization', salesToken);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/cron/generate-reminders', () => {
    it('应该返回200当正常生成提醒', async () => {
      mockAuth(ROLE_IDS.BOSS);

      const res = await request(app)
        .post('/api/v1/cron/generate-reminders')
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
    });

    it('应该返回403当无 system:cron 权限', async () => {
      mockAuth(ROLE_IDS.SALES);

      const res = await request(app)
        .post('/api/v1/cron/generate-reminders')
        .set('Authorization', salesToken);

      expect(res.status).toBe(403);
    });
  });

  describe('[C1 2026-10-20] GET 触发写操作已废弃', () => {
    const paths = ['daily-scoring', 'clean-logs', 'auto-release', 'generate-reminders'];

    it.each(paths)('GET /%s 应返回 405 并提示改用 POST', async (p) => {
      mockAuth(ROLE_IDS.BOSS);

      const res = await request(app)
        .get(`/api/v1/cron/${p}`)
        .set('Authorization', adminToken);

      expect(res.status).toBe(405);
      expect(res.body.code).toBe(405);
      expect(res.body.message).toContain('POST');
      // 关键：不得真的执行任务
      expect(mockConnection.query).not.toHaveBeenCalled();
    });

    it('GET 且无 token 时应返回 401（认证先于方法检查）', async () => {
      const res = await request(app).get('/api/v1/cron/daily-scoring');
      expect(res.status).toBe(401);
    });
  });

  describe('无token访问', () => {
    it('应该返回401当无token', async () => {
      const res = await request(app)
        .post('/api/v1/cron/daily-scoring');

      expect(res.status).toBe(401);
    });
  });
});
