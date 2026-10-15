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

    // 2026-10-15 幂等机制回归（AGENTS.md 7.18）：crm_payment 无唯一约束，
    // 重复提交/网络重试曾会直接产生重复回款（资金账目错误）。
    it('带幂等键重复提交应直接返回首次结果、不重复落库', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      // 幂等键已存在（首次请求已成功并记录）
      pool.query.mockResolvedValueOnce([[{ result_json: JSON.stringify({ id: 55 }) }]]);

      const result = await paymentService.recordPayment(pool, {
        contract_id: 1,
        pay_date: '2026-07-01',
        pay_amount: 50000,
        pay_method: '银行转账'
      }, 'idem-key-dup-001');

      expect(result).toEqual({ id: 55 });
      expect(pool.getConnection).not.toHaveBeenCalled(); // 不进入业务事务
      expect(conn.query).not.toHaveBeenCalled();
    });

    it('带幂等键首次提交应执行业务并记录幂等键', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      pool.query.mockResolvedValueOnce([[]]); // 幂等键不存在
      conn.query
        .mockResolvedValueOnce([[{ id: 1, status: 2 }]])    // contract check
        .mockResolvedValueOnce([{ insertId: 55 }])            // INSERT payment
        .mockResolvedValueOnce([]);                            // UPDATE contract status

      const result = await paymentService.recordPayment(pool, {
        contract_id: 1,
        pay_date: '2026-07-01',
        pay_amount: 50000,
        pay_method: '银行转账'
      }, 'idem-key-first-001');

      expect(result).toHaveProperty('id', 55);
      // 幂等键记录：webhookDispatcher.dispatch 内部也会走 pool.query，故按内容查找而非固定索引
      const insertCall = pool.query.mock.calls.find(c => String(c[0]).includes('INSERT INTO crm_idempotency'));
      expect(insertCall).toBeDefined();
      expect(insertCall[1]).toEqual(['idem-key-first-001', 'payment', JSON.stringify({ id: 55 })]);
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
