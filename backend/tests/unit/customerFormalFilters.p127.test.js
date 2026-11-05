/**
 * [P1-27] 正式客户列表筛选 SQL 组合（service 层）
 *
 * 背景：前端正式客户页会下发 status / business_status / lifecycle_status /
 * overdue / overdue_follow / tag_id，但旧 schema 与 service 只接受其中一部分，
 * 其余被 stripUnknown 静默丢弃。本文件锁定 service 侧：
 *   · 正式集合以权威字段 status 为准，包含 lost 与 paused；
 *   · business_status='paused'（状态 tab）能命中 paused，而不是被忽略后返回全量；
 *   · 每个筛选都真正落到 SQL 参数，非法状态显式报错。
 */

jest.mock('../../utils/config', () => ({
  getOverdueDays: jest.fn(async () => 15)
}));

const customerService = require('../../services/customerService');

function makePool() {
  return {
    query: jest.fn()
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]])
  };
}

async function run(params = {}) {
  const pool = makePool();
  await customerService.listFormalCustomers(pool, params, null);
  const [countSql, countParams] = pool.query.mock.calls[0];
  const [listSql, listParams] = pool.query.mock.calls[1];
  return { pool, countSql, countParams, listSql, listParams };
}

describe('[P1-27] listFormalCustomers 筛选落库', () => {
  it('正式集合按 status 取 following/quoted/negotiating/signed/lost/paused', async () => {
    const { countSql, countParams } = await run();

    expect(countSql).toContain('c.status IN (?,?,?,?,?,?)');
    expect(countSql).toContain('c.owner_id IS NOT NULL');
    expect(countParams.slice(0, 6)).toEqual([
      'following', 'quoted', 'negotiating', 'signed', 'lost', 'paused'
    ]);
  });

  it('SELECT 返回 status / lifecycle_status（前端状态列与筛选结果可核对）', async () => {
    const { listSql } = await run();

    expect(listSql).toContain('c.status');
    expect(listSql).toContain('c.lifecycle_status');
    expect(listSql).toContain('c.business_status');
  });

  it.each([
    ['lost', 'lost'],
    ['paused', 'paused'],
    ['following', 'following']
  ])('状态 tab business_status=%s 按 status 过滤', async (tab, expected) => {
    const { countSql, countParams } = await run({ business_status: tab });

    expect(countSql).toContain('c.status = ?');
    expect(countParams).toContain(expected);
  });

  it('状态下拉 status 与 tab business_status 同时存在时两者都生效（交集，不静默丢弃）', async () => {
    const { countSql, countParams } = await run({ status: 'quoted', business_status: 'paused' });

    expect((countSql.match(/c\.status = \?/g) || []).length).toBe(2);
    expect(countParams).toContain('quoted');
    expect(countParams).toContain('paused');
  });

  it('lifecycle_status 落到 SQL', async () => {
    const { countSql, countParams } = await run({ lifecycle_status: 'active' });

    expect(countSql).toContain('c.lifecycle_status = ?');
    expect(countParams).toContain('active');
  });

  it('tag_id 走 crm_customer_tag EXISTS 子查询', async () => {
    const { countSql, countParams } = await run({ tag_id: 9 });

    expect(countSql).toContain('EXISTS (SELECT 1 FROM crm_customer_tag ct');
    expect(countParams).toContain(9);
  });

  it('overdue_follow 只保留超过 7 天未跟进且最后跟进时间非空的客户', async () => {
    const { countSql } = await run({ overdue_follow: true });

    expect(countSql).toContain('c.last_follow_time IS NOT NULL');
    expect(countSql).toContain('DATEDIFF(NOW(), c.last_follow_time) > 7');
  });

  it('overdue 使用配置的逾期天数阈值', async () => {
    const { countSql, countParams } = await run({ overdue: true });

    expect(countSql).toContain('DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) >= ?');
    expect(countParams).toContain(15);
  });

  it('日期边界只取 YYYY-MM-DD，避免 Joi isoDate 归一化后拼出非法 DATETIME', async () => {
    const { countParams } = await run({
      start_date: '2026-01-01T00:00:00.000Z',
      end_date: '2026-12-31T00:00:00.000Z'
    });

    expect(countParams).toContain('2026-01-01');
    expect(countParams).toContain('2026-12-31 23:59:59');
  });

  it('非法状态显式报错，不静默返回全量', async () => {
    const pool = makePool();

    await expect(customerService.listFormalCustomers(pool, { business_status: 'not-a-status' }, null))
      .rejects.toMatchObject({ code: 400001 });
    expect(pool.query).not.toHaveBeenCalled();
  });
});
