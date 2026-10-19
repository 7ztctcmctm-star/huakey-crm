/**
 * customerDetailService.getCustomer360 金额汇总精度（P1-1）
 *
 * 原实现 `reduce((sum, x) => sum + parseFloat(x.amount), 0)`：逐条 parseFloat 累加会把
 * 浮点尾数累积放大（0.1 + 0.2 型误差）。改走 money.sum 一次性精确求和。
 */

const customerDetailService = require('../../services/customerDetailService');

/**
 * getCustomer360 共 10 条查询（1 条客户 + Promise.all 的 9 条），按 SQL 特征派发
 */
function makePool(rows) {
  const query = jest.fn(async (sql) => {
    const s = String(sql).replace(/\s+/g, ' ');
    if (s.includes('FROM crm_customer c')) return [[{ id: 1, company_name: '甲公司' }]];
    if (s.includes('FROM crm_contact')) return [rows.contacts || []];
    if (s.includes('FROM crm_tag t')) return [rows.tags || []];
    if (s.includes('FROM crm_follow_up f')) return [rows.followRecords || []];
    if (s.includes('FROM crm_opportunity o')) return [rows.opportunities || []];
    if (s.includes('FROM crm_quote q')) return [rows.quotes || []];
    if (s.includes('FROM crm_contract ct')) return [rows.contracts || []];
    if (s.includes('FROM crm_payment p')) return [rows.payments || []];
    if (s.includes('FROM crm_service_order s')) return [rows.serviceOrders || []];
    if (s.includes('FROM crm_customer_score_log l')) return [rows.scoreLogs || []];
    return [[], []];
  });
  return { query };
}

describe('customerDetailService.getCustomer360 金额汇总', () => {
  beforeEach(() => jest.clearAllMocks());

  it('商机金额精确求和：0.10 + 0.20 应为 0.3（原生浮点会算成 0.30000000000000004）', async () => {
    // 缺陷前提
    expect(0.1 + 0.2).toBe(0.30000000000000004);

    const pool = makePool({
      opportunities: [{ id: 1, expected_amount: '0.10' }, { id: 2, expected_amount: '0.20' }]
    });
    const res = await customerDetailService.getCustomer360(pool, 1);

    expect(res.stats.opportunity_amount).toBe(0.3);
  });

  it('报价金额取 final_amount 优先，缺失时回退 amount，且精确求和', async () => {
    const pool = makePool({
      quotes: [
        { id: 1, amount: '100.00', final_amount: '90.10' },
        { id: 2, amount: '0.20', final_amount: null }
      ]
    });
    const res = await customerDetailService.getCustomer360(pool, 1);

    expect(res.stats.quote_amount).toBe(90.3);
  });

  it('合同金额与已回款金额都走精确求和（含 0.1+0.2 型）', async () => {
    const pool = makePool({
      contracts: [{ id: 1, amount: '1000.10' }, { id: 2, amount: '2000.20' }],
      payments: [{ id: 1, pay_amount: '0.10' }, { id: 2, pay_amount: '0.20' }]
    });
    const res = await customerDetailService.getCustomer360(pool, 1);

    expect(res.stats.contract_amount).toBe(3000.3);
    expect(res.stats.paid_amount).toBe(0.3);
  });

  it('空集合汇总为 0（不产生 NaN）', async () => {
    const pool = makePool({});
    const res = await customerDetailService.getCustomer360(pool, 1);

    expect(res.stats.opportunity_amount).toBe(0);
    expect(res.stats.quote_amount).toBe(0);
    expect(res.stats.contract_amount).toBe(0);
    expect(res.stats.paid_amount).toBe(0);
  });
});
