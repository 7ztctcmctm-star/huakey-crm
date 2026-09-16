/**
 * 客户域受控写入口单测（R-06 边界收敛）
 *
 * 目标：证明 automationService 的 4 处直接写已收敛到客户域受控入口，且**行为逐字不变**。
 * 其中「行为等价」用原先的内联 CASE 作为参照实现，逐状态对比。
 */

const customerService = require('../../services/customerService');
const { BUSINESS_STATUS } = require('../../constants/poolStatus');

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

/** 改动前 automationService 内的内联 CASE 语义（参照实现） */
function legacyCaseMapping(value) {
  switch (value) {
    case 'lead': return 'lead';
    case 'quoted': return 'quoted';
    case 'negotiating': return 'negotiating';
    case 'signed': return 'signed';
    case 'lost': return 'lost';
    default: return 'following';
  }
}

describe('customerService.systemAssignOwner（系统级归属变更）', () => {
  it('SQL 与参数与改动前完全一致', async () => {
    const pool = makePool();
    const r = await customerService.systemAssignOwner(pool, 100, 7);
    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0].sql).toBe('UPDATE crm_customer SET owner_id = ? WHERE id = ?');
    expect(pool.calls[0].params).toEqual([7, 100]);
    expect(r.affectedRows).toBe(1);
  });

  it('不做额外副作用（不写 pool_status / 不写 assign_log）——与 assignCustomer 区分', async () => {
    const pool = makePool();
    await customerService.systemAssignOwner(pool, 100, 7);
    const allSql = pool.calls.map((c) => c.sql).join(' | ');
    expect(allSql).not.toMatch(/pool_status/);
    expect(allSql).not.toMatch(/crm_assign_log/);
  });
});

describe('customerService.systemUpdateField（系统级字段更新）', () => {
  it('白名单外的字段抛错（含错误码），且不执行任何 SQL', async () => {
    const pool = makePool();
    await expect(customerService.systemUpdateField(pool, 100, 'owner_id', 9))
      .rejects.toMatchObject({ code: 'FIELD_NOT_ALLOWED' });
    expect(pool.calls).toHaveLength(0);
  });

  it('非 status 字段：只发一条 UPDATE，不同步 business_status', async () => {
    const pool = makePool();
    await customerService.systemUpdateField(pool, 100, 'level', 'A');
    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0].sql).toBe('UPDATE crm_customer SET level = ? WHERE id = ?');
    expect(pool.calls[0].params).toEqual(['A', 100]);
  });

  it('status 字段：第二条 SQL 同步 business_status', async () => {
    const pool = makePool();
    await customerService.systemUpdateField(pool, 100, 'status', 'negotiating');
    expect(pool.calls).toHaveLength(2);
    expect(pool.calls[1].sql).toBe('UPDATE crm_customer SET business_status = ? WHERE id = ?');
    expect(pool.calls[1].params).toEqual(['negotiating', 100]);
  });

  describe('★ 行为等价性：与改动前的内联 CASE 逐状态一致', () => {
    const cases = [
      'lead', 'following', 'quoted', 'negotiating', 'signed', 'lost',
      // sea / paused 是 status 的合法值（097 迁移后），原 CASE 落入 ELSE → following
      'sea', 'paused',
      // 非法/未知值：原 CASE 同样落入 ELSE → following
      'unknown_value', '', null, undefined
    ];

    it.each(cases)('status=%p 时 business_status 与原实现一致', async (value) => {
      const pool = makePool();
      await customerService.systemUpdateField(pool, 100, 'status', value);
      const written = pool.calls[1]?.params?.[0];
      expect(written).toBe(legacyCaseMapping(value));
    });
  });

  it('白名单与原 automationService 的 ALLOWED_FIELDS 逐字一致', () => {
    expect(customerService.SYSTEM_UPDATABLE_FIELDS)
      .toEqual(['level', 'status', 'industry', 'source', 'assignee', 'lifecycle_status', 'remark']);
  });
});

describe('automationService 已完成边界收敛', () => {
  it('源码中不再直接写 crm_customer', () => {
    const fs = require('fs');
    const path = require('path');
    const raw = fs.readFileSync(path.join(__dirname, '../../services/automationService.js'), 'utf8');
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n');
    expect(code).not.toMatch(/(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+[`'"]?crm_customer/i);
    // 且确实改用了客户域受控入口
    expect(code).toMatch(/customerService\.systemAssignOwner/);
    expect(code).toMatch(/customerService\.systemUpdateField/);
    // 内联的状态映射已移除（单一来源）
    expect(code).not.toMatch(/business_status = CASE/);
  });

  it('BUSINESS_STATUS.FOLLOWING 常量可用（映射回退值）', () => {
    expect(BUSINESS_STATUS.FOLLOWING).toBe('following');
  });
});
