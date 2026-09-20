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

  // ============================================================
  // #6 新收口：财务报表 / 经营看板 4 个接口补齐数据范围
  // ============================================================

  describe('财务报表 getFinanceReport（#6）', () => {
    it('type=all：12 条查询均不加归属过滤', async () => {
      const pool = makePool();
      await svc.getFinanceReport(pool, {}, ALL);
      expect(pool.calls).toHaveLength(12); // 9 汇总 + 应收 + 合同趋势 + 回款趋势
      for (const c of pool.calls) {
        expect(c.sql).toContain('1=1');
        expect(c.sql).not.toMatch(/c\.create_by = \?|po\.owner_id = \?/);
      }
    });

    it('type=self：合同走 c.create_by、采购走 po.owner_id、回款经合同透传', async () => {
      const pool = makePool();
      await svc.getFinanceReport(pool, {}, SELF(42));

      const contractCalls = pool.calls.filter((c) => /FROM crm_contract c/.test(c.sql));
      const purchaseCalls = pool.calls.filter((c) => /crm_purchase_order po/.test(c.sql));
      const paymentFromCalls = pool.calls.filter((c) => /FROM crm_payment p/.test(c.sql));

      expect(contractCalls).toHaveLength(5); // 月/季/年 + 应收 + 趋势
      expect(purchaseCalls).toHaveLength(3);
      expect(paymentFromCalls).toHaveLength(4); // 月/季/年 + 回款趋势

      for (const c of contractCalls) {
        expect(c.sql).toContain('c.create_by = ?');
        expect(c.params).toContain(42);
      }
      for (const c of purchaseCalls) {
        expect(c.sql).toContain('po.owner_id = ?');
        expect(c.params).toContain(42);
      }
      for (const c of paymentFromCalls) {
        expect(c.sql).toContain('LEFT JOIN crm_contract c');
        expect(c.sql).toContain('c.create_by = ?');
        expect(c.params).toContain(42);
      }
    });
  });

  describe('财务报表导出 exportFinance（#6）', () => {
    it.each([
      ['receivable', /FROM crm_contract c/, 'c.create_by = ?'],
      ['income', /FROM crm_contract c/, 'c.create_by = ?'],
      ['cost', /FROM crm_purchase_order p/, 'p.owner_id = ?']
    ])('type=%s 导出按对应归属列过滤', async (type, fromRe, pred) => {
      const pool = makePool();
      await svc.exportFinance(pool, { type }, SELF(42));
      expect(pool.calls).toHaveLength(1);
      expect(pool.calls[0].sql).toMatch(fromRe);
      expect(pool.calls[0].sql).toContain(pred);
      expect(pool.calls[0].params).toContain(42);
    });
  });

  describe('报表导出 exportReport（#6）', () => {
    it('type=self：4 个 Sheet 各自按归属列过滤', async () => {
      const pool = makePool();
      await svc.exportReport(pool, {}, SELF(42));
      expect(pool.calls).toHaveLength(4);

      const [perf, funnel, source, purchase] = pool.calls;
      // 业绩排行：成员可见范围(u.id) + 合同归属(c.create_by)
      expect(perf.sql).toContain('u.id = ?');
      expect(perf.sql).toContain('c.create_by = ?');
      // 销售漏斗：商机 owner_id
      expect(funnel.sql).toContain('so.owner_id = ?');
      // 客户来源：客户 owner_id
      expect(source.sql).toContain('c.owner_id = ?');
      // 采购分析：采购单 owner_id
      expect(purchase.sql).toContain('po.owner_id = ?');

      for (const c of pool.calls) expect(c.params).toContain(42);
    });
  });

  describe('经营看板 getBusinessDashboard（#6）', () => {
    it('type=all：19 条查询均不加归属过滤', async () => {
      const pool = makePool();
      await svc.getBusinessDashboard(pool, ALL);
      expect(pool.calls).toHaveLength(19);
      for (const c of pool.calls) {
        expect(c.sql).toContain('1=1');
        expect(c.sql).not.toMatch(/c\.create_by = \?|c\.owner_id = \?|o\.owner_id = \?|u\.id = \?/);
      }
    });

    it('type=self：每条查询都带上范围参数（无漏网查询）', async () => {
      const pool = makePool();
      await svc.getBusinessDashboard(pool, SELF(42));
      expect(pool.calls).toHaveLength(19);
      // 这是关键不变式：只要有一条查询忘了套范围，它的 params 就不会含 42
      for (const c of pool.calls) {
        expect(c.params).toContain(42);
      }
    });

    it('type=self：每条查询都带归属谓词，且谓词与查询职责对应', async () => {
      const pool = makePool();
      await svc.getBusinessDashboard(pool, SELF(42));
      expect(pool.calls).toHaveLength(19);

      const PREDS = ['c.owner_id = ?', 'c.create_by = ?', 'o.owner_id = ?', 'u.id = ?'];

      // ① 强不变式：每条查询都必须带一个归属谓词（任何漏网查询都会在这里暴露）
      for (const c of pool.calls) {
        expect(PREDS.some((p) => c.sql.includes(p))).toBe(true);
      }

      // ② 按查询职责核对归属列（注意 sellerDetails 内含 o.owner_id = u.id 的相关子查询，
      //    那是「按成员集合计数」，成员范围由 u.id 谓词保证，故下面只锚定主查询）
      const bySql = (re) => pool.calls.filter((c) => re.test(c.sql));

      const ranking = bySql(/GROUP BY u\.id ORDER BY contract_amount/);
      expect(ranking).toHaveLength(2); // teamRanking + sellerDetails
      for (const c of ranking) expect(c.sql).toContain('u.id = ?');

      const customerKpi = bySql(/SELECT COUNT\(\*\) as cnt FROM crm_customer c/);
      expect(customerKpi).toHaveLength(3); // 总数 + 本月新增 + 上月新增
      for (const c of customerKpi) expect(c.sql).toContain('c.owner_id = ?');

      const customerDist = bySql(/FROM crm_customer c WHERE c\.deleted_at IS NULL AND c\.(level|industry|create_time)/);
      for (const c of customerDist) expect(c.sql).toContain('c.owner_id = ?');

      const overdueCust = bySql(/c\.status = 'following'/);
      for (const c of overdueCust) expect(c.sql).toContain('c.owner_id = ?');

      const contractKpi = bySql(/SELECT COUNT\(\*\) as cnt FROM crm_contract c/);
      for (const c of contractKpi) expect(c.sql).toContain('c.create_by = ?');

      const contractTrend = bySql(/DATE_FORMAT\(c\.sign_date/);
      for (const c of contractTrend) expect(c.sql).toContain('c.create_by = ?');

      const overduePay = bySql(/HAVING unpaid > 0 AND days > 30/);
      for (const c of overduePay) expect(c.sql).toContain('c.create_by = ?');

      const oppKpi = bySql(/SELECT COUNT\(\*\) as cnt FROM crm_opportunity o/);
      expect(oppKpi).toHaveLength(2);
      for (const c of oppKpi) expect(c.sql).toContain('o.owner_id = ?');

      const payTrend = bySql(/DATE_FORMAT\(p\.pay_date/);
      for (const c of payTrend) {
        expect(c.sql).toContain('LEFT JOIN crm_contract c');
        expect(c.sql).toContain('c.create_by = ?');
      }
    });

    it('type=dept：成员范围用部门子查询表达', async () => {
      const pool = makePool();
      await svc.getBusinessDashboard(pool, DEPT(7));
      const ranking = pool.calls.filter((c) => /FROM sys_user u/.test(c.sql));
      for (const c of ranking) {
        expect(c.sql).toContain('u.id IN (SELECT id FROM sys_user WHERE dept_id');
      }
    });
  });

  describe('架构守卫：业绩排行的角色口径不得硬编码 roleId（#6）', () => {
    const readCode = () =>
      fs
        .readFileSync(path.join(__dirname, '../../services/reportAnalyticsService.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');

    it('不再出现 role_id IN (<数字>...) 的硬编码', () => {
      expect(readCode()).not.toMatch(/role_id\s+IN\s*\(\s*\d/);
    });

    it('改为从 sys_role.code 取角色 id（roleCode 驱动）', () => {
      const code = readCode();
      expect(code).toContain('BUSINESS_ROLE_IDS_SQL');
      expect(code).toMatch(/SELECT r\.id FROM sys_role r WHERE r\.code IN \(/);
    });

    it('业绩排行实际 SQL 使用 roleCode 子查询', async () => {
      const pool = makePool();
      await svc.getBusinessDashboard(pool, ALL);
      const ranking = pool.calls.filter((c) => /FROM sys_user u/.test(c.sql));
      expect(ranking).toHaveLength(2);
      for (const c of ranking) {
        expect(c.sql).toContain('FROM sys_role r WHERE r.code IN');
        expect(c.sql).toContain("'sales'");
      }
    });
  });

  describe('路由守卫：4 个新收口端点必须挂 checkDataPermission（#6）', () => {
    const routeSrc = fs.readFileSync(path.join(__dirname, '../../routes/report/analytics.js'), 'utf8');

    it.each([
      ["router.post('/export'"],
      ["router.get('/finance'"],
      ["router.get('/finance/export'"],
      ["router.get('/business'"]
    ])('%s 挂载了 checkDataPermission(\'report\')', (prefix) => {
      const line = routeSrc.split('\n').find((l) => l.trim().startsWith(prefix));
      expect(line).toBeTruthy();
      expect(line).toContain("checkDataPermission('report')");
    });

    it('四个端点都把 req.dataPermission 传给 service', () => {
      expect(routeSrc).toContain('exportReport(pool, req.body, req.dataPermission)');
      expect(routeSrc).toContain('getFinanceReport(pool, req.query, req.dataPermission)');
      expect(routeSrc).toContain('exportFinance(pool, req.query, req.dataPermission)');
      expect(routeSrc).toContain('getBusinessDashboard(pool, req.dataPermission)');
    });
  });
});
