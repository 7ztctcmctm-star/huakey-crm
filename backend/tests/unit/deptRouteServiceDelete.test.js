/**
 * C3 删除逻辑治理 —— deptRouteService.deleteDept 占用检查
 * 覆盖：子部门占用 → 409；用户占用 → 409；干净部门才真正 DELETE；
 *       查询顺序（先子部门后用户）与「不删不该删的行」。
 * 使用 mock pool，无需真实数据库。
 */
const deptService = require('../../services/deptRouteService');

function makePool(overrides = {}) {
  const calls = [];
  const pool = {
    query: jest.fn(async (sql) => {
      calls.push(sql);
      if (sql.includes('FROM sys_dept WHERE parent_id')) return overrides.children || [[{ cnt: 0 }]];
      if (sql.includes('FROM sys_user WHERE dept_id')) return overrides.users || [[{ cnt: 0 }]];
      if (sql.startsWith('DELETE FROM sys_dept')) return overrides.del || [{ affectedRows: 1 }];
      throw new Error('unexpected SQL: ' + sql);
    })
  };
  return { pool, calls };
}

describe('C3 deleteDept 占用检查', () => {
  it('有子部门 → 409 RESOURCE_IN_USE，且不执行 DELETE', async () => {
    const { pool, calls } = makePool({ children: [[{ cnt: 3 }]] });
    const r = await deptService.deleteDept(pool, { id: 7 });
    expect(r).toEqual({ error: '该部门下有 3 个子部门，无法删除', status: 409 });
    expect(calls.some(s => s.startsWith('DELETE'))).toBe(false);
  });

  it('无子部门但有用户 → 409，消息带用户数', async () => {
    const { pool, calls } = makePool({ users: [[{ cnt: 5 }]] });
    const r = await deptService.deleteDept(pool, { id: 7 });
    expect(r).toEqual({ error: '该部门下有 5 个用户，无法删除', status: 409 });
    expect(calls.some(s => s.startsWith('DELETE'))).toBe(false);
  });

  it('两项都干净 → 执行物理 DELETE 并返回 success', async () => {
    const { pool, calls } = makePool();
    const r = await deptService.deleteDept(pool, { id: 7 });
    expect(r).toEqual({ success: true });
    const dels = calls.filter(s => s.startsWith('DELETE FROM sys_dept'));
    expect(dels).toHaveLength(1);
    expect(dels[0]).toContain('WHERE id=?');
  });

  it('查询顺序：先查子部门，再查用户（子部门有占用时不再查用户）', async () => {
    const { pool, calls } = makePool({ children: [[{ cnt: 1 }]] });
    await deptService.deleteDept(pool, { id: 7 });
    const childIdx = calls.findIndex(s => s.includes('FROM sys_dept WHERE parent_id'));
    const userIdx = calls.findIndex(s => s.includes('FROM sys_user WHERE dept_id'));
    expect(childIdx).toBeGreaterThanOrEqual(0);
    expect(userIdx).toBe(-1); // 子部门已占用，短路
  });
});
