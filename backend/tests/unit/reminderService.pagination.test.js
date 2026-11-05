/**
 * P1-04：reminderService.getOverdueList 分页参数错位回归测试。
 *
 * 审计结论（docs/audit-report-2026-10-23.md）：
 *   list 查询的 SQL 占位符只有 [INTERVAL ?] + 可选 [owner_id = ?] + [LIMIT ? OFFSET ?]，
 *   但实现多传了一个 overdueDays，导致 LIMIT 绑到 overdueDays、OFFSET 绑到 pageSize，
 *   返回条数与翻页完全错乱。
 *
 * 本测试锁定：list 查询参数必须与 SQL 占位符一一对应，offset = (page - 1) * pageSize。
 */

const reminderService = require('../../services/reminderService');

function createMockPool() {
  return { query: jest.fn() };
}

describe('reminderService.getOverdueList 分页（P1-04）', () => {
  it('BOSS（isBoss=true）：参数为 [overdueDays, pageSize, offset]，无多余参数', async () => {
    const pool = createMockPool();
    pool.query
      .mockResolvedValueOnce([[{ total: 100 }]]) // COUNT
      .mockResolvedValueOnce([[]]);               // SELECT

    await reminderService.getOverdueList(
      pool,
      { page: 2, pageSize: 20, overdueDays: 45 },
      { isBoss: true }
    );

    const countCall = pool.query.mock.calls[0];
    expect(countCall[1]).toEqual([45]);

    const listCall = pool.query.mock.calls[1];
    expect(listCall[0]).toContain('LIMIT ? OFFSET ?');
    expect(listCall[1]).toEqual([45, 20, 20]); // overdueDays, pageSize, offset
  });

  it('非 BOSS：参数为 [overdueDays, userId, pageSize, offset]', async () => {
    const pool = createMockPool();
    pool.query
      .mockResolvedValueOnce([[{ total: 3 }]])
      .mockResolvedValueOnce([[]]);

    await reminderService.getOverdueList(
      pool,
      { page: 3, pageSize: 10, overdueDays: 30 },
      { isBoss: false, userId: 7 }
    );

    const countCall = pool.query.mock.calls[0];
    expect(countCall[1]).toEqual([30, 7]);

    const listCall = pool.query.mock.calls[1];
    expect(listCall[0]).toContain('c.owner_id = ?');
    expect(listCall[1]).toEqual([30, 7, 10, 20]); // overdueDays, userId, pageSize, offset
  });

  it('默认分页：page=1,pageSize=20 → offset=0，且 total 原样返回', async () => {
    const pool = createMockPool();
    pool.query
      .mockResolvedValueOnce([[{ total: 42 }]])
      .mockResolvedValueOnce([[]]);

    const result = await reminderService.getOverdueList(pool, {}, { isBoss: false, userId: 9 });

    expect(pool.query.mock.calls[1][1]).toEqual([30, 9, 20, 0]);
    expect(result).toEqual({ list: [], total: 42, page: 1, pageSize: 20 });
  });

  it('字符串型分页参数应归一化为数字（避免 LIMIT 绑定字符串）', async () => {
    const pool = createMockPool();
    pool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    const result = await reminderService.getOverdueList(
      pool,
      { page: '2', pageSize: '50', overdueDays: 30 },
      { isBoss: true }
    );

    expect(pool.query.mock.calls[1][1]).toEqual([30, 50, 50]);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(50);
  });
});
