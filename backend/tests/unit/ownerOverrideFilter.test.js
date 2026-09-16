/**
 * 「按指定成员筛选」的服务端授权单测（R-05 团队筛选）
 *
 * 安全要点：前端下拉框不是权限边界。必须保证：
 *   · self / custom 范围 → **一律忽略** ownerId（sales 不得借筛选看他人数据）
 *   · all 范围 → 允许
 *   · dept 范围 → 仅同部门允许，跨部门忽略
 */

const { buildOwnerOverrideFilter } = require('../../middleware/permission');

function makePool(deptRows) {
  return {
    query: jest.fn(async () => [deptRows || [], []])
  };
}

const ALL = { type: 'all', userId: 1, ownerColumn: 'owner_id', module: 'report' };
const SELF = { type: 'self', userId: 42, ownerColumn: 'owner_id', module: 'report' };
const DEPT = { type: 'dept', userId: 42, ownerColumn: 'owner_id', module: 'report' };
const CUSTOM = { type: 'custom', userId: 42, ownerColumn: 'owner_id', module: 'report', customDeptIds: '3,4' };

describe('buildOwnerOverrideFilter（团队筛选的服务端授权）', () => {
  it('未传 ownerId → null（不加条件）', async () => {
    expect(await buildOwnerOverrideFilter(makePool(), ALL, undefined)).toBeNull();
    expect(await buildOwnerOverrideFilter(makePool(), ALL, null)).toBeNull();
    expect(await buildOwnerOverrideFilter(makePool(), ALL, '')).toBeNull();
  });

  it('ownerId 非法（0 / 负数 / 非数字）→ null', async () => {
    expect(await buildOwnerOverrideFilter(makePool(), ALL, 0)).toBeNull();
    expect(await buildOwnerOverrideFilter(makePool(), ALL, -5)).toBeNull();
    expect(await buildOwnerOverrideFilter(makePool(), ALL, 'abc')).toBeNull();
  });

  it('无数据范围对象 → null（防御分支）', async () => {
    expect(await buildOwnerOverrideFilter(makePool(), null, 7)).toBeNull();
  });

  it('type=all（老板/超管）→ 允许按成员筛选', async () => {
    const r = await buildOwnerOverrideFilter(makePool(), ALL, 7);
    expect(r).toEqual({ clause: 'c.owner_id = ?', params: [7] });
  });

  it('**type=self（sales）→ 忽略 ownerId**（防止借筛选看他人数据）', async () => {
    const r = await buildOwnerOverrideFilter(makePool(), SELF, 7);
    expect(r).toBeNull();
  });

  it('type=custom → 同样忽略', async () => {
    const r = await buildOwnerOverrideFilter(makePool(), CUSTOM, 7);
    expect(r).toBeNull();
  });

  it('type=dept + 目标同部门 → 允许', async () => {
    const pool = makePool([{ target_dept: 3, self_dept: 3 }]);
    const r = await buildOwnerOverrideFilter(pool, DEPT, 7);
    expect(r).toEqual({ clause: 'c.owner_id = ?', params: [7] });
  });

  it('type=dept + 目标跨部门 → 忽略（静默不放行）', async () => {
    const pool = makePool([{ target_dept: 9, self_dept: 3 }]);
    expect(await buildOwnerOverrideFilter(pool, DEPT, 7)).toBeNull();
  });

  it('type=dept + 查不到用户 → 忽略', async () => {
    const pool = makePool([]);
    expect(await buildOwnerOverrideFilter(pool, DEPT, 7)).toBeNull();
  });

  it('按传入的归属列与别名生成条件（合同口径 create_by）', async () => {
    const r = await buildOwnerOverrideFilter(makePool(), ALL, 7, 'create_by', 'c');
    expect(r).toEqual({ clause: 'c.create_by = ?', params: [7] });
  });

  it('ownerId 为数字字符串时按数字处理', async () => {
    const r = await buildOwnerOverrideFilter(makePool(), ALL, '7');
    expect(r).toEqual({ clause: 'c.owner_id = ?', params: [7] });
  });
});
