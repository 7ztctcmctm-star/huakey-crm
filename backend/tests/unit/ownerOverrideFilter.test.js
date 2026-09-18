/**
 * 「按指定成员筛选」的服务端授权单测（R-05 团队筛选 / R-07 manager 账号）
 *
 * 安全要点：前端下拉框不是权限边界。必须保证：
 *   · self / 无配置      → **一律忽略** ownerId（sales 不得借筛选看他人数据）
 *   · all               → 允许
 *   · dept              → 仅同部门允许，跨部门忽略
 *   · dept_and_sub      → 本部门或**子部门**内允许（manager 角色的现有配置）
 *   · custom            → 仅在 custom_dept_ids 指定的部门集内允许
 */

const { buildOwnerOverrideFilter } = require('../../middleware/permission');

const TARGET = 7;      // 被筛选的成员
const SELF = 42;       // 当前用户

/**
 * 查询感知的 mock：
 *   sys_user 查询 → 按参数返回 targetDept / selfDept
 *   sys_dept 查询（子部门遍历）→ 首次返回 subDeptIds，之后返回空（避免死循环）
 */
function makePool({ targetDept = null, selfDept = null, subDeptIds = [] } = {}) {
  let deptQueried = false;
  return {
    query: jest.fn(async (sql, params) => {
      if (/FROM sys_user/.test(sql)) {
        const id = params?.[0];
        return [[{ dept_id: id === TARGET ? targetDept : selfDept }]];
      }
      if (/FROM sys_dept/.test(sql)) {
        if (deptQueried) return [[], []];
        deptQueried = true;
        return [subDeptIds.map((id) => ({ id })), []];
      }
      return [[], []];
    })
  };
}

const ALL = { type: 'all', userId: SELF, ownerColumn: 'owner_id', module: 'report' };
const SELF_DP = { type: 'self', userId: SELF, ownerColumn: 'owner_id', module: 'report' };
const DEPT = { type: 'dept', userId: SELF, ownerColumn: 'owner_id', module: 'report' };
const DEPT_SUB = { type: 'dept_and_sub', userId: SELF, ownerColumn: 'owner_id', module: 'report' };
const CUSTOM = { type: 'custom', userId: SELF, ownerColumn: 'owner_id', module: 'report', customDeptIds: '3,4,9' };

describe('buildOwnerOverrideFilter（团队筛选的服务端授权）', () => {
  it('未传 / 非法 ownerId → null（不加条件）', async () => {
    for (const v of [undefined, null, '', 0, -5, 'abc']) {
      expect(await buildOwnerOverrideFilter(makePool(), ALL, v)).toBeNull();
    }
  });

  it('无数据范围对象 → null（防御分支）', async () => {
    expect(await buildOwnerOverrideFilter(makePool(), null, TARGET)).toBeNull();
  });

  it('type=all（老板/超管）→ 允许按成员筛选', async () => {
    const r = await buildOwnerOverrideFilter(makePool(), ALL, TARGET);
    expect(r).toEqual({ clause: 'c.owner_id = ?', params: [TARGET] });
  });

  it('**type=self（sales）→ 忽略 ownerId**（防止借筛选看他人数据）', async () => {
    expect(await buildOwnerOverrideFilter(makePool(), SELF_DP, TARGET)).toBeNull();
  });

  it('type=dept + 同部门 → 允许；跨部门 → 忽略', async () => {
    const same = await buildOwnerOverrideFilter(makePool({ targetDept: 3, selfDept: 3 }), DEPT, TARGET);
    expect(same).toEqual({ clause: 'c.owner_id = ?', params: [TARGET] });
    const cross = await buildOwnerOverrideFilter(makePool({ targetDept: 9, selfDept: 3 }), DEPT, TARGET);
    expect(cross).toBeNull();
  });

  it('type=dept_and_sub（manager 现有配置）+ 目标在**子部门** → 允许', async () => {
    const r = await buildOwnerOverrideFilter(makePool({ targetDept: 8, selfDept: 3, subDeptIds: [8, 9] }), DEPT_SUB, TARGET);
    expect(r).toEqual({ clause: 'c.owner_id = ?', params: [TARGET] });
  });

  it('type=dept_and_sub + 目标在本部门 → 允许', async () => {
    const r = await buildOwnerOverrideFilter(makePool({ targetDept: 3, selfDept: 3 }), DEPT_SUB, TARGET);
    expect(r).toEqual({ clause: 'c.owner_id = ?', params: [TARGET] });
  });

  it('type=dept_and_sub + 目标在范围外 → 忽略', async () => {
    const r = await buildOwnerOverrideFilter(makePool({ targetDept: 99, selfDept: 3, subDeptIds: [8] }), DEPT_SUB, TARGET);
    expect(r).toBeNull();
  });

  it('type=custom → 仅 custom_dept_ids 内允许', async () => {
    const inside = await buildOwnerOverrideFilter(makePool({ targetDept: 4 }), CUSTOM, TARGET);
    expect(inside).toEqual({ clause: 'c.owner_id = ?', params: [TARGET] });
    const outside = await buildOwnerOverrideFilter(makePool({ targetDept: 77 }), CUSTOM, TARGET);
    expect(outside).toBeNull();
  });

  it('目标成员查不到 / 无部门 → 忽略（不放行）', async () => {
    expect(await buildOwnerOverrideFilter(makePool({ targetDept: null, selfDept: 3 }), DEPT, TARGET)).toBeNull();
    expect(await buildOwnerOverrideFilter(makePool({ targetDept: 8, selfDept: null, subDeptIds: [8] }), DEPT_SUB, TARGET)).toBeNull();
  });

  it('按传入的归属列与别名生成条件（合同口径 create_by）', async () => {
    const r = await buildOwnerOverrideFilter(makePool(), ALL, TARGET, 'create_by', 'c');
    expect(r).toEqual({ clause: 'c.create_by = ?', params: [TARGET] });
  });

  it('ownerId 为数字字符串时按数字处理', async () => {
    const r = await buildOwnerOverrideFilter(makePool(), ALL, '7');
    expect(r).toEqual({ clause: 'c.owner_id = ?', params: [TARGET] });
  });
});
