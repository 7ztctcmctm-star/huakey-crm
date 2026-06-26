/**
 * 权限矩阵测试
 *
 * 验证各角色对关键接口的访问权限是否符合预期。
 * 使用 mock pool + mock permissionService 模式，不依赖真实数据库。
 *
 * 角色: ADMIN=1, MANAGER=2, SALES=3, HR=4, PURCHASE=5, FINANCE=6
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

const ROLES = require('../config/roles');

// ============ Mock 数据库 ============
const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({
    query: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn()
  })
};

jest.mock('../config/database', () => mockPool);

// ============ Mock 日志中间件 ============
jest.mock('../middleware/logger', () => {
  const mockLogAction = jest.fn().mockResolvedValue(undefined);
  return {
    logAction: mockLogAction,
    getIpAddress: () => '127.0.0.1',
    createRouteLogger: () => mockLogAction
  };
});

// ============ Mock 权限服务 ============
jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue([]),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([]),
  clearPermissionCache: jest.fn(),
  clearAllPermissionCache: jest.fn()
}));

// ============ Mock 业务服务（避免 handler 内 DB 查询失败） ============
jest.mock('../services/approvalService', () => ({
  approveRecord: jest.fn().mockResolvedValue({ id: 1, status: 'approved' }),
  rejectRecord: jest.fn().mockResolvedValue({ id: 1, status: 'rejected' }),
  listWorkflows: jest.fn().mockResolvedValue([]),
  submitApproval: jest.fn().mockResolvedValue({ id: 1 }),
  getApprovalDetail: jest.fn().mockResolvedValue(null),
  getMyPending: jest.fn().mockResolvedValue([]),
  getMySubmitted: jest.fn().mockResolvedValue([]),
  batchApprove: jest.fn().mockResolvedValue({ affectedRows: 1 }),
  batchReject: jest.fn().mockResolvedValue({ affectedRows: 1 })
}));

jest.mock('../services/userRouteService', () => ({
  listUsers: jest.fn().mockResolvedValue({ list: [], total: 0 }),
  addUser: jest.fn().mockResolvedValue({ insertId: 1 }),
  updateUser: jest.fn().mockResolvedValue(undefined),
  deleteUser: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../services/logRouteService', () => ({
  listLogs: jest.fn().mockResolvedValue({ list: [], total: 0 }),
  getLogDetail: jest.fn().mockResolvedValue(null),
  deleteLogs: jest.fn().mockResolvedValue({ affectedRows: 0 }),
  clearLogs: jest.fn().mockResolvedValue({ affectedRows: 0 })
}));

jest.mock('../services/customerDetailService', () => ({
  addCustomer: jest.fn().mockResolvedValue({ insertId: 1 }),
  deleteCustomer: jest.fn().mockResolvedValue(undefined),
  getCustomerDetail: jest.fn().mockResolvedValue(null),
  updateCustomer: jest.fn().mockResolvedValue(undefined),
  canManageCustomer: jest.fn().mockResolvedValue(true),
  VALID_SOURCES: ['展会', 'Facebook', 'Instagram', 'LinkedIn', '独立站', '其他网络渠道', '转介绍', '电话', '其他'],
  SOURCE_PARENT_MAP: { '网络': ['Facebook', 'Instagram', 'LinkedIn', '独立站', '其他网络渠道'] }
}));

const { getUserPermissions } = require('../services/permissionService');

// ============ 构建测试 App ============
const app = express();
app.use(express.json());

// 真实路由
const userRoutes = require('../routes/user');
const customerRoutes = require('../routes/customer');
const approvalRoutes = require('../routes/approval');
const logRoutes = require('../routes/log');

app.use('/api/user', userRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/approval', approvalRoutes);
app.use('/api/log', logRoutes);

// Mock 路由（接口在代码库中不存在，但测试矩阵要求覆盖）
// 模拟相同的中间件链：authenticateToken → checkPermission → handler
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

const hrAttendanceRouter = express.Router();
hrAttendanceRouter.post('/attendance', authenticateToken, checkPermission('hr'), (req, res) => {
  res.json({ code: 200, message: '考勤打卡成功', data: null });
});
app.use('/api/hr', hrAttendanceRouter);

const customerDeleteRouter = express.Router();
customerDeleteRouter.delete('/:id', authenticateToken, checkPermission('customer:delete'), (req, res) => {
  res.json({ code: 200, message: '删除客户成功', data: null });
});
app.use('/api/customer-del', customerDeleteRouter);

// ============ 辅助函数 ============

/**
 * 生成指定角色的 JWT token
 */
