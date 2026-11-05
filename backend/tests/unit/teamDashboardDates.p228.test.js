/**
 * [V1.1 §11.3 / 2026-10-26] 团队看板日期参数真正落到聚合 SQL
 *
 * 背景：前端 TeamDashboard 取 dateRange 传给 API，但 api/system.js 的函数
 * 无参数签名（参数被丢弃）、后端 sales-breakdown 也不读 req.query，
 * service 合同/回款/目标全部写死“当前月”⇒ 日期选择器完全无效。
 * 本测试锁定 service 侧按区间过滤；路由层透传由 routes/teamDashboard.js 保证。
 */

jest.mock('../../utils/config', () => ({
  getOverdueDays: jest.fn(async () => 15),
  getConfig: jest.fn(async () => null)
}));

const teamDashboardService = require('../../services/teamDashboardService');

function makePool() {
  return {
    query: jest.fn(async (sql) => {
      if (sql.includes('FROM sys_user u')) {
        return [[{ id: 7, real_name: '销售A', username: 'sales01', dept_name: '销售部' }]];
      }
      if (sql.includes('as customer_count')) {
        return [[{
          user_id: 7, customer_count: 1, active_opp_count: 0,
          active_opp_amount: 0, contract_amount: 100, payment_amount: 50,
          no_follow_count: 0
        }]];
      }
      if (sql.includes('crm_sales_target t')) {
        return [[{ user_id: 7, total: 200 }]];
      }
      return [[]];
    })
  };
}

describe('[V1.1 §11.3] getSalesBreakdown 日期区间', () => {
  it('合同/回款/目标都按 startDate~endDate 过滤', async () => {
    const pool = makePool();
    await teamDashboardService.getSalesBreakdown(pool, {
      userId: 7, isBoss: true, startDate: '2026-01-01', endDate: '2026-01-31'
    });

    const aggCall = pool.query.mock.calls.find(([sql]) => sql.includes('as customer_count'));
    expect(aggCall[0]).toContain('ct.create_time >= ?');
    expect(aggCall[0]).toContain('p.pay_date >= ?');
    expect(aggCall[1]).toEqual(expect.arrayContaining([
      '2026-01-01', '2026-01-31 23:59:59'
    ]));

    const targetCall = pool.query.mock.calls.find(([sql]) => sql.includes('crm_sales_target t'));
    expect(targetCall[0]).toContain('BETWEEN ? AND ?');
    expect(targetCall[1]).toEqual(expect.arrayContaining([202601, 202601]));
  });

  it('未传日期时保持当前月口径', async () => {
    const pool = makePool();
    await teamDashboardService.getSalesBreakdown(pool, { userId: 7, isBoss: true });

    const aggCall = pool.query.mock.calls.find(([sql]) => sql.includes('as customer_count'));
    expect(aggCall[0]).toContain("DATE_FORMAT(NOW(), '%Y-%m-01')");
    expect(aggCall[0]).not.toContain('ct.create_time >= ?');
  });
});
