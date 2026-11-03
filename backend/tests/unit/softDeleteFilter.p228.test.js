/**
 * P2-2 软删除过滤针对性测试（2026-11-03）
 *
 * 背景：统计/看板/分析类查询遗漏 deleted_at IS NULL，导致已软删数据
 * 计入正常业务视图（客户评分虚高、商机统计失真、采购统计含废单等）。
 *
 * 本套件断言：这些查询生成的 SQL 必须包含 deleted_at IS NULL 过滤
 * （含 JOIN 条件与子查询），防止回归。
 */

const analysisService = require('../../services/analysisService');
const teamDashboardService = require('../../services/teamDashboardService');
const purchaseService = require('../../services/purchaseService');
const reportAnalyticsService = require('../../services/reportAnalyticsService');
const dashboardService = require('../../services/dashboardService');
const targetService = require('../../services/targetService');
const supplierScoringService = require('../../services/supplierScoringService');
const emailService = require('../../services/emailService');
const financeService = require('../../services/financeService');

// teamDashboardService 内部经 getOverdueDays 直连真实 pool，必须 mock 掉
jest.mock('../../utils/config', () => ({
  getOverdueDays: jest.fn().mockResolvedValue(30),
  getConfig: jest.fn().mockResolvedValue('14')
}));

// 记录型 mock pool：每次 query 都记录 SQL 文本并返回可安全解构的通用行
function recordingPool(row = {}) {
  const queries = [];
  const pool = {
    query: jest.fn(async (sql) => {
      queries.push(String(sql));
      return [[{ ...row }], []];
    }),
    getConnection: jest.fn(async () => ({
      query: jest.fn(async (sql) => { queries.push(String(sql)); return [[{ ...row }], []]; }),
      release: jest.fn()
    }))
  };
  pool._queries = queries;
  return pool;
}

const dataPermission = { type: 'self', userId: 1, ownerColumn: 'create_by', module: 'analysis' };

function assertAllContain(queries, keyword) {
  const missing = queries.filter(q => !q.toLowerCase().includes(keyword.toLowerCase()));
  if (missing.length > 0) {
    throw new Error(`以下 ${missing.length} 条 SQL 缺少「${keyword}」：\n` + missing.join('\n---\n'));
  }
}

describe('P2-2 软删除过滤：analysisService', () => {
  it('getCustomerScore：跟进/商机查询必须过滤软删', async () => {
    const pool = recordingPool({ cnt: 0, amount: 0 });
    await analysisService.getCustomerScore(pool, 1, dataPermission);
    const biz = pool._queries; // 全部为业务查询
    expect(biz.some(q => q.includes('crm_follow_up'))).toBe(true);
    expect(biz.some(q => q.includes('crm_opportunity'))).toBe(true);
    assertAllContain(biz.filter(q => q.includes('crm_follow_up') || q.includes('crm_opportunity')), 'deleted_at IS NULL');
  });

  it('getWinRate：商机阶段统计必须过滤软删', async () => {
    const pool = recordingPool();
    await analysisService.getWinRate(pool, dataPermission);
    expect(pool._queries[0]).toContain('FROM crm_opportunity');
    expect(pool._queries[0]).toContain('deleted_at IS NULL');
  });

  it('getFunnel：销售漏斗必须过滤软删', async () => {
    const pool = recordingPool();
    await analysisService.getFunnel(pool, dataPermission);
    expect(pool._queries[0]).toContain('FROM crm_opportunity');
    expect(pool._queries[0]).toContain('deleted_at IS NULL');
  });

  it('getRFM：跟进频次子查询必须过滤软删', async () => {
    const pool = recordingPool();
    await analysisService.getRFM(pool, dataPermission);
    expect(pool._queries[0]).toContain('crm_follow_up');
    expect(pool._queries[0]).toContain('deleted_at IS NULL');
  });

  it('getRanking：商机 JOIN 必须过滤软删', async () => {
    const pool = recordingPool();
    await analysisService.getRanking(pool, dataPermission);
    expect(pool._queries[0]).toContain('JOIN crm_opportunity');
    expect(pool._queries[0]).toContain('o.deleted_at IS NULL');
  });
});

