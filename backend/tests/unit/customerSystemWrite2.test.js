/**
 * 客户域受控写入口（第 2 批）单测：评分写入 + 转移接收
 * R-06 边界收敛 2026-09-17 —— 目标同为「行为不变」
 */

const customerService = require('../../services/customerService');

function makePool(affectedRows = 1) {
  const calls = [];
  return {
    calls,
    query: jest.fn(async (sql, params) => {
      calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params: params || [] });
      return [{ affectedRows }, []];
    })
  };
}

describe('customerService.systemUpdateScore（原 scoringRouteService 写点）', () => {
  it('SQL 与参数与改动前完全一致', async () => {
    const pool = makePool();
    await customerService.systemUpdateScore(pool, 42, 88);
    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0].sql).toBe('UPDATE crm_customer SET score = ? WHERE id = ?');
    expect(pool.calls[0].params).toEqual([88, 42]);
  });
});

describe('customerService.systemAcceptTransfer（原 transferService.acceptTransfer 写点）', () => {
  it('SQL 与参数与改动前完全一致（含并发守卫 owner_id = fromUserId）', async () => {
    const pool = makePool();
    await customerService.systemAcceptTransfer(pool, 100, 7, 3);
    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0].sql).toBe(
      "UPDATE crm_customer SET owner_id = ?, pool_status = 'private', last_follow_time = NOW(), update_time = NOW() WHERE id = ? AND owner_id = ? AND deleted_at IS NULL"
    );
    expect(pool.calls[0].params).toEqual([7, 100, 3]);
  });

  it('守卫失效（期间被他人接手）时返回 affectedRows=0，由调用方回滚', async () => {
    const pool = makePool(0);
    const r = await customerService.systemAcceptTransfer(pool, 100, 7, 3);
    expect(r.affectedRows).toBe(0);
  });

  it('不做额外副作用（不清 protect_until、不写 assign_log）——与 assignCustomer 区分', async () => {
    const pool = makePool();
    await customerService.systemAcceptTransfer(pool, 100, 7, 3);
    const all = pool.calls.map((c) => c.sql).join(' | ');
    expect(all).not.toMatch(/protect_until/);
    expect(all).not.toMatch(/crm_assign_log/);
  });
});

describe('边界收敛后的源码守卫', () => {
  const fs = require('fs');
  const path = require('path');
  const strip = (raw) => raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

  it.each([
    ['services/scoringRouteService.js', /customerService\.systemUpdateScore/],
    ['services/transferService.js', /customerService\.systemAcceptTransfer/],
    ['scripts/auto_release.js', /poolService\.autoReleaseCustomers/]
  ])('%s 不再直接写 crm_customer，且已改用受控入口', (rel, expectPattern) => {
    const code = strip(fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8'));
    expect(code).not.toMatch(/(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+[`'"]?crm_customer\b/i);
    expect(code).toMatch(expectPattern);
  });

  it('auto_release.js 不再保留失效的 status != 0 选客条件与自建释放 SQL', () => {
    const code = strip(fs.readFileSync(path.join(__dirname, '../../scripts/auto_release.js'), 'utf8'));
    expect(code).not.toMatch(/status\s*!=\s*0/);
    expect(code).not.toMatch(/crm_pool_log/);
  });
});
