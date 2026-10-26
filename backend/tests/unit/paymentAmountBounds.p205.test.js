/**
 * [P2-05] 回款金额边界 —— 服务层强制校验
 *
 * 审计：paymentService.js recordPayment/updatePayment 对 pay_amount 无任何校验，
 * 路由 schema 也只有 min(0)，0 元回款可入库、超 DECIMAL(15,2) 的值会被 MySQL
 * 截断/报错。本文件直接调用服务层，断言：
 *   - 0 / 负数 / 非数字 / 超上限 / 3 位小数 → 400005
 *   - 校验发生在幂等占位与事务之前（无效请求不写 crm_idempotency、不取连接）
 *   - 0.01 与 DECIMAL(15,2) 上限是合法边界
 */
jest.mock('../../services/webhookDispatcher', () => ({
  dispatch: jest.fn().mockResolvedValue(undefined)
}));

const paymentService = require('../../services/paymentService');
const money = require('../../utils/money');

function createHarness() {
  const conn = {
    query: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn()
  };
  const pool = {
    query: jest.fn(),
    getConnection: jest.fn().mockResolvedValue(conn)
  };
  return { pool, conn };
}

const baseData = {
  contract_id: 1,
  plan_id: null,
  pay_date: '2026-10-26',
  pay_method: '银行转账'
};

describe('[P2-05] paymentService.recordPayment 金额边界', () => {
  it.each([
    [0, /必须大于 0/],
    [-0.01, /必须大于 0/],
    ['abc', /必须是有效数字/],
    [Number.POSITIVE_INFINITY, /必须是有效数字/],
    [money.MAX_AMOUNT + 0.01, /不能超过/],
    [12.345, /最多保留两位小数/]
  ])('pay_amount=%p 应抛 400005（%p）且不进入幂等/事务', async (amount, messagePattern) => {
    const { pool } = createHarness();

    await expect(
      paymentService.recordPayment(
        pool,
        { ...baseData, pay_amount: amount },
        'idem-invalid-amount',
        1
      )
    ).rejects.toMatchObject({
      code: 400005,
      message: expect.stringMatching(messagePattern)
    });

    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled(); // 幂等占位也不写
  });

  it.each([0.01, money.MAX_AMOUNT])('pay_amount=%p 是合法边界，应正常入库', async (amount) => {
    const { pool, conn } = createHarness();
    conn.query.mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes('FROM crm_contract')) return [[{ id: 1, status: 1 }]];
      if (s.includes('INSERT INTO crm_payment')) return [{ insertId: 9 }];
      return [{}];
    });

    const result = await paymentService.recordPayment(
      pool,
      { ...baseData, pay_amount: amount },
      null,
      1
    );

    expect(result).toEqual({ id: 9 });
    const insertCall = conn.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO crm_payment'));
    expect(insertCall[1][3]).toBe(amount);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('两位小数的字符串金额应归一化为 number 后入库', async () => {
    const { pool, conn } = createHarness();
    conn.query.mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes('FROM crm_contract')) return [[{ id: 1, status: 1 }]];
      if (s.includes('INSERT INTO crm_payment')) return [{ insertId: 10 }];
      return [{}];
    });

    await paymentService.recordPayment(pool, { ...baseData, pay_amount: '100.50' }, null, 1);

    const insertCall = conn.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO crm_payment'));
    expect(insertCall[1][3]).toBe(100.5);
  });
});

describe('[P2-05] paymentService.updatePayment 金额边界', () => {
  it.each([0, -1, money.MAX_AMOUNT + 0.01, 'xyz', 1.234])(
    'pay_amount=%p 应抛 400005 且不取连接',
    async (amount) => {
      const { pool } = createHarness();

      await expect(
        paymentService.updatePayment(pool, {
          id: 3,
          pay_date: '2026-10-26',
          pay_amount: amount,
          pay_method: '银行转账',
          remark: null
        })
      ).rejects.toMatchObject({ code: 400005 });

      expect(pool.getConnection).not.toHaveBeenCalled();
    }
  );

  it('合法金额应写入归一化后的 number', async () => {
    const { pool, conn } = createHarness();
    conn.query.mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes('FROM crm_payment')) return [[{ plan_id: null, contract_id: 1 }]];
      return [{ affectedRows: 1 }];
    });

    await paymentService.updatePayment(pool, {
      id: 3,
      pay_date: '2026-10-26',
      pay_amount: '50.25',
      pay_method: '银行转账',
      remark: null
    });

    const updateCall = conn.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE crm_payment'));
    expect(updateCall[1][1]).toBe(50.25);
    expect(conn.commit).toHaveBeenCalled();
  });
});
