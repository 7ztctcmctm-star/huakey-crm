/**
 * P1-08：日程跨用户 IDOR 收口。
 *
 * 审计结论：getEvents / getEvent / getToday / getUpcoming / completeEvent 均未按创建人过滤，
 * 任何持有 calendar 码的用户都能读写他人日程。修复后非 manageAll 一律追加 `e.create_by = ?`。
 */

const calendarService = require('../../services/calendarRouteService');

function createPool() {
  return { query: jest.fn().mockResolvedValue([[], []]) };
}

const SALES = { userId: 7, manageAll: false };
const BOSS = { userId: 1, manageAll: true };

describe('calendarRouteService 数据范围（P1-08）', () => {
  it('getEvents 非 manageAll：SQL 带 create_by 且参数含 userId', async () => {
    const pool = createPool();
    await calendarService.getEvents(pool, { start_date: '2026-10-01' }, SALES);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('e.create_by = ?');
    expect(params[0]).toBe(7);
    expect(params).toContain('2026-10-01');
  });

  it('getEvents manageAll：不加 create_by 过滤', async () => {
    const pool = createPool();
    await calendarService.getEvents(pool, {}, BOSS);
    expect(pool.query.mock.calls[0][0]).not.toContain('e.create_by = ?');
  });

  it('getEvent 非 manageAll：详情按创建人限定', async () => {
    const pool = { query: jest.fn().mockResolvedValue([[null], []]) };
    await calendarService.getEvent(pool, 5, SALES);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('e.create_by = ?');
    expect(params).toEqual([5, 7]);
  });

  it('getEvent manageAll：不限创建人', async () => {
    const pool = { query: jest.fn().mockResolvedValue([[null], []]) };
    await calendarService.getEvent(pool, 5, BOSS);
    expect(pool.query.mock.calls[0][1]).toEqual([5]);
  });

  it('getToday / getUpcoming 非 manageAll：按创建人过滤', async () => {
    const pool = createPool();
    await calendarService.getToday(pool, SALES);
    await calendarService.getUpcoming(pool, SALES);
    expect(pool.query.mock.calls[0][0]).toContain('e.create_by = ?');
    expect(pool.query.mock.calls[0][1]).toEqual([7]);
    expect(pool.query.mock.calls[1][0]).toContain('e.create_by = ?');
    expect(pool.query.mock.calls[1][1]).toEqual([7]);
  });

  it('completeEvent：他人日程 0 行 → 404，不静默成功', async () => {
    const pool = { query: jest.fn().mockResolvedValue([{ affectedRows: 0 }]) };
    const r = await calendarService.completeEvent(pool, 9, SALES);
    expect(r).toMatchObject({ status: 404 });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('create_by = ?');
    expect(params).toEqual([9, 7]);
  });

  it('completeEvent：本人日程成功', async () => {
    const pool = { query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    const r = await calendarService.completeEvent(pool, 9, SALES);
    expect(r).toEqual({ success: true });
  });
});
