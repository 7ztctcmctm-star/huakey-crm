/**
 * CRM Core v1 — RBAC 业务流权限 E2E 测试
 *
 * 验证跨模块角色权限隔离:
 *   Case 1: sales 创建商机 (正常授权)
 *   Case 2: sales 不能修改其他销售商机 (数据权限隔离)
 *   Case 3: sales 不能审批合同 (功能权限隔离)
 *   Case 4: manager 可以审批合同 (管理权限)
 *
 * 约束: 不修改冻结模块, mock pool 模式
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_rbac_audit';
process.env.NODE_ENV = 'test';

// ============================================================================
// Mocks
// ============================================================================
const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({
    query: jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn()
  })
};

jest.mock('../../config/database', () => mockPool);
jest.mock('../../config/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));
jest.mock('../../config/roles', () => ({
  ADMIN: 1, MANAGER: 2, ADMIN_ROLE_CODES: new Set(['super_admin'])
}));
jest.mock('../../utils/pagination', () => ({ paginatedQuery: jest.fn().mockResolvedValue({ list: [], total: 0 }) }));
jest.mock('../../utils/fieldLog', () => ({ logFieldChanges: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  logFieldChanges: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1',
  createRouteLogger: () => jest.fn().mockResolvedValue(undefined)
}));

// Mock permissionService — 控制权限返回
const mockGetUserPermissions = jest.fn();
const mockGetDataPermissions = jest.fn();
jest.mock('../../services/permissionService', () => ({
  getUserPermissions: (...args) => mockGetUserPermissions(...args),
  getDataPermissions: (...args) => mockGetDataPermissions(...args)
}));

// ============================================================================
// App Construction
// ============================================================================
const app = express();
app.use(express.json());

const opportunityRoutes = require('../../routes/opportunity');
const contractRoutes = require('../../routes/contract');

app.use('/api/v1/opportunity', opportunityRoutes);
app.use('/api/v1/contract', contractRoutes);

app.use((err, req, res, _next) => {
  const httpStatus = err.httpStatus || err.statusCode || 500;
  res.status(httpStatus).json({ code: err.code || 500, message: err.message || '服务器内部错误', data: null });
});

// ============================================================================
// Token Helpers — 使用 DB fresh values 控制权限
// ============================================================================
const makeToken = (overrides) => jwt.sign({
  userId: overrides.userId || 10,
  username: overrides.username || 'user',
  roleId: overrides.roleId || 5,
  roleCode: overrides.roleCode || 'sales',
  viewAll: overrides.viewAll || false,
  manageAll: overrides.manageAll || false
}, process.env.JWT_SECRET, { expiresIn: '1h' });

// Mock role/user queries in auth middleware (3 parallel queries)
const mockAuth = (viewAll = 0, manageAll = 0, roleCode = 'sales') => {
  mockPool.query
    .mockResolvedValueOnce([[]])                                            // 1: blacklist
    .mockResolvedValueOnce([[{ view_all: viewAll, manage_all: manageAll, role_code: roleCode }]]) // 2: role
    .mockResolvedValueOnce([[{ must_change_password: 0 }]]);               // 3: user
};

// ============================================================================
// Tests
// ============================================================================
describe('CRM Core v1 — RBAC 权限隔离测试', () => {

  beforeEach(() => {
    mockPool.query.mockReset();
    mockGetUserPermissions.mockReset();
    mockGetDataPermissions.mockReset();
  });

  // ==========================================================================
  // Case 1: sales 创建商机
  // ==========================================================================
  describe('Case 1: sales 创建商机 (正常授权)', () => {
    it('有 opportunity:add 权限的 sales 可以创建商机', async () => {
      const token = makeToken({ userId: 10, roleId: 5, roleCode: 'sales' });

      mockAuth(0, 0, 'sales');
      // checkPermission → getUserPermissions → returns ['opportunity:add']
      mockGetUserPermissions.mockResolvedValue(['opportunity:add', 'opportunity:view', 'customer:view']);
      // controller: SELECT customer + generateOpportunityNo + INSERT
      mockPool.query
        .mockResolvedValueOnce([[{ id: 100, status: 'following' }]])       // 4: SELECT customer
        .mockResolvedValueOnce([[{ cnt: 0 }]])                              // 5: COUNT
        .mockResolvedValueOnce([{ insertId: 200 }]);                        // 6: INSERT

      const res = await request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 100, name: 'sales创建的商机', expected_amount: 100000 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data.id).toBe(200);
    });

    it('无 opportunity:add 权限的 sales 被拒绝 403', async () => {
      const token = makeToken({ userId: 10, roleId: 5, roleCode: 'sales' });

      mockAuth(0, 0, 'sales');
      // getUserPermissions returns without 'opportunity:add'
      mockGetUserPermissions.mockResolvedValue(['opportunity:view', 'customer:view']);

      const res = await request(app)
        .post('/api/v1/opportunity/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ customer_id: 100, name: '尝试创建' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('权限');
    });
  });

  // ==========================================================================
  // Case 2: sales 不能修改其他销售的商机
  // ==========================================================================
  describe('Case 2: sales 不能修改其他销售商机 (数据权限隔离)', () => {
    it('sales 查看他人商机返回 404 (dataScope=self)', async () => {
      const token = makeToken({ userId: 10, roleId: 5, roleCode: 'sales' });

      mockAuth(0, 0, 'sales');
      // getDataPermissions → returns no config → defaults to self
      mockGetDataPermissions.mockResolvedValue([]);
      // getOpportunityWithPermission with self scope → empty (owner_id ≠ 10)
      mockPool.query.mockResolvedValueOnce([[]]);

      const res = await request(app)
        .get('/api/v1/opportunity/detail/999')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('sales 推进他人商机返回 403', async () => {
      const token = makeToken({ userId: 10, roleId: 5, roleCode: 'sales' });

      mockAuth(0, 0, 'sales');
      mockGetUserPermissions.mockResolvedValue(['opportunity:edit', 'opportunity:view']);
      mockGetDataPermissions.mockResolvedValue([]);
      // getOpportunityWithPermission → empty
      mockPool.query.mockResolvedValueOnce([[]]);

      const res = await request(app)
        .post('/api/v1/opportunity/update-stage')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 999, stage: 3 });

      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // Case 3: sales 不能审批合同
  // ==========================================================================
  describe('Case 3: sales 不能审批合同 (功能权限隔离)', () => {
    it('sales 访问合同审批接口被 requireAdmin 拦截', async () => {
      const token = makeToken({ userId: 10, roleId: 5, roleCode: 'sales' });

      mockAuth(0, 0, 'sales');

      const res = await request(app)
        .post('/api/v1/contract/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 500, approval_status: 2 });

      // requireAdmin 检查 manageAll || ADMIN_ROLE_CODES
      // sales: manageAll=false, roleCode='sales' not in ADMIN_ROLE_CODES → 403
      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // Case 4: manager 可以审批合同
  // ==========================================================================
  describe('Case 4: manager 可以审批合同 (管理权限)', () => {
    it('manager (manageAll=true) 可以审批合同', async () => {
      const token = makeToken({ userId: 2, roleId: 2, roleCode: 'manager', manageAll: true });

      mockAuth(0, 1, 'manager');
      // approveContract: SELECT contract, then UPDATE
      mockPool.query
        .mockResolvedValueOnce([[{ id: 500, approval_status: 1 }]])       // 4: SELECT
        .mockResolvedValueOnce([{ affectedRows: 1 }])                      // 5: UPDATE approval_status
        .mockResolvedValueOnce([{ affectedRows: 1 }]);                     // 6: dismiss notification

      const res = await request(app)
        .post('/api/v1/contract/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 500, approval_status: 2 });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('审批通过');
    });
  });
});
