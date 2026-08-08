/**
 * Boss 审批权限验证 E2E 测试
 *
 * 验证权限判断统一为 manageAll/roleCode 后，三角色审批边界正确：
 *   - boss (manageAll=true) 可以审批合同 ✅
 *   - boss (manageAll=true) 可以审批报价 ✅
 *   - manager (manageAll=true) 可以审批合同 ✅（符合设计）
 *   - sales (manageAll=false) 不能审批合同 ❌
 *   - sales (manageAll=false) 不能审批报价 ❌
 *
 * 约束: 不修改冻结模块, mock pool 模式
 * 基线: 权限审计修复后 — 前端/后端均使用 manageAll，不再依赖固定数字 roleId
 * 角色 manage_all 配置: migration 004(admin) + 040(boss) 设置 manage_all=1
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_boss_approval_audit';
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
  ADMIN: 1, MANAGER: 2, SALES: 3,
  ROLE_CODES: { SUPER_ADMIN: 'super_admin', ADMIN: 'admin', BOSS: 'boss', SALES: 'sales' },
  ADMIN_ROLE_CODES: new Set(['super_admin'])
}));
jest.mock('../../utils/pagination', () => ({ paginatedQuery: jest.fn().mockResolvedValue({ list: [], total: 0 }) }));
jest.mock('../../utils/fieldLog', () => ({ logFieldChanges: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  logFieldChanges: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1',
  createRouteLogger: () => jest.fn().mockResolvedValue(undefined)
}));

// Mock permissionService
const mockGetUserPermissions = jest.fn();
const mockGetDataPermissions = jest.fn();
jest.mock('../../services/permissionService', () => ({
  getUserPermissions: (...args) => mockGetUserPermissions(...args),
  getDataPermissions: (...args) => mockGetDataPermissions(...args)
}));

// ============================================================================
// App
// ============================================================================
const app = express();
app.use(express.json());

const contractRoutes = require('../../routes/contract');
const quoteRoutes = require('../../routes/quote');

app.use('/api/v1/contract', contractRoutes);
app.use('/api/v1/quote', quoteRoutes);

app.use((err, req, res, _next) => {
  const httpStatus = err.httpStatus || err.statusCode || 500;
  res.status(httpStatus).json({ code: err.code || 500, message: err.message || '服务器内部错误', data: null });
});

// ============================================================================
// Token Helpers
// ============================================================================
const makeToken = (overrides) => jwt.sign({
  userId: overrides.userId || 10,
  username: overrides.username || 'user',
  roleId: overrides.roleId || 5,
  roleCode: overrides.roleCode || 'sales',
  viewAll: overrides.viewAll || false,
  manageAll: overrides.manageAll || false
}, process.env.JWT_SECRET, { expiresIn: '1h' });

// Mock authenticateToken 的 3 次 DB 查询
const mockAuth = (viewAll = 0, manageAll = 0, roleCode = 'sales') => {
  mockPool.query
    .mockResolvedValueOnce([[]])                                            // 1: blacklist
    .mockResolvedValueOnce([[{ view_all: viewAll, manage_all: manageAll, role_code: roleCode }]]) // 2: role
    .mockResolvedValueOnce([[{ must_change_password: 0 }]]);               // 3: user
};

// ============================================================================
// Tests
// ============================================================================
describe('Boss / Manager / Sales 审批权限验证', () => {

  beforeEach(() => {
    mockPool.query.mockReset();
    mockGetUserPermissions.mockReset();
    mockGetDataPermissions.mockReset();
  });

  // ==========================================================================
  // boss 审批合同
  // ==========================================================================
  describe('boss 可以审批合同', () => {
    it('boss (manageAll=true) 审批合同返回 200', async () => {
      const token = makeToken({ userId: 3, roleId: 9, roleCode: 'boss', manageAll: true });

      mockAuth(1, 1, 'boss');
      // approveContract: SELECT contract + UPDATE + dismiss notification
      mockPool.query
        .mockResolvedValueOnce([[{ id: 500, approval_status: 1 }]])       // SELECT
        .mockResolvedValueOnce([{ affectedRows: 1 }])                      // UPDATE approval_status
        .mockResolvedValueOnce([{ affectedRows: 1 }]);                     // dismiss notification

      const res = await request(app)
        .post('/api/v1/contract/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 500, approval_status: 2 });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('审批通过');
    });
  });

  // ==========================================================================
  // boss 审批报价
  // ==========================================================================
  describe('boss 可以审批报价', () => {
    it('boss (manageAll=true) 审批报价返回 200', async () => {
      const token = makeToken({ userId: 3, roleId: 9, roleCode: 'boss', manageAll: true });

      mockAuth(1, 1, 'boss');
      // quoteController.approve → quoteService.approveQuote: SELECT + UPDATE
      mockPool.query
        .mockResolvedValueOnce([[{ id: 300, approval_status: 1, status: 1 }]])  // SELECT quote
        .mockResolvedValueOnce([{ affectedRows: 1 }]);                           // UPDATE

      const res = await request(app)
        .post('/api/v1/quote/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 300, approval_status: 2 });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('审批通过');
    });
  });

  // ==========================================================================
  // manager 审批合同（符合设计）
  // ==========================================================================
  describe('manager 可以审批合同', () => {
    it('manager (manageAll=true) 审批合同返回 200', async () => {
      const token = makeToken({ userId: 2, roleId: 2, roleCode: 'admin', manageAll: true });

      mockAuth(0, 1, 'admin');
      mockPool.query
        .mockResolvedValueOnce([[{ id: 500, approval_status: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post('/api/v1/contract/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 500, approval_status: 2 });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('审批通过');
    });
  });

  // ==========================================================================
  // sales 不能审批合同
  // ==========================================================================
  describe('sales 不能审批合同', () => {
    it('sales (manageAll=false) 审批合同被拦截 403', async () => {
      const token = makeToken({ userId: 10, roleId: 5, roleCode: 'sales', manageAll: false });

      mockAuth(0, 0, 'sales');

      const res = await request(app)
        .post('/api/v1/contract/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 500, approval_status: 2 });

      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // sales 不能审批报价
  // ==========================================================================
  describe('sales 不能审批报价', () => {
    it('sales (manageAll=false) 审批报价被拦截 403', async () => {
      const token = makeToken({ userId: 10, roleId: 5, roleCode: 'sales', manageAll: false });

      mockAuth(0, 0, 'sales');

      const res = await request(app)
        .post('/api/v1/quote/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 300, approval_status: 2 });

      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // 回归：roleId 不再决定审批权（即使 roleId 不是 1/2，manageAll=true 仍可审批）
  // ==========================================================================
  describe('回归: roleId 硬编码已消除', () => {
    it('boss roleId=99 (非1非2) 但 manageAll=true 仍可审批合同', async () => {
      // 模拟 boss 角色在 sys_role 表中 id=99（非固定数字），但 manage_all=1
      const token = makeToken({ userId: 3, roleId: 99, roleCode: 'boss', manageAll: true });

      mockAuth(1, 1, 'boss');
      mockPool.query
        .mockResolvedValueOnce([[{ id: 500, approval_status: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post('/api/v1/contract/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 500, approval_status: 2 });

      // 关键：roleId=99 不再被硬编码拦截，manageAll=true 即可审批
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('审批通过');
    });
  });
});