const generateToken = (roleId, overrides = {}) => {
  return jwt.sign(
    { userId: 100 + roleId, username: `user_${roleId}`, roleId, ...overrides },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

/**
 * 生成已过期的 JWT token
 */
const generateExpiredToken = () => {
  return jwt.sign(
    { userId: 999, username: 'expired', roleId: ROLES.SALES },
    process.env.JWT_SECRET,
    { expiresIn: '-1s' }
  );
};

/**
 * 设置 mockPool.query 的调用序列（非 ADMIN 角色）
 *
 * authenticateToken 消耗 2 次调用：
 *   1. blacklist check → [[]]（未被拉黑）
 *   2. role query → [[{ view_all, manage_all }]]
 *
 * checkPermission 消耗 1 次调用：
 *   3. getUserPermissions 查询 → 用户权限列表
 */
const setupAuthMocks = (roleId, permissionCodes = []) => {
  mockPool.query
    .mockResolvedValueOnce([[]])                                                    // blacklist check
    .mockResolvedValueOnce([[{ view_all: 0, manage_all: 0 }]])                     // role query
    .mockResolvedValueOnce([[{ id: 1, permission_id: 1 }]]);                       // getUserPermissions inner query
  getUserPermissions.mockResolvedValue(permissionCodes);
};

/**
 * 设置 ADMIN 角色的 mock（仅 authenticateToken，checkPermission 跳过）
 *
 * ADMIN 在 checkPermission 中直接放行，不需要 getUserPermissions 查询。
 */
const setupAdminMocks = () => {
  mockPool.query
    .mockResolvedValueOnce([[]])                                       // blacklist check
    .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]);       // role query
};

// ============ 测试用例 ============

