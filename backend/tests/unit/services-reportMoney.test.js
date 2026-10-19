/**
 * reportAnalyticsService 金额/比率计算精度（P1-1）
 *
 * 覆盖 4 处：
 *   1) getPaymentStats      —— 逾期金额 toFixed(2) 的浮点舍入
 *   2) getFinanceReport     —— 利润（减法）与回款率（浮点除法 + Math.round）
 *   3) getBusinessDashboard —— 经营看板回款率
 *   4) getAnalyticsPaymentCollection —— 未收金额与回款率（保留 1 位）
 */

// getOverdueCustomers 会读 sys_config（getOverdueDays）→ mock 掉，避免真连库
jest.mock('../../utils/config', () => ({
  getOverdueDays: jest.fn().mockResolvedValue(15)
}));

const svc = require('../../services/reportAnalyticsService');

const ALL = { type: 'all', ownerColumn: 'create_by', module: 'report' };

/** 前 N 条查询按序返回给定行，其余返回通用行 */
function makeIndexedPool(rows) {
  let i = 0;
  const generic = { amount: '0.00', count: 0, total: '0.00', plan_amount: '0.00', pay_amount: '0.00' };
  const query = jest.fn(async () => {
    const idx = i++;
    if (idx < rows.length) return [[rows[idx]], []];
    return [[generic], []];
  });
  return { query };
}

describe('reportAnalyticsService 金额精度', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getPaymentStats 逾期金额（:243）', () => {
    it('X.XX5 边界应进位：1000.005 → "1000.01"（原生 toFixed 会算成 "1000.00"）', async () => {
      // 缺陷前提：双精度下 1000.005 略小于真值
      expect((1000.005).toFixed(2)).toBe('1000.00');

      let i = 0;
      const values = ['8000.00', '2300.00', '1000.005'];
      const pool = { query: jest.fn(async () => [[{ amount: values[i++] }], []]) };

      const res = await svc.getPaymentStats(pool, {}, ALL);

      expect(res.overdue_amount).toBe('1000.01');
      expect(res.plan_amount).toBe('8000.00');
      expect(res.pay_amount).toBe('2300.00');
    });

    it('空结果（SUM 为 NULL）时逾期为 0.00，不产生 NaN', async () => {
      let i = 0;
      const values = ['0.00', '0.00', null];
      const pool = { query: jest.fn(async () => [[{ amount: values[i++] }], []]) };

      const res = await svc.getPaymentStats(pool, {}, ALL);

      expect(res.overdue_amount).toBe('0.00');
    });
  });

  describe('getFinanceReport 利润与回款率（:574-577）', () => {
    const build = () => makeIndexedPool([
      { total: '1000.00' }, // month contract
      { total: '1500.00' }, // quarter contract
      { total: '2000.00' }, // year contract
      { total: '575.00' },  // month payment
      { total: '800.00' },  // quarter payment
      { total: '1150.00' }, // year payment
      { total: '100.00' },  // month purchase
      { total: '200.00' },  // quarter purchase
      { total: '300.00' }   // year purchase
    ]);

    it('回款率 1150/2000 = 57.5% 应进位到 58（原生 Math.round 会算成 57）', async () => {
      // 缺陷前提
      expect(1150 / 2000 * 100).toBe(57.49999999999999);
      expect(Math.round(1150 / 2000 * 100)).toBe(57);

      const res = await svc.getFinanceReport(build(), {}, ALL);

      expect(res.overview.payment_rate).toBe(58);
    });

    it('利润走精确减法：年 2000 - 300 = 1700', async () => {
      const res = await svc.getFinanceReport(build(), {}, ALL);

      expect(res.overview.year.contract).toBe(2000);
      expect(res.overview.year.purchase).toBe(300);
      expect(res.overview.year.profit).toBe(1700);
      expect(res.overview.month.profit).toBe(900);
      expect(res.overview.quarter.profit).toBe(1300);
    });

    it('合同额为 0 时回款率为 0（无基数，不是 NaN）', async () => {
      const res = await svc.getFinanceReport(makeIndexedPool([
        { total: '0.00' }, { total: '0.00' }, { total: '0.00' },
        { total: '0.00' }, { total: '0.00' }, { total: '0.00' },
        { total: '0.00' }, { total: '0.00' }, { total: '0.00' }
      ]), {}, ALL);

      expect(res.overview.payment_rate).toBe(0);
      expect(res.overview.year.profit).toBe(0);
    });
  });

  describe('getBusinessDashboard 回款率（:770）', () => {
    it('回款率 1150/2000 = 57.5% 应进位到 58（原生算法为 57）', async () => {
      expect(Math.round(1150 / 2000 * 100)).toBe(57);

      const res = await svc.getBusinessDashboard(makeIndexedPool([
        { cnt: 10 },             // customerTotal
        { cnt: 2 },              // customerNew
        { total: '2000.00' },    // contractTotal
        { total: '1150.00' },    // paymentTotal
        { cnt: 4 },              // contractCount
        { cnt: 10 },             // oppTotal
        { cnt: 3 },              // oppWon
        { cnt: 1 },              // lastCustomerNew
        { total: '1500.00' }     // lastContractTotal
      ]), ALL);

      expect(res.kpi.payment_rate).toBe(58);
      expect(res.kpi.contract_amount).toBe(2000);
    });
  });

  describe('getAnalyticsPaymentCollection 未收金额与回款率（:989）', () => {
    const makePool = (plan, pay) => {
      let i = 0;
      const values = [plan, pay, '0.00'];
      return { query: jest.fn(async () => [[{ amount: values[i++] }], []]) };
    };

    it('回款率 2300/8000 保留 1 位应为 "28.8"（原生 toFixed 会算成 "28.7"）', async () => {
      // 缺陷前提
      expect((2300 / 8000 * 100).toFixed(1)).toBe('28.7');

      const res = await svc.getAnalyticsPaymentCollection(makePool('8000.00', '2300.00'), {}, ALL);

      expect(res.collection_rate).toBe('28.8');
    });

    it('未收金额走精确减法：8000.00 - 2300.00 = 5700.00', async () => {
      const res = await svc.getAnalyticsPaymentCollection(makePool('8000.00', '2300.00'), {}, ALL);

      expect(res.outstanding_amount).toBe('5700.00');
      expect(res.receivable_amount).toBe('8000.00');
      expect(res.received_amount).toBe('2300.00');
    });

    it('回款超过应收时未收金额夹到 0（不为负）', async () => {
      const res = await svc.getAnalyticsPaymentCollection(makePool('1000.00', '1200.00'), {}, ALL);

      expect(res.outstanding_amount).toBe('0.00');
      expect(res.collection_rate).toBe('120.0');
    });

    it('无应收基数时回款率为 0（不产生 NaN / Infinity）', async () => {
      const res = await svc.getAnalyticsPaymentCollection(makePool('0.00', '0.00'), {}, ALL);

      expect(res.collection_rate).toBe(0);
      expect(res.outstanding_amount).toBe('0.00');
    });
  });
});
