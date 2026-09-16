/**
 * 报表分析（客户域）数据范围单测
 *
 * 背景：routes/report/analytics.js 的 10 个客户域接口此前只有 checkPermission('dashboard')，
 * 服务函数不接收用户、SQL 无归属过滤 ⇒ 任何有 dashboard 权限者都看到全公司数据。
 * 本测试锁定：all 不加过滤；self 按各表归属列过滤当前用户；且服务源码不得再出现 roleId 硬编码判权。
 */

const fs = require('fs');
const path = require('path');

// getOverdueCustomers 会读 sys_config（getOverdueDays）→ mock 掉，避免真连库
jest.mock('../../utils/config', () => ({
  getOverdueDays: jest.fn().mockResolvedValue(15)
}));

const svc = require('../../services/reportAnalyticsService');

function makePool() {
  const calls = [];
  const query = jest.fn(async (sql, params) => {
    calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params: params || [] });
    return [[{ amount: '0.00', count: 0, total: 0, plan_amount: '0.00', pay_amount: '0.00' }], []];
  });
  return { calls, query };
}

const ALL = { type: 'all', ownerColumn: 'owner_id', module: 'report' };
const SELF = (userId) => ({ type: 'self', userId, ownerColumn: 'owner_id', module: 'report' });
const DEPT = (userId) => ({ type: 'dept', userId, ownerColumn: 'owner_id', module: 'report' });

describe('reportAnalyticsService 数据范围', () => {
  describe('type=all（boss / super_admin）', () => {
    it('漏斗 / 客户统计 / 回款统计都是 1=1 且无参数', async () => {
      const pool = makePool();
      await svc.getSalesFunnel(pool, {}, ALL);
      await svc.getCustomerStats(pool, {}, ALL);
      await svc.getPaymentStats(pool, {}, ALL);
      expect(pool.calls.length).toBeGreaterThanOrEqual(8);
      for (const c of pool.calls) {
        expect(c.sql).toContain('1=1');
        expect(c.params).toHaveLength(0);
      }
    });
  });

  describe('type=self（sales / manager 现配置）', () => {
    it('商机漏斗按 so.owner_id 过滤', async () => {
      const pool = makePool();
      await svc.getSalesFunnel(pool, {}, SELF(42));
      expect(pool.calls[0].sql).toContain('so.owner_id = ?');
      expect(pool.calls[0].params).toEqual([42]);
    });

    it('客户统计 4 条查询都按 c.owner_id 过滤', async () => {
      const pool = makePool();
      await svc.getCustomerStats(pool, {}, SELF(42));
      expect(pool.calls).toHaveLength(4);
      for (const c of pool.calls) {
        expect(c.sql).toContain('c.owner_id = ?');
        expect(c.params).toEqual([42]);
      }
    });

    it('回款统计 3 条查询都经合同 c.create_by 过滤（含逾期口径）', async () => {
      const pool = makePool();
      await svc.getPaymentStats(pool, {}, SELF(42));
      expect(pool.calls).toHaveLength(3);
      for (const c of pool.calls) {
        expect(c.sql).toContain('LEFT JOIN crm_contract c');
        expect(c.sql).toContain('c.create_by = ?');
        expect(c.params).toEqual([42]);
      }
    });

    it('合同口径：收入/趋势/业绩排行都按 c.create_by 过滤', async () => {
      const pool = makePool();
      await svc.getContractRevenue(pool, SELF(42));
      await svc.getSalesTrend(pool, {}, SELF(42));
      await svc.getPerformance(pool, {}, SELF(42));
      for (const c of pool.calls) {
        expect(c.sql).toContain('c.create_by = ?');
        expect(c.params).toContain(42);
      }
    });

    it('商机概览按 o.owner_id 过滤', async () => {
      const pool = makePool();
      await svc.getAnalyticsOverview(pool, SELF(42));
      expect(pool.calls[0].sql).toContain('o.owner_id = ?');
      expect(pool.calls[0].params).toEqual([42]);
    });

    it('逾期客户列表按 c.owner_id 过滤，且保留公海状态条件', async () => {
      const pool = makePool();
      await svc.getOverdueCustomers(pool, {}, SELF(42));
      expect(pool.calls[0].sql).toContain('c.owner_id = ?');
      expect(pool.calls[0].params[0]).toBe('private');
      expect(pool.calls[0].params).toContain(42);
    });

    it('首页组合接口（funnel / collection）把范围透传到下层', async () => {
      const pool = makePool();
      await svc.getAnalyticsFunnel(pool, {}, SELF(42));
      const funnelCalls = [...pool.calls];
      pool.calls.length = 0;
      await svc.getAnalyticsPaymentCollection(pool, {}, SELF(42));
      expect(funnelCalls.every((c) => c.params.includes(42))).toBe(true);
      expect(pool.calls.every((c) => c.params.includes(42))).toBe(true);
    });
  });

  describe('type=dept（部门经理，若日后配置 data_scope=dept）', () => {
    it('客户统计按部门子查询过滤', async () => {
      const pool = makePool();
      await svc.getCustomerStats(pool, {}, DEPT(7));
      expect(pool.calls[0].sql).toContain('c.owner_id IN (SELECT id FROM sys_user WHERE dept_id');
      expect(pool.calls[0].params).toEqual([7]);
    });
  });

  describe('架构守卫：不得再用硬编码 roleId 判权', () => {
    it('服务源码中不存在 roleId === 判定', () => {
      const raw = fs.readFileSync(path.join(__dirname, '../../services/reportAnalyticsService.js'), 'utf8');
      const code = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');
      expect(code).not.toMatch(/roleId\s*===/);
    });

    it('传 null 范围时降级为全量（不抛错、不加过滤）', async () => {
      const pool = makePool();
      await svc.getSalesFunnel(pool, {}, null);
      expect(pool.calls[0].sql).toContain('1=1');
    });
  });
});
