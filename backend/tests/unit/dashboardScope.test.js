/**
 * 仪表盘数据范围（R-05 验收项：boss/manager/sales 数据隔离正确）
 *
 * 背景：修复前 dashboardService 用 `roleId === ROLES.ADMIN || roleId === ROLES.MANAGER`
 * 判定「可见全部」，与 sys_role.view_all/manage_all + sys_data_permission 完全脱节。
 * 本测试锁住三点：
 *   1. all  → 不加任何过滤（1=1，无参数）
 *   2. self → 按各表归属列过滤当前用户（customer.owner_id / contract.create_by / opportunity.owner_id …）
 *   3. dept → 部门子查询过滤
 *   4. 架构守卫：service 源码中不得再出现 roleId 硬编码判权
 */

const fs = require('fs');
const path = require('path');

// getOverdueStats 内部会读 sys_config（getOverdueDays）→ 单测里 mock 掉，避免真连库
jest.mock('../../utils/config', () => ({
  getOverdueDays: jest.fn().mockResolvedValue(15)
}));

const dashboardService = require('../../services/dashboardService');

/** 记录 SQL 与参数的假 pool（不发真实查询） */
function makePool() {
  const calls = [];
  const query = jest.fn(async (sql, params) => {
    calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params: params || [] });
    return [[{ amount: '0.00', count: 0, total: 0 }], []];
  });
  return { calls, query };
}

const ALL = { type: 'all', ownerColumn: 'owner_id', module: 'report' };
const SELF = (userId) => ({ type: 'self', userId, ownerColumn: 'owner_id', module: 'report' });
const DEPT = (userId) => ({ type: 'dept', userId, ownerColumn: 'owner_id', module: 'report' });

describe('dashboardService 数据范围', () => {
  describe('type=all（boss / super_admin，view_all=1）', () => {
    it('概览的所有查询都不加范围过滤，且不传参数', async () => {
      const pool = makePool();
      await dashboardService.getOverview(pool, ALL);

      expect(pool.calls).toHaveLength(7);
      for (const c of pool.calls) {
        expect(c.sql).toContain('1=1');
        expect(c.params).toHaveLength(0);
      }
    });

    it('今日待办同样不加过滤', async () => {
      const pool = makePool();
      await dashboardService.getTodayTasks(pool, ALL);
      for (const c of pool.calls) {
        expect(c.sql).toContain('1=1');
        expect(c.params).toHaveLength(0);
      }
    });
  });

  describe('type=self（sales / manager 现配置）', () => {
    it('客户类查询按 cu.owner_id 过滤当前用户', async () => {
      const pool = makePool();
      await dashboardService.getOverview(pool, SELF(42));

      const customerCalls = pool.calls.filter((c) => c.sql.includes('FROM crm_customer cu'));
      expect(customerCalls.length).toBeGreaterThanOrEqual(3);
      for (const c of customerCalls) {
        expect(c.sql).toContain('cu.owner_id = ?');
        expect(c.params).toEqual([42]);
      }
    });

    it('合同/回款类查询按 c.create_by 过滤当前用户', async () => {
      const pool = makePool();
      await dashboardService.getOverview(pool, SELF(42));

      const contractCalls = pool.calls.filter((c) => c.sql.includes('crm_contract c'));
      expect(contractCalls.length).toBeGreaterThanOrEqual(2);
      for (const c of contractCalls) {
        expect(c.sql).toContain('c.create_by = ?');
        expect(c.params).toEqual([42]);
      }
    });

    it('商机金额按 o.owner_id 过滤当前用户', async () => {
      const pool = makePool();
      await dashboardService.getOverview(pool, SELF(42));

      const oppCall = pool.calls.find((c) => c.sql.includes('crm_opportunity o'));
      expect(oppCall).toBeDefined();
      expect(oppCall.sql).toContain('o.owner_id = ?');
      expect(oppCall.params).toEqual([42]);
    });

    it('今日待办：跟进按 f.create_by、工单按 so.assignee_id 过滤', async () => {
      const pool = makePool();
      await dashboardService.getTodayTasks(pool, SELF(42));

      const followCalls = pool.calls.filter((c) => c.sql.includes('crm_follow_up f'));
      expect(followCalls.length).toBeGreaterThanOrEqual(2);
      for (const c of followCalls) expect(c.sql).toContain('f.create_by = ?');

      const orderCalls = pool.calls.filter((c) => c.sql.includes('crm_service_order so'));
      expect(orderCalls.length).toBeGreaterThanOrEqual(2);
      for (const c of orderCalls) expect(c.sql).toContain('so.assignee_id = ?');
    });

    it('快捷统计：待审合同/待回款计划按合同归属过滤', async () => {
      const pool = makePool();
      await dashboardService.getQuickStats(pool, SELF(42));

      const withScope = pool.calls.filter((c) => c.sql.includes('c.create_by = ?'));
      expect(withScope.length).toBe(2);
      for (const c of withScope) expect(c.params).toEqual([42]);
    });

    it('公海池计数是全局共享量，不带参数（修复旧版「死参数」bug）', async () => {
      const pool = makePool();
      await dashboardService.getQuickStats(pool, SELF(42));

      const poolCall = pool.calls.find((c) => c.sql.includes('owner_id IS NULL'));
      expect(poolCall).toBeDefined();
      expect(poolCall.params).toHaveLength(0);
    });

    it('逾期统计按 c.owner_id 过滤，且保留公海状态条件', async () => {
      const pool = makePool();
      await dashboardService.getOverdueStats(pool, SELF(42));

      const [call] = pool.calls;
      expect(call.sql).toContain('c.owner_id = ?');
      expect(call.params).toContain(42);
      expect(call.params[0]).toBe('private'); // POOL_STATUS.PRIVATE
    });
  });

  describe('type=dept（部门经理，若日后配置 data_scope=dept）', () => {
    it('按部门子查询过滤，参数为当前用户', async () => {
      const pool = makePool();
      await dashboardService.getOverview(pool, DEPT(7));

      const customerCall = pool.calls.find((c) => c.sql.includes('FROM crm_customer cu'));
      expect(customerCall.sql).toContain('cu.owner_id IN (SELECT id FROM sys_user WHERE dept_id');
      expect(customerCall.params).toEqual([7]);
    });
  });

  describe('架构守卫：不得再用硬编码 roleId 判权', () => {
    it('源码中不存在 roleId === 之类的角色判定', () => {
      const raw = fs.readFileSync(
        path.join(__dirname, '../../services/dashboardService.js'), 'utf8'
      );
      // 只检查代码：注释里允许出现「修复前用 roleId === …」这类说明
      const code = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');

      expect(code).not.toMatch(/roleId\s*===/);
      expect(code).not.toMatch(/ROLES\./);
    });

    it('传 null 数据范围时降级为全量（不抛错、不加过滤）', async () => {
      const pool = makePool();
      await dashboardService.getOverview(pool, null);
      for (const c of pool.calls) expect(c.sql).toContain('1=1');
    });
  });
});
