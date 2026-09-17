/**
 * 客户域受控写入口（第 3 批：跟进派生状态）单测
 * R-06 边界收敛 2026-09-17 —— 目标同为「行为不变」
 */

const customerService = require('../../services/customerService');

function makePool() {
  const calls = [];
  return {
    calls,
    query: jest.fn(async (sql, params) => {
      calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params: params || [] });
      return [{ affectedRows: 1 }, []];
    })
  };
}

describe('customerService.systemApplyFollowUpEffect（原 addFollowUp 的复合派生状态更新）', () => {
  it('SQL 语义与改动前一致：last_follow_time=NOW + 跟进状态 + 生命周期两处 CASE', async () => {
    const pool = makePool();
    await customerService.systemApplyFollowUpEffect(pool, 100);
    expect(pool.calls).toHaveLength(1);
    const sql = pool.calls[0].sql;
    expect(sql).toContain('SET last_follow_time = NOW()');
    expect(sql).toContain("WHEN follow_status IS NULL OR follow_status = '初次联系' THEN '跟进中'");
    expect(sql).toContain("WHEN lifecycle_status = 'new' THEN 'nurturing'");
    expect(pool.calls[0].params).toEqual([100]);
  });
});

describe('customerService.systemTouchLastFollowTime（批量补录 / 完成计划）', () => {
  it('SQL 与参数与改动前一致', async () => {
    const pool = makePool();
    await customerService.systemTouchLastFollowTime(pool, 55);
    expect(pool.calls[0].sql).toBe('UPDATE crm_customer SET last_follow_time = NOW() WHERE id = ?');
    expect(pool.calls[0].params).toEqual([55]);
  });
});

describe('customerService.systemSetLastFollowTime（删除跟进后回退）', () => {
  it('传入时间 → 绑定值', async () => {
    const pool = makePool();
    await customerService.systemSetLastFollowTime(pool, 55, '2026-09-01 10:00:00');
    expect(pool.calls[0].sql).toBe('UPDATE crm_customer SET last_follow_time = ? WHERE id = ?');
    expect(pool.calls[0].params).toEqual(['2026-09-01 10:00:00', 55]);
  });

  it('传入 null / undefined → 置 NULL（无剩余跟进记录时的原行为）', async () => {
    for (const v of [null, undefined]) {
      const pool = makePool();
      await customerService.systemSetLastFollowTime(pool, 55, v);
      expect(pool.calls[0].params).toEqual([null, 55]);
    }
  });
});

describe('followUpService 已完成边界收敛', () => {
  const fs = require('fs');
  const path = require('path');

  it('源码不再直接写 crm_customer，且已改用三个受控入口', () => {
    const raw = fs.readFileSync(path.join(__dirname, '../../services/followUpService.js'), 'utf8');
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    expect(code).not.toMatch(/(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+[`'"]?crm_customer\b/i);
    expect(code).toMatch(/customerService\.systemApplyFollowUpEffect/);
    expect(code).toMatch(/customerService\.systemTouchLastFollowTime/);
    expect(code).toMatch(/customerService\.systemSetLastFollowTime/);
  });

  it('批量补录仍把事务连接透传给客户域（同事务保证不破）', () => {
    const raw = fs.readFileSync(path.join(__dirname, '../../services/followUpService.js'), 'utf8');
    expect(raw).toMatch(/systemTouchLastFollowTime\(connection,/);
  });
});
