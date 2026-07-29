/**
 * paymentService 单元测试
 */

const paymentService = require('../services/paymentService');

function createMockPool() {
  return { query: jest.fn(), getConnection: jest.fn() };
}

function createMockConnection() {
  return { query: jest.fn(), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
}

describe('paymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('recordPayment', () => {
    it('应创建回款记录', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      conn.query
        .mockResolvedValueOnce([[{ id: 1, status: 2 }]])    // contract check
        .mockResolvedValueOnce([{ insertId: 55 }])            // INSERT payment
        .mockResolvedValueOnce([]);                            // UPDATE contract status

      const result = await paymentService.recordPayment(pool, {
        contract_id: 1,
        pay_date: '2026-07-01',
        pay_amount: 50000,
        pay_method: '银行转账'
      });

      expect(result).toHaveProperty('id', 55);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('合同不存在应抛出异常', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      conn.query.mockResolvedValueOnce([[]]); // no contract

      await expect(paymentService.recordPayment(pool, {
        contract_id: 999,
        pay_date: '2026-07-01',
        pay_amount: 1000,
        pay_method: '现金'
      })).rejects.toThrow('所属合同不存在');
    });
  });

  describe('updatePayment', () => {
    it('应更新回款记录并刷新计划状态', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ plan_id: null, contract_id: 1 }]]) // old lookup (no plan_id → skip recalculate)
        .mockResolvedValueOnce([]);                                   // UPDATE

      await paymentService.updatePayment(pool, {
        id: 55,
        pay_date: '2026-07-15',
        pay_amount: 30000
      });

      expect(pool.query.mock.calls[1][0]).toContain('UPDATE crm_payment SET');
    });
  });

  describe('getOverduePayments', () => {
    it('应返回逾期回款列表', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 2 }]])
        .mockResolvedValueOnce([[{ id: 1, plan_amount: 5000 }, { id: 2, plan_amount: 8000 }]]);

      const result = await paymentService.getOverduePayments(pool, { page: 1, pageSize: 20 });
      expect(result.list).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });
});
