/**
 * purchaseService 单元测试
 */

const purchaseService = require('../services/purchaseService');

function createMockPool() {
  return { query: jest.fn(), getConnection: jest.fn() };
}

function createMockConnection() {
  return { query: jest.fn(), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
}

describe('purchaseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPlan', () => {
    it('应批量创建采购计划和明细项', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      conn.query
        .mockResolvedValueOnce([[{ cnt: 0 }]])     // generatePlanNo
        .mockResolvedValueOnce([{ insertId: 10 }])  // INSERT plan
        .mockResolvedValueOnce([]);                  // batch INSERT items

      const result = await purchaseService.createPlan(pool, {
        name: 'Q3采购计划',
        remark: '季度采购',
        items: [
          { product_id: 1, quantity: 10, unit_price: 100 },
          { product_id: 2, quantity: 5, unit_price: 200 }
        ]
      }, 1);

      expect(result).toHaveProperty('id', 10);
      expect(result).toHaveProperty('plan_no');
      expect(conn.commit).toHaveBeenCalled();
    });

    it('创建失败应回滚事务', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      conn.query.mockResolvedValueOnce([[{ cnt: 0 }]]);
      conn.query.mockRejectedValueOnce(new Error('INSERT failed'));

      await expect(purchaseService.createPlan(pool, {
        name: '失败的计划',
        items: [{ product_id: 1, quantity: 1, unit_price: 10 }]
      }, 1)).rejects.toThrow('INSERT failed');

      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  describe('updatePlan', () => {
    it('应更新草稿状态的计划', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      conn.query
        .mockResolvedValueOnce([[{ status: 'draft' }]])  // plan check
        .mockResolvedValueOnce([])                         // UPDATE
        .mockResolvedValueOnce([]);                        // DELETE + INSERT items

      const result = await purchaseService.updatePlan(pool, 10, { name: '改个名字' });
      expect(result).toEqual({ success: true });
      expect(conn.commit).toHaveBeenCalled();
    });

    it('非草稿状态的计划不可编辑', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      conn.query.mockResolvedValueOnce([[{ status: 'completed' }]]);

      const result = await purchaseService.updatePlan(pool, 10, { name: '改名字' });
      expect(result).toEqual({ error: '只能编辑草稿状态的计划', code: 400 });
    });
  });

  describe('getPlans', () => {
    it('应分页返回采购计划列表', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 5 }]])
        .mockResolvedValueOnce([[{ id: 1, name: '计划A' }, { id: 2, name: '计划B' }]]);

      const result = await purchaseService.getPlans(pool, { page: 1, pageSize: 10 });
      expect(result.list).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(pool.query.mock.calls[0][0]).toContain('deleted_at IS NULL');
    });
  });
});