describe('P2-2 软删除过滤：teamDashboardService', () => {
  it('getOverview：活跃商机与目标统计必须过滤软删', async () => {
    const pool = recordingPool({ count: 0, total_amount: 0, total: 0, target_total: 0 });
    await teamDashboardService.getOverview(pool, { userId: 1, isBoss: true });
    const opp = pool._queries.filter(q => q.includes('crm_opportunity'));
    expect(opp.length).toBeGreaterThan(0);
    assertAllContain(opp, 'deleted_at IS NULL');
    const target = pool._queries.filter(q => q.includes('crm_sales_target'));
    expect(target.length).toBeGreaterThan(0);
    assertAllContain(target, 'deleted_at IS NULL');
  });

  it('getSalesBreakdown：商机/跟进/服务任务/目标统计必须过滤软删', async () => {
    const pool = recordingPool({ count: 0, cnt: 0, amount: 0, total: 0, user_id: 1, task_count: 0 });
    await teamDashboardService.getSalesBreakdown(pool, { userId: 1, isBoss: false, startDate: '2026-11-01', endDate: '2026-11-30' });
    const opp = pool._queries.filter(q => q.includes('crm_opportunity'));
    expect(opp.length).toBeGreaterThan(0);
    assertAllContain(opp, 'deleted_at IS NULL');
    const fu = pool._queries.filter(q => q.includes('crm_follow_up'));
    assertAllContain(fu, 'deleted_at IS NULL');
    const so = pool._queries.filter(q => q.includes('crm_service_order'));
    assertAllContain(so, 'deleted_at IS NULL');
    const st = pool._queries.filter(q => q.includes('crm_sales_target'));
    assertAllContain(st, 'deleted_at IS NULL');
  });
});

describe('P2-2 软删除过滤：purchaseService.getStatistics', () => {
  it('全部 6 条统计 SQL 必须过滤软删（含供应商 JOIN）', async () => {
    const pool = recordingPool({ cnt: 0, sum: 0, name: 'x', order_count: 0, total_spent: 0 });
    await purchaseService.getStatistics(pool);
    expect(pool._queries.length).toBe(6);
    assertAllContain(pool._queries, 'deleted_at IS NULL');
    const top = pool._queries.find(q => q.includes('crm_supplier'));
    expect(top).toContain('po.deleted_at IS NULL');
    expect(top).toContain('s.deleted_at IS NULL');
  });
});

// ==================== B1b 批量甄别修复（2026-11-03）====================

// type:'all' → buildDataPermissionWhere 直接返回 1=1，无 DB 调用
const allScope = { type: 'all', userId: 1 };

describe('P2-2 软删除过滤：reportAnalyticsService', () => {
  it('getCustomerStats：本月新增/等级分布等 4 条客户查询必须过滤软删', async () => {
    const pool = recordingPool({ count: 0 });
    await reportAnalyticsService.getCustomerStats(pool, {}, allScope);
    const cust = pool._queries.filter(q => q.includes('crm_customer'));
    expect(cust.length).toBeGreaterThanOrEqual(4);
    assertAllContain(cust, 'deleted_at IS NULL');
  });

  it('getPaymentStats：计划/实收/逾期（含 payment 子查询）必须过滤软删', async () => {
    const pool = recordingPool({ amount: '0' });
    await reportAnalyticsService.getPaymentStats(pool, {}, allScope);
    const pay = pool._queries.filter(q => q.includes('crm_payment'));
    expect(pay.length).toBe(3);
    assertAllContain(pay, 'deleted_at IS NULL');
  });

  it('getSalesTrend：合同趋势必须过滤软删', async () => {
    const pool = recordingPool();
    await reportAnalyticsService.getSalesTrend(pool, {}, allScope);
    expect(pool._queries[0]).toContain('FROM crm_contract c');
    expect(pool._queries[0]).toContain('c.deleted_at IS NULL');
  });

  it('getPerformance：主表 sys_user，合同/回款过滤必须放 JOIN ON', async () => {
    const pool = recordingPool();
    await reportAnalyticsService.getPerformance(pool, {}, allScope);
    const q = pool._queries[0];
    expect(q).toContain('JOIN crm_contract c ON u.id = c.create_by AND c.deleted_at IS NULL');
    expect(q).toContain('JOIN crm_payment p ON c.id = p.contract_id AND p.deleted_at IS NULL');
  });
});

