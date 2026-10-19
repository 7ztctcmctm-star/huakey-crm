/**
 * Boss / Manager / Sales 审批权限验证 E2E 测试
 *
 * 验证权限判断统一为 manageAll/roleCode 后，三角色审批边界正确：
 *   - boss (manageAll=true) 可以审批合同 ✅
 *   - boss (manageAll=true) 可以审批报价 ✅
 *   - manager (manageAll=true) 可以审批合同 ✅（符合设计）
 *   - manager (manageAll=false, 持有 quotation:approve) 可以审批报价 ✅（routes/quote.js 门：checkPermission + requireManager）
 *   - sales (manageAll=false) 不能审批合同 ❌
 *   - sales (manageAll=false) 不能审批报价 ❌（无 quotation:approve → 403）
 *   - 被拒/驳回路径不得推进商机 stage（advanceStage 不被调用）
 *   - 审批通过 → 商机推进到 stage 3；但商机已在更后阶段时**不倒退**（A1.5 修循环依赖后回归锁定）
 *
 * 约束: 不修改冻结模块, mock pool 模式
 * 基线: 权限审计修复后 — 前端/后端均使用 manageAll，不再依赖固定数字 roleId
 * 角色 manage_all 配置: migration 004(admin) + 040(boss) 设置 manage_all=1；manager manage_all=0
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_boss_approval_audit';
process.env.NODE_ENV = 'test';

// ============================================================================
// Mocks
// ============================================================================
// 【B2 · 2026-10-19】approveQuote 已改为「整段单事务 + 非关键子步骤走 SAVEPOINT」，
// 业务 SQL 全部走事务连接。连接上的 query 与 mockPool.query 共享同一套分派实现，
// 这样既保留「按 SQL 分派、不依赖调用次序」的原设计，又能让两边的 mock 同步替换。
const mockConnQuery = jest.fn();
const mockConn = {
  query: mockConnQuery,
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  release: jest.fn()
};

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue(mockConn)
};

/**
 * 让 pool.query 与 conn.query 采用同一套分派实现。
 *
 * ⚠️ 这里刻意**不**做 mockReset：调用方可能先用 mockPool.query.mockResolvedValueOnce(...)
 * 预置了 auth 中间件的三次查询，一次 reset 会把它们抹掉导致 403/500。
 * （jest 的 once 值优先级高于 mockImplementation，两者可共存）
 */
const dispatchQueries = (impl) => {
  mockPool.query.mockImplementation((...a) => impl(...a));
  mockConnQuery.mockImplementation((...a) => impl(...a));
};

