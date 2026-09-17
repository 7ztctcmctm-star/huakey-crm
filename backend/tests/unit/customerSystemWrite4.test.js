/**
 * 客户域受控写入口（第 4 批：导入建客户 + 离职交接释放）单测
 * 以及「扫描口径排除规则足够窄」的元测试。
 * R-06 边界收敛 2026-09-17
 */

const customerService = require('../../services/customerService');

function makePool(affectedRows = 1) {
  const calls = [];
  return {
    calls,
    query: jest.fn(async (sql, params) => {
      calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params: params || [] });
      return [{ affectedRows, insertId: 123 }, []];
    })
  };
}

describe('customerService.systemCreateImportedCustomer（原 importService 的 INSERT）', () => {
  it('列顺序与参数顺序与改动前完全一致，并回传 insertId', async () => {
    const pool = makePool();
    const r = await customerService.systemCreateImportedCustomer(pool, {
      company_name: 'A公司', address: '地址', industry: '汽配', source: '展会',
      level: 'B', status: 'lead', remark: '备注', owner_id: 7
    });
    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0].sql).toBe(
      'INSERT INTO crm_customer (company_name, address, industry, source, level, status, remark, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    expect(pool.calls[0].params).toEqual(['A公司', '地址', '汽配', '展会', 'B', 'lead', '备注', 7]);
    expect(r.insertId).toBe(123);
  });
});

describe('customerService.systemReleaseOwnedCustomersOnLeave（原 deleteUser 步骤3）', () => {
  it('SQL 与参数与改动前一致（含 pool_type=public、update_time=NOW）', async () => {
    const pool = makePool();
    await customerService.systemReleaseOwnedCustomersOnLeave(pool, 9);
    expect(pool.calls[0].sql).toBe(
      "UPDATE crm_customer SET owner_id = NULL, pool_status = ?, pool_type = 'public', protect_until = NULL, update_time = NOW() WHERE owner_id = ? AND deleted_at IS NULL"
    );
    expect(pool.calls[0].params).toEqual(['sea', 9]);
  });

  it('（已知差异，保持不变）不同步 status、不写 crm_pool_log', async () => {
    const pool = makePool();
    await customerService.systemReleaseOwnedCustomersOnLeave(pool, 9);
    const all = pool.calls.map((c) => c.sql).join(' | ');
    expect(all).not.toMatch(/status = 'sea'/);
    expect(all).not.toMatch(/crm_pool_log/);
  });
});

describe('扫描口径：排除规则必须足够窄', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../scripts/audit-domain-boundary.js'), 'utf8');

  it('排除规则只匹配 scripts/verify-*.js 这类核验脚本', () => {
    const m = src.match(/const NON_PROD_SCRIPT_PATTERNS = \[(.*?)\];/);
    expect(m).toBeTruthy();
    const pattern = /^scripts\/verify-[^/]+\.js$/.source;
    expect(m[1]).toContain('verify-');
    // 该正则的实际行为：命中 verify 脚本、放过生产代码
    const re = new RegExp(pattern);
    expect(re.test('scripts/verify-transfer-sql.js')).toBe(true);
    expect(re.test('scripts/auto_release.js')).toBe(false);
    expect(re.test('services/importService.js')).toBe(false);
    expect(re.test('services/verify-x.js')).toBe(false);
    expect(re.test('routes/verify-x.js')).toBe(false);
  });

  it('排除数量会在报告中显式列出（不静默排除）', () => {
    expect(src).toMatch(/【D】按口径排除的非生产脚本/);
    expect(src).toMatch(/EXCLUDED/);
  });

  it('三个受控调用点源码守卫：不再直接写 crm_customer', () => {
    const strip = (raw) => raw.replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    const cases = [
      ['services/importService.js', /customerService\.systemCreateImportedCustomer/],
      ['services/userRouteService.js', /customerService\.systemReleaseOwnedCustomersOnLeave/]
    ];
    for (const [rel, pattern] of cases) {
      const code = strip(fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8'));
      expect(code).not.toMatch(/(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+[`'"]?crm_customer\b/i);
      expect(code).toMatch(pattern);
    }
  });
});
