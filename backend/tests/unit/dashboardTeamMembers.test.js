/**
 * 首页「团队筛选」成员列表的数据范围单测（R-07 配套）
 *
 * 为什么有这个接口：不能用 /user/list（系统管理接口，需 system:user 权限；manager 无权且不该拿到全公司用户表）。
 * 本测试锁定「按调用者数据范围返回成员」的口径。
 */

const dashboardService = require('../../services/dashboardService');

/**
 * 查询感知的 mock：
 *   sys_user + 'WHERE id = ?'  → 返回 selfDept（用于取当前用户部门）
 *   sys_dept                  → 返回 subDeptIds（子部门遍历）
 *   sys_user 列表查询          → 返回 SCOPE_USERS
 */
function makePool({ selfDept = null, subDeptIds = [] } = {}) {
  let deptQueried = false;
  const calls = [];
  return {
    calls,
    query: jest.fn(async (sql, params) => {
      calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params: params || [] });
      if (/FROM sys_dept/.test(sql)) {
        if (deptQueried) return [[], []];
        deptQueried = true;
        return [subDeptIds.map((id) => ({ id })), []];
      }
      if (/FROM sys_user/.test(sql)) {
        if (/WHERE status = 1 AND deleted_at IS NULL AND id = \?/.test(sql)) {
          return [[{ id: params[0], username: 'self', real_name: '本人', dept_id: selfDept }], []];
        }
        if (/WHERE id = \?/.test(sql) && !/status = 1/.test(sql)) {
          return [[{ dept_id: selfDept }], []];
        }
        // 列表查询（可能带 dept_id IN (...)
        return [[{ id: 1, username: 'a', real_name: '甲', dept_id: 3 }], []];
      }
      return [[], []];
    })
  };
}

const ALL = { type: 'all', userId: 1, module: 'report' };
const DEPT = { type: 'dept', userId: 42, module: 'report' };
const DEPT_SUB = { type: 'dept_and_sub', userId: 42, module: 'report' };
const CUSTOM = { type: 'custom', userId: 42, module: 'report', customDeptIds: '3,4' };
const SELF = { type: 'self', userId: 42, module: 'report' };

describe('dashboardService.getTeamMembers（团队筛选成员列表的范围口径）', () => {
  it('type=all → 查全部在职用户，不带部门条件', async () => {
    const pool = makePool();
    await dashboardService.getTeamMembers(pool, ALL);
    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0].sql).toContain('status = 1');
    expect(pool.calls[0].sql).not.toContain('dept_id IN');
  });

  it('type=dept → 限定本部门', async () => {
    const pool = makePool({ selfDept: 3 });
    await dashboardService.getTeamMembers(pool, DEPT);
    const listCall = pool.calls.find((c) => c.sql.includes('dept_id IN'));
    expect(listCall).toBeTruthy();
    expect(listCall.params).toEqual([3]);
  });

  it('type=dept_and_sub → 限定本部门 + 子部门', async () => {
    const pool = makePool({ selfDept: 3, subDeptIds: [8, 9] });
    await dashboardService.getTeamMembers(pool, DEPT_SUB);
    const listCall = pool.calls.find((c) => c.sql.includes('dept_id IN'));
    expect(listCall).toBeTruthy();
    expect(listCall.params).toEqual([3, 8, 9]);
  });

  it('type=custom → 限定 customDeptIds（无需查用户表拿部门）', async () => {
    const pool = makePool();
    await dashboardService.getTeamMembers(pool, CUSTOM);
    const listCall = pool.calls.find((c) => c.sql.includes('dept_id IN'));
    expect(listCall.params).toEqual([3, 4]);
  });

  it('type=self → 只返回自己（前端此时不显示筛选器）', async () => {
    const pool = makePool();
    await dashboardService.getTeamMembers(pool, SELF);
    const selfCall = pool.calls.find((c) => c.sql.includes('AND id = ?'));
    expect(selfCall).toBeTruthy();
    expect(selfCall.params).toEqual([42]);
  });

  it('无数据范围对象 → 空数组（防御）', async () => {
    expect(await dashboardService.getTeamMembers(makePool(), null)).toEqual([]);
  });

  it('有部门范围但查不到自己的部门 → 空数组（不放行）', async () => {
    const pool = makePool({ selfDept: null });
    expect(await dashboardService.getTeamMembers(pool, DEPT)).toEqual([]);
  });
});
