/**
 * C3 删除逻辑治理 —— scoringRouteService 评分日志软删（迁移 124）
 * 覆盖：重算由「DELETE 清表」改为「UPDATE 软删旧行」（经 calculateScore 端到端驱动，
 *       saveScoreResult 是内部函数不单独导出）；软删条件带 deleted_at IS NULL；
 *       无命中规则时只软删不 INSERT；读取侧（getCustomerScore）过滤 deleted_at IS NULL；
 *       客户不存在仍抛 CUSTOMER_NOT_FOUND。
 * customerService.systemUpdateScore 经 jest.mock 隔离（R-06 受控入口）。
 */
jest.mock('../../services/customerService', () => ({
  systemUpdateScore: jest.fn().mockResolvedValue(undefined)
}));

const scoringService = require('../../services/scoringRouteService');
const customerService = require('../../services/customerService');

// 一条必然命中的规则：followup_count(5) gt 0（matchRules 仅支持 eq/gt/lt/contains）
const HIT_RULE = { id: 10, name: '近期活跃', condition_type: 'followup', condition_field: 'followup_count', condition_operator: 'gt', condition_value: '0', score: 30, status: 1 };

function makePool(overrides = {}) {
  const calls = [];
  const pool = {
    query: jest.fn(async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('FROM crm_customer WHERE')) return overrides.customer !== undefined ? overrides.customer : [[{ id: 3, company_name: 'ACME', source: 'web', score: 0 }]];
      if (sql.startsWith('UPDATE crm_customer_score_log SET deleted_at')) return [{ affectedRows: 2 }];
      if (sql.startsWith('INSERT INTO crm_customer_score_log')) return [{ affectedRows: 1 }];
      if (sql.includes('FROM crm_score_rule WHERE status')) return overrides.rules !== undefined ? overrides.rules : [[HIT_RULE]];
      if (sql.includes('FROM crm_customer_score_log l')) return overrides.logs || [[]];
      if (sql.includes('DATEDIFF')) return overrides.stats !== undefined ? overrides.stats : [[{ followup_count: 5, quote_count: 1, contract_count: 0, last_followup_days: 3 }]];
      throw new Error('unexpected SQL: ' + sql.slice(0, 80));
    })
  };
  return { pool, calls };
}

describe('C3 评分重算软删（迁移 124，经 calculateScore 端到端驱动）', () => {
  beforeEach(() => jest.clearAllMocks());

  it('命中规则：旧行 UPDATE 软删（非 DELETE），新行 INSERT，客户分数经 R-06 入口更新', async () => {
    const { pool, calls } = makePool();
    const r = await scoringService.calculateScore(pool, 3);

    expect(r).toEqual({ customer_id: 3, score: 30, matched_rules: ['近期活跃'] });

    const soft = calls.find(c => c.sql.startsWith('UPDATE crm_customer_score_log SET deleted_at'));
    expect(soft).toBeDefined();
    expect(soft.sql).toContain('WHERE customer_id = ? AND deleted_at IS NULL');
    expect(soft.params).toEqual([3]);
    // 关键断言：整个写路径没有任何 DELETE FROM crm_customer_score_log
    expect(calls.some(c => c.sql.includes('DELETE FROM crm_customer_score_log'))).toBe(false);

    const ins = calls.find(c => c.sql.startsWith('INSERT INTO crm_customer_score_log'));
    expect(ins).toBeDefined();
    expect(ins.params[0]).toEqual([[3, 10, 30, 30, '规则"近期活跃"命中']]);

    expect(customerService.systemUpdateScore).toHaveBeenCalledWith(pool, 3, 30);
  });

  it('无命中规则：只软删旧行、不 INSERT（不再「清表后空窗」）', async () => {
    const { pool, calls } = makePool({ rules: [[]] });
    const r = await scoringService.calculateScore(pool, 3);
    expect(r.score).toBe(0);
    expect(r.matched_rules).toEqual([]);
    expect(calls.some(c => c.sql.startsWith('UPDATE crm_customer_score_log SET deleted_at'))).toBe(true);
    expect(calls.some(c => c.sql.startsWith('INSERT INTO crm_customer_score_log'))).toBe(false);
    // 0 分也走受控入口（与原行为一致）
    expect(customerService.systemUpdateScore).toHaveBeenCalledWith(pool, 3, 0);
  });

  it('连续两次重算：每次软删都带 deleted_at IS NULL，不会把上一轮新插入的行又软删掉', async () => {
    const { pool, calls } = makePool();
    await scoringService.calculateScore(pool, 3);
    await scoringService.calculateScore(pool, 3);
    const softs = calls.filter(c => c.sql.startsWith('UPDATE crm_customer_score_log SET deleted_at'));
    expect(softs).toHaveLength(2);
    softs.forEach(s => expect(s.sql).toContain('deleted_at IS NULL'));
    expect(calls.filter(c => c.sql.startsWith('INSERT INTO crm_customer_score_log'))).toHaveLength(2);
  });
});

describe('C3 getCustomerScore 读取过滤', () => {
  beforeEach(() => jest.clearAllMocks());

  it('评分历史查询带 AND l.deleted_at IS NULL（软删行不可见）', async () => {
    const { pool, calls } = makePool({
      logs: [[{ id: 1, customer_id: 3, rule_id: 10, score: 30, total_score: 50, remark: 'x', create_time: '2026-10-22', rule_name: '近期活跃', condition_type: 'followup' }]]
    });
    const r = await scoringService.getCustomerScore(pool, 3);
    const logSql = calls.find(c => c.sql.includes('FROM crm_customer_score_log l'));
    expect(logSql.sql).toContain('l.deleted_at IS NULL');
    expect(r.logs).toHaveLength(1);
  });

  it('客户不存在（含已软删客户）→ CUSTOMER_NOT_FOUND', async () => {
    const { pool } = makePool({ customer: [[]] });
    await expect(scoringService.getCustomerScore(pool, 404))
      .rejects.toMatchObject({ httpStatus: 404, message: '客户不存在' });
  });
});
