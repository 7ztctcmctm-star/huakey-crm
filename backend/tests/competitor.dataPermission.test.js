// ============================================================================
// competitorService EXISTS 参数绑定顺序测试 (cd9c17e 修复的 bug)
// + sales 用户 (roleId=3, type=self) route 行为测试
// ============================================================================
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

// ⚠️ Jest mock 必须在顶层，且用 factory 函数避免 ReferenceError hoisting
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
  getUserPermissions: jest.fn().mockResolvedValue(['competitor:view', 'competitor:add', 'competitor:edit', 'competitor:delete']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const competitorService = require('../services/competitorService');

// ============================================================================
// Part 1: Service 层单元测试 —— 直接测参数绑定顺序
// ============================================================================
describe('competitorService EXISTS 参数绑定顺序 (cd9c17e 修复的 bug)', () => {
  beforeEach(() => { mockPool.query.mockReset(); });

  // buildDataPermissionWhere 需要 type + userId + ownerColumn
  const selfPermission = { type: 'self', userId: 42, ownerColumn: 'create_by' };
  const userId = 42;

  describe('updateEncounter', () => {
    it('params = [...values, outer_id, inner_id, create_by]', async () => {
      mockPool.query.mockResolvedValue([{ affectedRows: 1 }]);
      // 必须传白名单内字段：encounter_type, our_price, their_price, win_reason, our_advantage, their_advantage, lesson_learned, encounter_date
      await competitorService.updateEncounter(mockPool, 20, { lesson_learned: '新教训' }, selfPermission);
      const params = mockPool.query.mock.calls[0][1];
      expect(params.slice(-3)).toEqual([20, 20, userId]);
    });
  });

  describe('deleteEncounter', () => {
    it('params = [outer_id, inner_id, create_by]', async () => {
      mockPool.query.mockResolvedValue([{ affectedRows: 1 }]);
      await competitorService.deleteEncounter(mockPool, 20, selfPermission);
      expect(mockPool.query.mock.calls[0][1]).toEqual([20, 20, userId]);
    });
  });

  describe('updateIntel', () => {
    it('params 尾部 = [inner_id, create_by]', async () => {
      mockPool.query.mockResolvedValue([{ affectedRows: 1 }]);
      await competitorService.updateIntel(mockPool, 10, { title: 'X' }, selfPermission);
      const params = mockPool.query.mock.calls[0][1];
      expect(params[params.length - 2]).toBe(10);
      expect(params[params.length - 1]).toBe(userId);
    });
  });

  describe('deleteIntel', () => {
    it('params = [outer_id, inner_id, create_by]', async () => {
      mockPool.query.mockResolvedValue([{ affectedRows: 1 }]);
      await competitorService.deleteIntel(mockPool, 10, selfPermission);
      expect(mockPool.query.mock.calls[0][1]).toEqual([10, 10, userId]);
    });
  });

  describe('updateCompetitor', () => {
    it('params 尾部 = [inner_id, create_by]', async () => {
      mockPool.query.mockResolvedValue([{ affectedRows: 1 }]);
      await competitorService.updateCompetitor(mockPool, 1, { name: 'X' }, selfPermission);
      const params = mockPool.query.mock.calls[0][1];
      expect(params[params.length - 2]).toBe(1);
      expect(params[params.length - 1]).toBe(userId);
    });
  });

  describe('addIntel parent 权限守卫', () => {
    it('parent 不存在 → throw 无权访问', async () => {
      mockPool.query.mockResolvedValue([[]]);
      await expect(
        competitorService.addIntel(mockPool, { competitor_id: 999, intel_type: 'product', title: 'X', content: 'Y' }, userId, selfPermission)
      ).rejects.toThrow('无权访问该竞品');
    });
    it('parent 存在 → 返回 insertId', async () => {
      mockPool.query
        .mockResolvedValueOnce([[{ id: 1, create_by: userId }]])
        .mockResolvedValueOnce([{ insertId: 100 }]);
      const r = await competitorService.addIntel(mockPool, { competitor_id: 1, intel_type: 'product', title: 'X', content: 'Y' }, userId, selfPermission);
      expect(r).toHaveProperty('id', 100);
    });
  });

  describe('addEncounter parent 权限守卫', () => {
    it('parent 不存在 → throw 无权访问', async () => {
      mockPool.query.mockResolvedValue([[]]);
      await expect(
        competitorService.addEncounter(mockPool, { competitor_id: 999, encounter_type: 'won', our_price: 1, their_price: 2 }, userId, selfPermission)
      ).rejects.toThrow('无权访问该竞品');
    });
  });
});

// ============================================================================
// Part 2: Route 层行为 —— sales 用户 type=self
// ============================================================================
describe('Route 层 sales 用户 (roleId=3, type=self) 行为', () => {
  const salesUserId = 42;
  const salesToken = jwt.sign(
    { userId: salesUserId, username: 'sales_user', roleId: 3, roleCode: 'sales', manageAll: false },
    process.env.JWT_SECRET, { expiresIn: '1h' }
  );

  let app;

  beforeEach(() => {
    mockPool.query.mockReset();
    app = express();
    app.use(express.json());
    app.use('/api/v1/competitor', require('../routes/competitor'));
  });

  const salesAuth = () => {
    mockPool.query
      .mockResolvedValueOnce([[]])              // blacklist
      .mockResolvedValueOnce([[{ view_all: 0, manage_all: 0 }]])
      .mockResolvedValueOnce([[{ must_change_password: 0 }]])
      .mockResolvedValueOnce([[]]);
  };

  describe('POST /intel/add', () => {
    it('parent 不属于自己 → 403', async () => {
      salesAuth();
      mockPool.query.mockResolvedValueOnce([[]]); // parent 空
      const res = await request(app)
        .post('/api/v1/competitor/intel/add')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ competitor_id: 999, intel_type: 'product', title: 'X', content: 'Y' });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /encounters/add', () => {
    it('parent 不属于自己 → 403', async () => {
      salesAuth();
      mockPool.query.mockResolvedValueOnce([[]]);
      const res = await request(app)
        .post('/api/v1/competitor/encounters/add')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ competitor_id: 999, encounter_type: 'won', our_price: 1, their_price: 2 });
      expect(res.status).toBe(403);
    });
  });
});