jest.mock('../../config/database', () => mockPool);
jest.mock('../../config/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));
jest.mock('../../config/roles', () => ({
  ADMIN: 1, MANAGER: 2, SALES: 3,
  ROLE_CODES: { SUPER_ADMIN: 'super_admin', ADMIN: 'admin', BOSS: 'boss', MANAGER: 'manager', SALES: 'sales' },
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

// advanceStage 监视：确认「被拒 / 驳回」路径不推进商机 stage（quoteService.approveQuote 内部调用）
const opportunityService = require('../../services/opportunityService');
const advanceStageSpy = jest.spyOn(opportunityService, 'advanceStage').mockResolvedValue(undefined);

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
    mockConnQuery.mockReset();
    mockConn.beginTransaction.mockClear();
    mockConn.commit.mockClear();
    mockConn.rollback.mockClear();
    mockConn.release.mockClear();
    mockGetUserPermissions.mockReset();
    mockGetDataPermissions.mockReset();
    advanceStageSpy.mockClear();
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
      // quoteController.approve → quoteService.approveQuote: SELECT + UPDATE + dismiss
      // ⚠️ dismiss 这一步由 notificationService.dismissByBusiness 发起（原为内联 SQL），
      //    顺序 mock 必须与之对齐，否则第 3 次调用拿到 undefined 会抛 TypeError → 500
      // 【B2】以上 SQL 现在全在同一个事务连接上执行，故 must 同时装配 conn.query。
      const stages = [
        [[{ id: 300, opportunity_id: null, approval_status: 1, status: 1 }]], // SELECT quote (FOR UPDATE)
        [{ affectedRows: 1 }],                                                // UPDATE approval_status
        [{ affectedRows: 1 }]                                                 // dismiss notification
      ];
      let i = 0;
      dispatchQueries(async () => stages[i++] || [{ affectedRows: 1 }]);

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
      // 路由链: checkPermission('contract') → requireManager（routes/contract/approval.js:19）
      // sales 无 contract 功能权限 → 403；必须显式给权限数组，避免 undefined.includes → 500
      mockGetUserPermissions.mockResolvedValue([]);

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
      // 路由链: checkPermission('quotation:approve') → requireManager（routes/quote.js）
      // sales 无 quotation:approve 功能权限 → 403；必须显式给权限数组，避免 undefined.includes → 500
      mockGetUserPermissions.mockResolvedValue([]);

      const res = await request(app)
        .post('/api/v1/quote/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 300, approval_status: 2 });

      expect(res.status).toBe(403);
      // 被拒请求不得进入 service，商机 stage 不得被推进
      expect(advanceStageSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // manager 可以审批报价（路线门: checkPermission('quotation:approve') + requireManager）
  // ==========================================================================
  describe('manager 可以审批报价', () => {
    // 按 SQL 分派，避免 mockResolvedValueOnce 顺序漂移（approveQuote 内部调用链较长）
    // opportunityStage: 商机当前阶段，用于验证「只前进不倒退」
    const installManagerPool = (quoteRow, opportunityStage = 2) => {
      dispatchQueries(async (sql) => {
        const s = String(sql);
        if (s.includes('sys_token_blacklist')) return [[]];
        if (s.includes('FROM sys_role')) return [[{ view_all: 0, manage_all: 0, role_code: 'manager' }]];
        if (s.includes('FROM sys_user')) return [[{ must_change_password: 0 }]];
        // approveQuote 的 SELECT 现在一次取出 id + opportunity_id 并加 FOR UPDATE
        if (s.includes('opportunity_id FROM crm_quote')) return [quoteRow];
        if (s.includes('FROM crm_opportunity')) return [[{ stage: opportunityStage }]];
        if (s.includes('FROM crm_quote')) return [[{ id: 300, approval_status: 1, status: 1 }]];
        return [{ affectedRows: 1 }];
      });
    };

    it('manager (manageAll=false) 审批通过返回 200 并推进商机', async () => {
      const token = makeToken({ userId: 2, roleId: 2, roleCode: 'manager', manageAll: false });

      installManagerPool([{ opportunity_id: 77 }], 2);
      mockGetUserPermissions.mockResolvedValue(['quotation:approve']);

      const res = await request(app)
        .post('/api/v1/quote/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 300, approval_status: 2 });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('审批通过');
      // 正控：审批通过 → 商机推进到 stage 3（方案报价）
      // 依赖 A1.5 修好的 quoteService ⇄ opportunityService 循环依赖；修好前此处 advanceStage
      // 因拿到过期的空 exports 而是 undefined，调用抛 TypeError 并被内层 try/catch 静默吞掉
      expect(advanceStageSpy).toHaveBeenCalledTimes(1);
      // 【B2】第一参必须是**事务连接**而非 pool —— 商机推进要并入审批的同一个事务，
      //      否则会开出第二个连接、形成互相不可见的两段提交
      expect(advanceStageSpy).toHaveBeenCalledWith(
        mockConn, 77, 3, 2, expect.objectContaining({ changeReason: expect.stringContaining('报价审批通过') })
      );
      // 事务确实开过：务必是「自己的连接」才 begin/commit
      expect(mockConn.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockConn.commit).toHaveBeenCalledTimes(1);
      expect(mockConn.rollback).not.toHaveBeenCalled();
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    it('审批通过但商机已在更后阶段时不倒退（stage 4 谈判 → 不回退到 3）', async () => {
      const token = makeToken({ userId: 2, roleId: 2, roleCode: 'manager', manageAll: false });

      installManagerPool([{ opportunity_id: 77 }], 4);   // 商机已在「谈判」
      mockGetUserPermissions.mockResolvedValue(['quotation:approve']);

      const res = await request(app)
        .post('/api/v1/quote/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 300, approval_status: 2 });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('审批通过');
      // 调用侧单向推进保护：当前 stage(4) >= 目标 stage(3) → 不调用 advanceStage
      expect(advanceStageSpy).not.toHaveBeenCalled();
    });

    it('manager 驳回报价 (approval_status=3) 返回 200 且不推进商机', async () => {
      const token = makeToken({ userId: 2, roleId: 2, roleCode: 'manager', manageAll: false });

      installManagerPool([{ opportunity_id: 77 }]);
      mockGetUserPermissions.mockResolvedValue(['quotation:approve']);

      const res = await request(app)
        .post('/api/v1/quote/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 300, approval_status: 3, approval_remark: '价格过高' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('已拒绝');
      expect(advanceStageSpy).not.toHaveBeenCalled();
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
