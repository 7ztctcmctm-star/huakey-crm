/**
 * [V1.1 §11.3 / 2026-10-26] 客户导出范围与正式客户列表一致
 *
 * 背景：exportCustomers 未传 status 时只过滤 deleted_at，导出把
 * lead（潜客池）与 owner_id IS NULL（公海）客户一并带出；显式传 status
 * 时又漏掉 deleted_at（软删除客户被导出）。本测试锁定 SQL 口径。
 */

const customerDetailService = require('../../services/customerDetailService');

function makePool() {
  return { query: jest.fn().mockResolvedValue([[]]) };
}

async function exportSql(filters) {
  const pool = makePool();
  await customerDetailService.exportCustomers(pool, filters, { clause: '1=1', params: [] });
  const [sql, params] = pool.query.mock.calls[0];
  return { sql, params };
}

describe('[V1.1 §11.3] exportCustomers 范围', () => {
  it('未传 status：默认只导出正式客户（排除 lead/公海）', async () => {
    const { sql, params } = await exportSql({});

    expect(sql).toContain('c.status IN (?,?,?,?,?,?)');
    expect(sql).toContain('c.owner_id IS NOT NULL');
    expect(sql).toContain('c.deleted_at IS NULL');
    expect(params.slice(0, 6)).toEqual([
      'following', 'quoted', 'negotiating', 'signed', 'lost', 'paused'
    ]);
  });

  it('显式传 status：仍排除软删除客户', async () => {
    const { sql, params } = await exportSql({ status: 'signed' });

    expect(sql).toContain('c.status = ?');
    expect(sql).toContain('c.deleted_at IS NULL');
    expect(params).toContain('signed');
  });
});
