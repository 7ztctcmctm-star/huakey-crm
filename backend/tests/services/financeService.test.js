/**
 * financeService.getAnalysis 单元测试（2026-10-15 · money.js 收敛回归）
 *
 * 覆盖本回合新改逻辑：
 *   1) aging 分桶 + money.sum 精确累加（原 += 浮点累加会漂移，如 0.1+0.2）
 *   2) profit 的 money.sub 精确差额与毛利率
 *   3) cashFlow 的 money.round2 转换
 */

const financeService = require('../../services/financeService');

function mockAnalysisPool({ income, cost, receivables, cashIn, cashOut, avgDays }) {
  return {
    query: jest.fn()
      .mockResolvedValueOnce([[{ total: income }]])      // 1. income (合同额 SUM)
      .mockResolvedValueOnce([[{ total: cost }]])        // 2. cost (采购额 SUM)
      .mockResolvedValueOnce([[]])                        // 3. costStructure
      .mockResolvedValueOnce([receivables])               // 4. receivables (账龄)
      .mockResolvedValueOnce([cashIn])                    // 5. cashIn
      .mockResolvedValueOnce([cashOut])                   // 6. cashOut
      .mockResolvedValueOnce([[{ avg_days: avgDays }]])   // 7. paymentCycle
      .mockResolvedValueOnce([[]])                        // 8. collectionTrend
  };
}

describe('financeService.getAnalysis', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('aging 应按账龄分桶且金额精确累加（0.1+0.2 不得出现浮点尾数）', async () => {
    const pool = mockAnalysisPool({
      income: '100.00', cost: '40.00',
      receivables: [
        { id: 1, amount: '0.10', paid: '0.00', age_days: 10 },   // → 0-30
        { id: 2, amount: '0.10', paid: '0.00', age_days: 5 },    // → 0-30（两笔 0.1 陷阱）
        { id: 3, amount: '0.20', paid: '0.00', age_days: 45 },   // → 31-60
        { id: 4, amount: '30.00', paid: '10.00', age_days: 200 } // → 90+（未回 20）
      ],
      cashIn: [{ month: '2026-01', amount: '50.00' }],
      cashOut: [{ month: '2026-01', amount: '20.00' }],
      avgDays: 15
    });

    const result = await financeService.getAnalysis(pool, {});
    const aging = Object.fromEntries(result.aging.map(a => [a.label, a.amount]));

    expect(aging['0-30']).toBe(0.2);   // 精确 0.2，而非 0.30000000000000004 之类
    expect(String(aging['0-30'])).toBe('0.2');
    expect(aging['31-60']).toBe(0.2);
    expect(aging['61-90']).toBe(0);
    expect(aging['90+']).toBe(20);     // money.sub('30.00','10.00')
  });

  it('profit 应使用 money.sub 精确差额，毛利率按百分比取值', async () => {
    const pool = mockAnalysisPool({
      income: '100.01', cost: '0.01',
      receivables: [],
      cashIn: [], cashOut: [], avgDays: null
    });

    const result = await financeService.getAnalysis(pool, {});

    expect(result.profit.income).toBe(100.01);
    expect(result.profit.cost).toBe(0.01);
    expect(result.profit.gross_profit).toBe(100);   // 精确减法，无 99.99999999999999
    expect(result.profit.gross_margin).toBe(100);   // (100/100.01*100).toFixed(1) ≈ 100.0
  });

  it('cashFlow 应合并流入流出并按月排序（money.round2 转换）', async () => {
    const pool = mockAnalysisPool({
      income: '0', cost: '0',
      receivables: [],
      cashIn: [
        { month: '2026-02', amount: '12.34' },
        { month: '2026-01', amount: '56.78' }
      ],
      cashOut: [
        { month: '2026-01', amount: '9.99' },
        { month: '2026-03', amount: '1.00' }
      ],
      avgDays: 30
    });

    const result = await financeService.getAnalysis(pool, {});

    expect(result.cashFlow).toEqual([
      { month: '2026-01', inflow: 56.78, outflow: 9.99 },
      { month: '2026-02', inflow: 12.34, outflow: 0 },
      { month: '2026-03', inflow: 0, outflow: 1 }
    ]);
    expect(result.collection.avg_days).toBe(30);
  });
});
