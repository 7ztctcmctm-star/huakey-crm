/**
 * hrService.calculateCommission 佣金金额精度（P1-1）
 *
 * 原实现 `baseAmount * rate / 100`：浮点尾数会直接写进 DECIMAL(15,2)
 * （MySQL 只按 2 位四舍五入，无法纠正已偏掉的尾数）。佣金按「分」结算，差 1 分就是错账。
 */

const hrService = require('../../services/hrService');

/**
 * 按 SQL 特征派发的 mock pool（比按调用顺序 mock 更抗重构）
 */
function makePool({ contractTotal, userRate = 15, ruleRate = null }) {
  const insertParams = [];
  const query = jest.fn(async (sql, params) => {
    const s = String(sql).replace(/\s+/g, ' ');
    if (s.includes('crm_commission_rule')) {
      // 无默认规则时返回空行 → 回退到 user.salary_commission_rate
      return ruleRate === null ? [[]] : [[{ id: 9, config: JSON.stringify({ rate: ruleRate }) }]];
    }
    if (s.includes('FROM sys_user u')) {
      return [[{ id: 1, real_name: '张三', salary_commission_rate: userRate, salary_base: 0 }]];
    }
    if (s.includes('SUM(p.pay_amount)')) {
      return [[{ total: '0.00' }]];
    }
    if (s.includes('FROM crm_contract WHERE create_by')) {
      return [[{ total: contractTotal }]];
    }
    // INSERT IGNORE INTO crm_commission_record
    insertParams.push(params);
    return [{ affectedRows: 1 }];
  });
  return { pool: { query }, insertParams };
}

describe('hrService.calculateCommission 佣金金额', () => {
  beforeEach(() => jest.clearAllMocks());

  it('提成走 money.percentOf：1336.70 × 15% 应为 200.51（原生浮点会算成 200.50）', async () => {
    // 缺陷前提：原生写法在写入 DECIMAL 前就是 200.50
    expect(Number((1336.70 * 15 / 100).toFixed(2))).toBe(200.5);

    const { pool, insertParams } = makePool({ contractTotal: '1336.70' });
    const res = await hrService.calculateCommission(pool, { period: '2026-10' });

    expect(res.results).toHaveLength(1);
    expect(res.results[0].commission_amount).toBe(200.51);
    expect(res.results[0].base_amount).toBe(1336.7);
    // 落库的必须是精确值，不能是浮点尾数
    expect(insertParams[0][6]).toBe(200.51);
  });

  it('用户未设提成率时回退到默认规则 config.rate，同样走精确计算', async () => {
    const { pool } = makePool({ contractTotal: '1336.70', userRate: 0, ruleRate: 15 });
    const res = await hrService.calculateCommission(pool, { period: '2026-10' });

    expect(res.results[0].rate).toBe(15);
    expect(res.results[0].commission_amount).toBe(200.51);
  });

  it('0.1 + 0.2 型：base 为 0.30、rate 10% 应得 0.03（不是 0.030000000000000002）', async () => {
    const { pool } = makePool({ contractTotal: '0.30', userRate: 10 });
    const res = await hrService.calculateCommission(pool, { period: '2026-10' });

    expect(res.results[0].commission_amount).toBe(0.03);
    expect(Number.isInteger(Math.round(res.results[0].commission_amount * 100))).toBe(true);
  });

  it('合同额与回款额都为 0 时跳过，不写佣金记录', async () => {
    const { pool, insertParams } = makePool({ contractTotal: '0.00' });
    const res = await hrService.calculateCommission(pool, { period: '2026-10' });

    expect(res.results).toHaveLength(0);
    expect(insertParams).toHaveLength(0);
  });
});
