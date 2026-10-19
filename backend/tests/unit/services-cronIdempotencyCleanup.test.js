/**
 * cronService.cleanExpiredIdempotency（步骤 B2 · 2026-10-19）
 *
 * crm_idempotency 只增不删：每个带幂等键的成功写入都会永久留一行。
 * 不加清理会无限增长。本用例锁定「默认 30 天、天数可配、只删过期」三点。
 */

const cronService = require('../../services/cronService');

describe('cronService.cleanExpiredIdempotency', () => {
  let pool;

  beforeEach(() => {
    pool = { query: jest.fn() };
  });

  it('默认保留 30 天：DELETE 的 INTERVAL 参数必须是 30', async () => {
    pool.query.mockResolvedValue([{ affectedRows: 4 }]);

    const n = await cronService.cleanExpiredIdempotency(pool);

    expect(n).toBe(4);
    const [sql, params] = pool.query.mock.calls[0];
    expect(String(sql)).toContain('DELETE FROM crm_idempotency');
    expect(String(sql)).toContain('create_time < NOW() - INTERVAL ? DAY');
    expect(params).toEqual([30]);
  });

  it('天数可覆盖', async () => {
    pool.query.mockResolvedValue([{ affectedRows: 1 }]);

    await cronService.cleanExpiredIdempotency(pool, 7);

    expect(pool.query.mock.calls[0][1]).toEqual([7]);
  });

  it('affectedRows 缺失时返回 0，不返回 undefined', async () => {
    pool.query.mockResolvedValue([{}]);

    expect(await cronService.cleanExpiredIdempotency(pool)).toBe(0);
  });

  it('不得误删未过期的记录：条件必须基于 create_time 而非主键', async () => {
    pool.query.mockResolvedValue([{ affectedRows: 0 }]);

    await cronService.cleanExpiredIdempotency(pool, 30);

    const sql = String(pool.query.mock.calls[0][0]);
    expect(sql).toContain('create_time');
    expect(sql).not.toMatch(/TRUNCATE|DELETE FROM crm_idempotency\s*;/i);
  });
});
