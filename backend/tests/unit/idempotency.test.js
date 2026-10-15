/**
 * runIdempotent 幂等执行工具单元测试（2026-10-15 · AGENTS.md 7.18）
 *
 * 背景：crm_payment 无唯一约束、recordPayment/createContract 无幂等校验，
 * 重复提交会产生重复回款（资金账目错误）与重复合同。本工具以幂等键
 * （crm_idempotency 表，key 为主键）保证同一业务意图只落库一次。
 */

const { runIdempotent } = require('../../utils/idempotency');

describe('runIdempotent（幂等执行工具）', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('无 key 时直接执行业务函数（渐进增强，不破坏未传 key 的调用方）', async () => {
    const pool = { query: jest.fn() };
    const fn = jest.fn().mockResolvedValue({ id: 1 });

    const { result, fromCache } = await runIdempotent(pool, null, 'payment', fn);

    expect(result).toEqual({ id: 1 });
    expect(fromCache).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(pool.query).not.toHaveBeenCalled(); // 不碰幂等表
  });

  it('同 key 二次调用返回缓存结果且不重复执行业务', async () => {
    const pool = { query: jest.fn() };
    // 首次：SELECT 空 → 执行业务 → INSERT 记录
    pool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([]);
    const fn = jest.fn().mockResolvedValue({ id: 77 });

    const first = await runIdempotent(pool, 'key-abc', 'payment', fn);
    expect(first).toEqual({ result: { id: 77 }, fromCache: false });
    expect(fn).toHaveBeenCalledTimes(1);

    // 二次：SELECT 命中缓存 → 不执行业务
    pool.query.mockResolvedValueOnce([[{ result_json: JSON.stringify({ id: 77 }) }]]);
    const second = await runIdempotent(pool, 'key-abc', 'payment', fn);
    expect(second).toEqual({ result: { id: 77 }, fromCache: true });
    expect(fn).toHaveBeenCalledTimes(1); // 仍未再执行业务
  });

  it('业务失败时不记录幂等键（客户端可安全重试）', async () => {
    const pool = { query: jest.fn() };
    pool.query.mockResolvedValueOnce([[]]); // SELECT 空
    const fn = jest.fn().mockRejectedValue(new Error('合同不存在'));

    await expect(runIdempotent(pool, 'key-fail', 'payment', fn)).rejects.toThrow('合同不存在');
    // 只有 SELECT，没有 INSERT（失败不记 key）
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toContain('SELECT result_json');
  });

  it('并发撞主键 ER_DUP_ENTRY 时读回抢先请求的结果', async () => {
    const pool = { query: jest.fn() };
    pool.query
      .mockResolvedValueOnce([[]]) // SELECT 空
      .mockRejectedValueOnce(Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' })) // INSERT 撞主键
      .mockResolvedValueOnce([[{ result_json: JSON.stringify({ id: 99 }) }]]); // 重读
    const fn = jest.fn().mockResolvedValue({ id: 99 });

    const { result, fromCache } = await runIdempotent(pool, 'key-race', 'contract', fn);

    expect(result).toEqual({ id: 99 });
    expect(fromCache).toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(3);
  });
});