describe('P2-2 软删除过滤：dashboardService.getQuickStats', () => {
  it('待回款（含已收子查询）必须过滤软删', async () => {
    const pool = recordingPool({ count: 0 });
    await dashboardService.getQuickStats(pool, allScope, {});
    const pp = pool._queries.filter(q => q.includes('crm_payment_plan'));
    expect(pp.length).toBeGreaterThan(0);
    assertAllContain(pp, 'pp.deleted_at IS NULL');
    expect(pp[0]).toContain('FROM crm_payment WHERE plan_id IS NOT NULL AND deleted_at IS NULL');
  });
});

describe('P2-2 软删除过滤：targetService.listTargets', () => {
  it('实际成交（crm_contract）与回款（crm_payment）必须过滤软删', async () => {
    const pool = recordingPool({ id: 1, user_id: 1, real_name: 'x', dept_name: 'y', target_amount: '100', actual_amount: '50', payment_amount: '30' });
    await targetService.listTargets(pool, { year: 2026, month: 11 });
    const con = pool._queries.filter(q => q.includes('crm_contract'));
    assertAllContain(con, 'deleted_at IS NULL');
    const pay = pool._queries.filter(q => q.includes('crm_payment'));
    assertAllContain(pay, 'p.deleted_at IS NULL');
  });
});

describe('P2-2 软删除过滤：supplierScoringService', () => {
  it('质量/交期/价格评分的采购单查询必须过滤软删；供应商清单同', async () => {
    const pool = recordingPool({ id: 1, total_qty: 10, qualified_qty: 10, total: 1, on_time: 1, avg_price: '1', market_avg: '1', service_score: 4, category: 'quality', weight: 1, min_score: 1, max_score: 5 });
    await supplierScoringService.checkAllSuppliersScores(pool);
    const po = pool._queries.filter(q => q.includes('crm_purchase_order'));
    expect(po.length).toBeGreaterThanOrEqual(4);
    assertAllContain(po, 'deleted_at IS NULL');
    const supplierList = pool._queries.find(q => q.includes('FROM crm_supplier WHERE status = 1'));
    expect(supplierList).toContain('deleted_at IS NULL');
  });
});

describe('P2-2 软删除过滤：purchaseService 列表/详情', () => {
  it('listPurchases：列表与计数 SQL 均必须过滤软删', async () => {
    const pool = recordingPool({ total: 0, id: 1 });
    await purchaseService.listPurchases(pool, { page: 1, pageSize: 10 });
    expect(pool._queries.length).toBe(2);
    assertAllContain(pool._queries, 'po.deleted_at IS NULL');
  });

  it('getPurchase：详情点查必须过滤软删', async () => {
    const queries = [];
    const pool = { query: jest.fn(async (sql) => { queries.push(String(sql)); return [[]]; }) };
    const result = await purchaseService.getPurchase(pool, 1);
    expect(result).toBeNull();
    expect(queries[0]).toContain('po.id = ? AND po.deleted_at IS NULL');
  });
});

describe('P2-2 软删除过滤：emailService.getEmailStats', () => {
  it('邮件账号子查询必须过滤软删', async () => {
    const pool = recordingPool({ total: 0, unread: 0, starred: 0, today_in: 0, today_out: 0, folder: 'inbox', count: 0 });
    await emailService.getEmailStats(pool, 1);
    assertAllContain(pool._queries, 'deleted_at IS NULL');
  });
});

describe('P2-2 软删除过滤：financeService.getReminders', () => {
  it('提醒列表与计数的合同/客户 JOIN 必须过滤软删', async () => {
    const pool = recordingPool({ total: 0, id: 1 });
    await financeService.getReminders(pool, { page: 1, pageSize: 10 });
    assertAllContain(pool._queries, 'deleted_at IS NULL');
  });
});