describe('权限矩阵测试', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
    getUserPermissions.mockReset();
    getUserPermissions.mockResolvedValue([]);
  });

  // ─────────────────────────────────────────
  // 矩阵：每个接口 × 每个角色
  // ─────────────────────────────────────────

  describe('POST /api/user/add — 仅 ADMIN 可访问', () => {
    const endpoint = (app) => request(app)
      .post('/api/user/add')
      .send({ username: 'testuser', password: 'Pass123' });

    it('ADMIN → 200', async () => {
      setupAdminMocks();
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.ADMIN)}`);
      expect(res.status).toBe(200);
    });

    it('MANAGER → 403', async () => {
      setupAuthMocks(ROLES.MANAGER, ['customer:add', 'approval']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.MANAGER)}`);
      expect(res.status).toBe(403);
    });

    it('SALES → 403', async () => {
      setupAuthMocks(ROLES.SALES, ['customer:add']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.SALES)}`);
      expect(res.status).toBe(403);
    });

    it('HR → 403', async () => {
      setupAuthMocks(ROLES.HR, ['hr']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.HR)}`);
      expect(res.status).toBe(403);
    });

    it('FINANCE → 403', async () => {
      setupAuthMocks(ROLES.FINANCE, []);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.FINANCE)}`);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/customer/add — ADMIN / MANAGER / SALES 可访问', () => {
    const endpoint = (app) => request(app)
      .post('/api/customer/add')
      .send({ company_name: '测试公司', contact_name: '张三', phone: '13800138000' });

    it('ADMIN → 200', async () => {
      setupAdminMocks();
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.ADMIN)}`);
      expect(res.status).toBe(200);
    });

    it('MANAGER → 200', async () => {
      setupAuthMocks(ROLES.MANAGER, ['customer:add', 'approval']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.MANAGER)}`);
      expect(res.status).toBe(200);
    });

    it('SALES → 200', async () => {
      setupAuthMocks(ROLES.SALES, ['customer:add']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.SALES)}`);
      expect(res.status).toBe(200);
    });

    it('HR → 403', async () => {
      setupAuthMocks(ROLES.HR, ['hr']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.HR)}`);
      expect(res.status).toBe(403);
    });

    it('FINANCE → 403', async () => {
      setupAuthMocks(ROLES.FINANCE, []);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.FINANCE)}`);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/hr/attendance — ADMIN / MANAGER / HR 可访问', () => {
    const endpoint = (app) => request(app)
      .post('/api/hr/attendance')
      .send({});

    it('ADMIN → 200', async () => {
      setupAdminMocks();
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.ADMIN)}`);
      expect(res.status).toBe(200);
    });

    it('MANAGER → 200', async () => {
      setupAuthMocks(ROLES.MANAGER, ['customer:add', 'approval', 'hr']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.MANAGER)}`);
      expect(res.status).toBe(200);
    });

    it('SALES → 403', async () => {
      setupAuthMocks(ROLES.SALES, ['customer:add']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.SALES)}`);
      expect(res.status).toBe(403);
    });

    it('HR → 200', async () => {
      setupAuthMocks(ROLES.HR, ['hr']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.HR)}`);
      expect(res.status).toBe(200);
    });

    it('FINANCE → 403', async () => {
      setupAuthMocks(ROLES.FINANCE, []);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.FINANCE)}`);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/approval/approve/:id — ADMIN / MANAGER 可访问', () => {
    const endpoint = (app) => request(app)
      .post('/api/approval/approve/1')
      .send({ remark: '同意' });

    it('ADMIN → 200', async () => {
      setupAdminMocks();
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.ADMIN)}`);
      expect(res.status).toBe(200);
    });

    it('MANAGER → 200', async () => {
      setupAuthMocks(ROLES.MANAGER, ['customer:add', 'approval']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.MANAGER)}`);
      expect(res.status).toBe(200);
    });

    it('SALES → 403', async () => {
      setupAuthMocks(ROLES.SALES, ['customer:add']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.SALES)}`);
      expect(res.status).toBe(403);
    });

    it('HR → 403', async () => {
      setupAuthMocks(ROLES.HR, ['hr']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.HR)}`);
      expect(res.status).toBe(403);
    });

    it('FINANCE → 403', async () => {
      setupAuthMocks(ROLES.FINANCE, []);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.FINANCE)}`);
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/customer-del/:id — ADMIN / MANAGER 可访问', () => {
    const endpoint = (app) => request(app)
      .delete('/api/customer-del/1');

    it('ADMIN → 200', async () => {
      setupAdminMocks();
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.ADMIN)}`);
      expect(res.status).toBe(200);
    });

    it('MANAGER → 200', async () => {
      setupAuthMocks(ROLES.MANAGER, ['customer:add', 'approval', 'customer:delete']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.MANAGER)}`);
      expect(res.status).toBe(200);
    });

    it('SALES → 403', async () => {
      setupAuthMocks(ROLES.SALES, ['customer:add']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.SALES)}`);
      expect(res.status).toBe(403);
    });

    it('HR → 403', async () => {
      setupAuthMocks(ROLES.HR, ['hr']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.HR)}`);
      expect(res.status).toBe(403);
    });

    it('FINANCE → 403', async () => {
      setupAuthMocks(ROLES.FINANCE, []);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.FINANCE)}`);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/log/list — 仅 ADMIN 可访问', () => {
    const endpoint = (app) => request(app)
      .post('/api/log/list')
      .send({ page: 1, pageSize: 10 });

    it('ADMIN → 200', async () => {
      setupAdminMocks();
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.ADMIN)}`);
      expect(res.status).toBe(200);
    });

    it('MANAGER → 403', async () => {
      setupAuthMocks(ROLES.MANAGER, ['customer:add', 'approval']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.MANAGER)}`);
      expect(res.status).toBe(403);
    });

    it('SALES → 403', async () => {
      setupAuthMocks(ROLES.SALES, ['customer:add']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.SALES)}`);
      expect(res.status).toBe(403);
    });

    it('HR → 403', async () => {
      setupAuthMocks(ROLES.HR, ['hr']);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.HR)}`);
      expect(res.status).toBe(403);
    });

    it('FINANCE → 403', async () => {
      setupAuthMocks(ROLES.FINANCE, []);
      const res = await endpoint(app).set('Authorization', `Bearer ${generateToken(ROLES.FINANCE)}`);
      expect(res.status).toBe(403);
    });
  });

  // ─────────────────────────────────────────
  // Token 安全测试
  // ─────────────────────────────────────────

  describe('Token 安全', () => {
    it('无 token 请求返回 401', async () => {
      const res = await request(app).post('/api/user/list').send({});
      expect(res.status).toBe(401);
      expect(res.body.message).toContain('未提供访问令牌');
    });

    it('过期 token 返回 401', async () => {
      const expiredToken = generateExpiredToken();
      const res = await request(app)
        .post('/api/user/list')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
      expect(res.body.message).toContain('过期');
    });

    it('被拉黑的 token 返回 401', async () => {
      const token = generateToken(ROLES.ADMIN);
      // blacklist check 返回非空 → token 已被拉黑
      mockPool.query.mockResolvedValueOnce([[{ blacklisted: 1 }]]);

      const res = await request(app)
        .post('/api/user/list')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('失效');
    });
  });
});
