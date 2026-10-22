/**
 * C3 删除逻辑治理 —— roleRouteService.deleteRole 占用检查
 * 覆盖：有用户 → 409 RESOURCE_IN_USE；有权限配置（sys_role_permission）→ 409；
 *       干净角色才 DELETE 并清权限缓存；查询顺序（先用户后权限配置）。
 * 使用 mock pool + mock 缓存清理函数，无需真实数据库。
 */
const roleService = require('../../services/roleRouteService');
const AppError = require('../../errors/AppError');
const ErrorCodes = require('../../errors/codes');

function makePool(overrides = {}) {
  const calls = [];
  const pool = {
    query: jest.fn(async (sql) => {
      calls.push(sql);
      if (sql.includes('COUNT(*)') && sql.includes('FROM sys_user WHERE role_id')) return overrides.users || [[{ cnt: 0 }]];
      if (sql.includes('COUNT(*)') && sql.includes('FROM sys_role_permission WHERE role_id')) return overrides.perms || [[{ cnt: 0 }]];
      if (sql.startsWith('SELECT id FROM sys_user WHERE role_id')) return overrides.delUsers || [[]];
      if (sql.startsWith('DELETE FROM sys_role')) return overrides.del || [{ affectedRows: 1 }];
      throw new Error('unexpected SQL: ' + sql);
    })
  };
  return { pool, calls };
}

const noop = () => {};

describe('C3 deleteRole 占用检查', () => {
  it('有用户关联 → AppError 409（RESOURCE_IN_USE），不执行 DELETE', async () => {
    const { pool, calls } = makePool({ users: [[{ cnt: 2 }]] });
    await expect(roleService.deleteRole(pool, 5, noop, noop)).rejects.toMatchObject({
      code: ErrorCodes.RESOURCE_IN_USE.code,
      httpStatus: 409,
      message: '该角色下有 2 个用户，无法删除'
    });
    await expect(roleService.deleteRole(pool, 5, noop, noop)).rejects.toBeInstanceOf(AppError);
    expect(calls.some(s => s.startsWith('DELETE'))).toBe(false);
  });

  it('无用户但已配置权限 → AppError 409，消息带权限条数（C3 新增检查项）', async () => {
    const { pool, calls } = makePool({ perms: [[{ cnt: 37 }]] });
    await expect(roleService.deleteRole(pool, 5, noop, noop)).rejects.toMatchObject({
      code: 409001,
      httpStatus: 409,
      message: '该角色已配置 37 项权限，无法删除'
    });
    expect(calls.some(s => s.startsWith('DELETE'))).toBe(false);
  });

  it('两项都干净 → 执行 DELETE，并调用两级缓存清理', async () => {
    const { pool, calls } = makePool();
    const clearOne = jest.fn();
    const clearAll = jest.fn();
    const ok = await roleService.deleteRole(pool, 5, clearOne, clearAll);
    expect(ok).toBe(true);
    expect(calls.filter(s => s.startsWith('DELETE FROM sys_role'))).toHaveLength(1);
    // 删除后仍会查一次该角色用户（此时应为空）并清全部缓存
    expect(clearAll).toHaveBeenCalledTimes(1);
    expect(clearOne).not.toHaveBeenCalled(); // 无用户可清
  });

  it('查询顺序：先查用户，用户有占用时不再查权限配置（短路）', async () => {
    const { pool, calls } = makePool({ users: [[{ cnt: 1 }]] });
    await expect(roleService.deleteRole(pool, 5, noop, noop)).rejects.toBeInstanceOf(AppError);
    const userIdx = calls.findIndex(s => s.includes('FROM sys_user WHERE role_id'));
    const permIdx = calls.findIndex(s => s.includes('FROM sys_role_permission WHERE role_id'));
    expect(userIdx).toBeGreaterThanOrEqual(0);
    expect(permIdx).toBe(-1);
  });

  it('用户检查干净但权限检查有占用 → 顺序上仍走到权限检查', async () => {
    const { pool, calls } = makePool({ perms: [[{ cnt: 1 }]] });
    await expect(roleService.deleteRole(pool, 5, noop, noop)).rejects.toMatchObject({ httpStatus: 409 });
    expect(calls.findIndex(s => s.includes('FROM sys_role_permission WHERE role_id'))).toBeGreaterThan(
      calls.findIndex(s => s.includes('FROM sys_user WHERE role_id'))
    );
  });
});
