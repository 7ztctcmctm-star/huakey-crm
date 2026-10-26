/**
 * paymentService 单元测试
 *
 * [P0-08 2026-10-23] 覆盖回款计划并发修复：
 *   - 登记前锁计划行并校验 plan 属于 contract
 *   - 修改/删除 + 计划重算在同一事务内（失败整体回滚）
 *   - 计划重算使用 FOR UPDATE 当前读
 */

const paymentService = require('../services/paymentService');
const { buildStorageKey } = require('../utils/idempotency');

jest.mock('../services/webhookDispatcher', () => ({
  dispatch: jest.fn().mockResolvedValue(undefined)
}));

function createMockPool() {
  return { query: jest.fn(), getConnection: jest.fn() };
}

function createMockConnection() {
  return { query: jest.fn(), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
}

/** 按 SQL 内容分派的回款事务连接 mock */
function installPaymentConn(conn, overrides = {}) {
  conn.query.mockImplementation(async (sql, params) => {
    const s = String(sql);

    if (s.includes('FROM crm_contract')) {
      return overrides.contract ? overrides.contract(params) : [[{ id: 1, status: 1 }]];
    }
    if (s.includes('FROM crm_payment_plan')) {
      if (s.includes('plan_amount')) {
        return overrides.planAmount ? overrides.planAmount(params) : [[{ plan_amount: '100.00', plan_date: '2026-12-01' }]];
      }
      return overrides.plan ? overrides.plan(params) : [[{ id: 2, contract_id: 1 }]];
    }
    if (s.includes('SUM(pay_amount)')) {
      return overrides.sum ? overrides.sum(params) : [[{ total: '100.00' }]];
    }
    if (s.includes('INSERT INTO crm_payment')) {
      return overrides.insertPayment ? overrides.insertPayment(params) : [{ insertId: 55 }];
    }
    if (s.includes('UPDATE crm_payment_plan')) {
      return overrides.updatePlan ? overrides.updatePlan(params) : [{ affectedRows: 1 }];
    }
    if (s.includes('UPDATE crm_payment SET')) {
      return overrides.updatePayment ? overrides.updatePayment(params) : [{ affectedRows: 1 }];
    }
    if (s.includes('UPDATE crm_contract')) return [{ affectedRows: 1 }];
    if (s.includes('FROM crm_payment')) {
      return overrides.oldPayment ? overrides.oldPayment(params) : [[{ plan_id: 2, contract_id: 1 }]];
    }
    return [[]];
  });
}

/** 模拟幂等占位行已存在（INSERT 撞主键） */
function installCompletedIdempotency(pool, storedResult) {
  pool.query.mockImplementation(async (sql) => {
    const s = String(sql);
    if (s.includes('INSERT INTO crm_idempotency')) {
      const err = new Error('Duplicate entry');
      err.code = 'ER_DUP_ENTRY';
      throw err;
    }
    if (s.includes('SELECT result_json')) {
      return [[{ result_json: JSON.stringify(storedResult) }]];
    }
    return [[]];
  });
}

const BASE_PAYMENT = {
  contract_id: 1,
  pay_date: '2026-07-01',
  pay_amount: 50000,
  pay_method: '银行转账'
};

describe('paymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('recordPayment · 基本事务', () => {
    it('应创建回款记录并提交', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      installPaymentConn(conn);

      const result = await paymentService.recordPayment(pool, { ...BASE_PAYMENT, plan_id: 2 });

      expect(result).toEqual({ id: 55 });
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();

      // [P0-08] 计划重算必须走锁定读
      const planLock = conn.query.mock.calls.find(
        (c) => String(c[0]).includes('FROM crm_payment_plan') && String(c[0]).includes('FOR UPDATE')
      );
      expect(planLock).toBeDefined();
    });

    it('合同不存在应抛出异常并回滚', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      installPaymentConn(conn, { contract: () => [[]] });

      await expect(paymentService.recordPayment(pool, { ...BASE_PAYMENT, contract_id: 999 }))
        .rejects.toThrow('所属合同不存在');
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  describe('[P0-08] 计划 / 合同归属校验', () => {
    it('计划不存在 → 404，且不插入回款', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      installPaymentConn(conn, { plan: () => [[]] });

      await expect(paymentService.recordPayment(pool, { ...BASE_PAYMENT, plan_id: 999 }))
        .rejects.toMatchObject({ httpStatus: 404 });

      expect(conn.query.mock.calls.some((c) => String(c[0]).includes('INSERT INTO crm_payment'))).toBe(false);
      expect(conn.rollback).toHaveBeenCalled();
    });

    it('计划属于其他合同 → 400「回款计划不属于该合同」，不落库', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      installPaymentConn(conn, { plan: () => [[{ id: 9, contract_id: 777 }]] });

      await expect(paymentService.recordPayment(pool, { ...BASE_PAYMENT, contract_id: 1, plan_id: 9 }))
        .rejects.toThrow('回款计划不属于该合同');

      expect(conn.query.mock.calls.some((c) => String(c[0]).includes('INSERT INTO crm_payment'))).toBe(false);
      expect(conn.rollback).toHaveBeenCalled();
    });

    it('登记前先用 FOR UPDATE 锁计划行（并发串行化）', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      installPaymentConn(conn);

      await paymentService.recordPayment(pool, { ...BASE_PAYMENT, plan_id: 2 });

      const planChecks = conn.query.mock.calls.filter(
        (c) => String(c[0]).includes('SELECT id, contract_id FROM crm_payment_plan')
      );
      expect(planChecks).toHaveLength(1);
      expect(String(planChecks[0][0])).toContain('FOR UPDATE');
    });
  });

  describe('recordPayment · 幂等（P0-07 协议）', () => {
    it('带幂等键重复提交应直接返回首次结果、不进入业务事务', async () => {
      const pool = createMockPool();
      installCompletedIdempotency(pool, { id: 55 });

      const result = await paymentService.recordPayment(pool, BASE_PAYMENT, 'idem-key-dup-001', 7);

      expect(result).toEqual({ id: 55 });
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    it('带幂等键首次提交应执行业务并按 user 命名空间记录幂等键', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      installPaymentConn(conn);
      pool.query.mockResolvedValue([{ affectedRows: 1 }]); // INSERT 占位 / UPDATE 回填

      const result = await paymentService.recordPayment(pool, BASE_PAYMENT, 'idem-key-first-001', 7);

      expect(result).toEqual({ id: 55 });

      const insertCall = pool.query.mock.calls.find(c => String(c[0]).includes('INSERT INTO crm_idempotency'));
      expect(insertCall).toBeDefined();
      // 存储键 = sha256(biz_type + user + raw key)，不再是原始 key
      expect(insertCall[1]).toEqual([
        buildStorageKey('payment', 7, 'idem-key-first-001'),
        'payment'
      ]);
      const updateCall = pool.query.mock.calls.find(c => String(c[0]).includes('UPDATE crm_idempotency'));
      expect(updateCall[1]).toEqual([
        JSON.stringify({ id: 55 }),
        buildStorageKey('payment', 7, 'idem-key-first-001')
      ]);
    });
  });

  describe('[P0-08] updatePayment：事务内改金额 + 重算', () => {
    it('锁回款行、更新并在同事务内重算计划，最后提交', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      installPaymentConn(conn);

      await paymentService.updatePayment(pool, { id: 55, pay_date: '2026-07-15', pay_amount: 30000 });

      const lockCall = conn.query.mock.calls.find(
        (c) => String(c[0]).includes('FROM crm_payment WHERE id = ?') && String(c[0]).includes('FOR UPDATE')
      );
      expect(lockCall).toBeDefined();
      expect(conn.query.mock.calls.some((c) => String(c[0]).includes('UPDATE crm_payment SET'))).toBe(true);
      expect(conn.query.mock.calls.some((c) => String(c[0]).includes('UPDATE crm_payment_plan'))).toBe(true);
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });

    it('更新失败 → 整体回滚（不会留下「回款已改、计划未重算」）', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      installPaymentConn(conn, {
        updatePayment: () => { throw new Error('db write failed'); }
      });

      await expect(paymentService.updatePayment(pool, { id: 55, pay_amount: 1 }))
        .rejects.toThrow('db write failed');

      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.commit).not.toHaveBeenCalled();
    });
  });

  describe('[P0-08] deletePayment：事务内软删 + 重算', () => {
    it('软删后同事务重算计划并提交', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      installPaymentConn(conn);

      await paymentService.deletePayment(pool, 55);

      const softDelete = conn.query.mock.calls.find(
        (c) => String(c[0]).includes('UPDATE crm_payment SET deleted_at = NOW()')
      );
      expect(softDelete).toBeDefined();
      expect(conn.query.mock.calls.some((c) => String(c[0]).includes('UPDATE crm_payment_plan'))).toBe(true);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('并发双击：第二次查不到未删除记录 → 404 回滚，不重复重算', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      installPaymentConn(conn, { oldPayment: () => [[]] });

      await expect(paymentService.deletePayment(pool, 55)).rejects.toMatchObject({ httpStatus: 404 });
      expect(conn.query.mock.calls.some((c) => String(c[0]).includes('UPDATE crm_payment SET deleted_at'))).toBe(false);
      expect(conn.rollback).toHaveBeenCalled();
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
