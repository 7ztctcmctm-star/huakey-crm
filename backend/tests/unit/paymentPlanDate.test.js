/**
 * 回款计划日期唯一性（迁移 123 uk_plan_contract_date 的配套前置校验）
 *
 * 覆盖三个写入点：
 *   utils/paymentPlan         —— 工具本身（日期归一化 / 判重 / 抛错）
 *   paymentService.createPaymentPlans
 *   contractService.createContract
 * （contractCrudService.updateContract 见 services-contractCrudService.test.js）
 */

const { toPlanDateKey, findDuplicatePlanDate, assertUniquePlanDates } = require('../../utils/paymentPlan');
const paymentService = require('../../services/paymentService');
const contractService = require('../../services/contractService');

function createMockPool() {
  return { query: jest.fn(), getConnection: jest.fn() };
}

describe('utils/paymentPlan', () => {
  it('toPlanDateKey 应归一化字符串 / ISO 串 / Date 三种形态', () => {
    expect(toPlanDateKey('2026-01-05')).toBe('2026-01-05');
    expect(toPlanDateKey('2026-01-05T00:00:00.000Z')).toBe('2026-01-05');
    // mysql2 把 DATE 列返回成本地时区 Date（00:00:00），必须按本地日期取，不能用 toISOString
    expect(toPlanDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('toPlanDateKey 空值应返回空串', () => {
    expect(toPlanDateKey(null)).toBe('');
    expect(toPlanDateKey(undefined)).toBe('');
    expect(toPlanDateKey('')).toBe('');
  });

  it('findDuplicatePlanDate 无重复返回 null，有重复返回该日期', () => {
    expect(findDuplicatePlanDate(['2026-01-01', '2026-02-01'])).toBeNull();
    expect(findDuplicatePlanDate(['2026-01-01', '2026-02-01', '2026-01-01'])).toBe('2026-01-01');
  });

  it('findDuplicatePlanDate 应把 Date 与字符串视为同一天', () => {
    expect(findDuplicatePlanDate(['2026-03-01', new Date(2026, 2, 1)])).toBe('2026-03-01');
  });

  it('findDuplicatePlanDate 空值不参与判重', () => {
    expect(findDuplicatePlanDate([null, undefined, ''])).toBeNull();
  });

  it('assertUniquePlanDates 重复时应抛 400005 且 message 带具体日期', () => {
    expect(() => assertUniquePlanDates(['2026-04-01', '2026-04-01'])).toThrow(/2026-04-01/);
    try {
      assertUniquePlanDates(['2026-04-01', '2026-04-01']);
    } catch (e) {
      expect(e.code).toBe(400005);
    }
  });

  it('assertUniquePlanDates 无重复时不抛错', () => {
    expect(() => assertUniquePlanDates(['2026-04-01', '2026-05-01'])).not.toThrow();
  });
});

describe('paymentService.createPaymentPlans', () => {
  beforeEach(() => jest.clearAllMocks());

  it('空计划应直接返回 0 且不查库', async () => {
    const pool = createMockPool();
    await expect(paymentService.createPaymentPlans(pool, 1, [])).resolves.toEqual({ count: 0 });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('与库里已有计划撞日期时应抛 400 且不再执行 INSERT', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValueOnce([[{ plan_date: new Date(2026, 5, 1) }]]); // 已有 06-01

    await expect(
      paymentService.createPaymentPlans(pool, 1, [{ plan_date: '2026-06-01', plan_amount: 100 }])
    ).rejects.toMatchObject({ code: 400005, message: expect.stringContaining('2026-06-01') });

    expect(pool.query).toHaveBeenCalledTimes(1); // 只查了已有计划，没有 INSERT
  });

  it('日期不冲突时应正常批量插入', async () => {
    const pool = createMockPool();
    pool.query
      .mockResolvedValueOnce([[{ plan_date: new Date(2026, 4, 1) }]]) // 已有 05-01
      .mockResolvedValueOnce([{ affectedRows: 2 }]);

    const result = await paymentService.createPaymentPlans(pool, 1, [
      { plan_date: '2026-06-01', plan_amount: 100 },
      { plan_date: '2026-07-01', plan_amount: 200 }
    ]);

    expect(result.count).toBe(2);
    expect(pool.query.mock.calls[1][0]).toContain('INSERT INTO crm_payment_plan');
  });
});

describe('contractService.createContract 计划日期判重', () => {
  const mockPool = { query: jest.fn(), getConnection: jest.fn() };
  const createConn = () => ({
    query: jest.fn(), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn()
  });

  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.getConnection.mockReset();
  });

  it('传入重复日期时应抛 400 且回滚、不落回款计划', async () => {
    const conn = createConn();
    mockPool.getConnection.mockResolvedValue(conn);
    conn.query
      .mockResolvedValueOnce([[{ id: 1, status: 'signed', company_name: 'A' }]]) // 客户校验
      .mockResolvedValueOnce([[{ cnt: 0 }]])                                       // 编号 COUNT
      .mockResolvedValueOnce([{ insertId: 60 }]);                                  // INSERT 合同

    await expect(
      contractService.createContract(mockPool, {
        customer_id: 1,
        amount: 10000,
        plans: [
          { plan_date: '2026-07-01', plan_amount: 100 },
          { plan_date: '2026-07-01', plan_amount: 200 }
        ]
      }, 1)
    ).rejects.toMatchObject({ code: 400005, message: expect.stringContaining('2026-07-01') });

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.query).toHaveBeenCalledTimes(3); // 未执行批量插入
  });

  it('日期不重复时应照常批量插入', async () => {
    const conn = createConn();
    mockPool.getConnection.mockResolvedValue(conn);
    conn.query
      .mockResolvedValueOnce([[{ id: 1, status: 'signed', company_name: 'A' }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([{ insertId: 61 }])
      .mockResolvedValueOnce([{ affectedRows: 2 }]);

    const result = await contractService.createContract(mockPool, {
      customer_id: 1,
      amount: 10000,
      plans: [
        { plan_date: '2026-07-01', plan_amount: 100 },
        { plan_date: '2026-12-01', plan_amount: 200 }
      ]
    }, 1);

    expect(result.id).toBe(61);
    expect(conn.query.mock.calls[3][0]).toContain('crm_payment_plan');
  });
});
