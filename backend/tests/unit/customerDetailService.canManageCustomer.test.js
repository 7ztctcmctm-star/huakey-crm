/**
 * [P1-02 2026-10-23] canManageCustomer 数据范围判定
 *
 * 原实现把经理可管理范围写死为 dept_id IN (1,5,6,7)，绕过 sys_data_permission。
 * 这里覆盖改造后的各 data_scope 分支：
 *   all / dept / dept_and_sub / custom / self / 无配置（fail-closed）
 */

jest.mock('../../services/customerService', () => ({
  canTransition: jest.fn(),
  mapStatusToBusinessStatus: jest.fn()
}));
jest.mock('../../services/permissionService', () => ({
  getDataPermissions: jest.fn()
}));
jest.mock('../../middleware/permission', () => ({
  getSubDeptIds: jest.fn()
}));

const { getDataPermissions } = require('../../services/permissionService');
const { getSubDeptIds } = require('../../middleware/permission');
const customerDetailService = require('../../services/customerDetailService');

const MANAGER = { userId: 10, roleId: 2, manageAll: false };
const SALES = { userId: 10, roleId: 3, manageAll: false };

function scope(module, dataScope, customDeptIds = null) {
  return [{ module, data_scope: dataScope, custom_dept_ids: customDeptIds }];
}

function makePool(userDepts) {
  return {
    query: jest.fn(async (sql, params) => {
      if (sql.includes('FROM sys_user')) {
        const id = Number(params[0]);
        return [Object.prototype.hasOwnProperty.call(userDepts, id) ? [{ dept_id: userDepts[id] }] : []];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    })
  };
}

describe('customerDetailService.canManageCustomer（P1-02）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSubDeptIds.mockResolvedValue([5, 6, 7]);
  });

  it('manageAll 直接放行，不走数据范围查询', async () => {
    const pool = makePool({});
    const ok = await customerDetailService.canManageCustomer(pool, { ...MANAGER, manageAll: true }, 99);
    expect(ok).toBe(true);
    expect(getDataPermissions).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('本人客户始终可管理，且不查数据范围', async () => {
    const pool = makePool({});
    const ok = await customerDetailService.canManageCustomer(pool, SALES, 10);
    expect(ok).toBe(true);
    expect(getDataPermissions).not.toHaveBeenCalled();
  });

  it('dept_and_sub：本部门客户可管理', async () => {
    getDataPermissions.mockResolvedValue(scope('customer', 'dept_and_sub'));
    const pool = makePool({ 10: 5, 20: 5 });
    const ok = await customerDetailService.canManageCustomer(pool, MANAGER, 20);
    expect(ok).toBe(true);
  });

  it('dept_and_sub：子部门客户可管理', async () => {
    getDataPermissions.mockResolvedValue(scope('customer', 'dept_and_sub'));
    getSubDeptIds.mockResolvedValue([5, 6, 7]);
    const pool = makePool({ 10: 5, 20: 6 });
    const ok = await customerDetailService.canManageCustomer(pool, MANAGER, 20);
    expect(ok).toBe(true);
    expect(getSubDeptIds).toHaveBeenCalledWith(5, pool);
  });

  it('dept_and_sub：非本部门/子部门客户不可管理（不再因角色是经理就放行）', async () => {
    getDataPermissions.mockResolvedValue(scope('customer', 'dept_and_sub'));
    getSubDeptIds.mockResolvedValue([5, 6, 7]);
    const pool = makePool({ 10: 5, 20: 900 });
    const ok = await customerDetailService.canManageCustomer(pool, MANAGER, 20);
    expect(ok).toBe(false);
  });

  it('dept：仅本部门，子部门不可管理', async () => {
    getDataPermissions.mockResolvedValue(scope('customer', 'dept'));
    const pool = makePool({ 10: 5, 20: 5, 30: 6 });

    expect(await customerDetailService.canManageCustomer(pool, MANAGER, 20)).toBe(true);
    expect(await customerDetailService.canManageCustomer(pool, MANAGER, 30)).toBe(false);
    expect(getSubDeptIds).not.toHaveBeenCalled();
  });

  it('custom：仅 custom_dept_ids 内部门可管理', async () => {
    getDataPermissions.mockResolvedValue(scope('customer', 'custom', '6,7'));
    const pool = makePool({ 10: 5, 20: 6, 30: 5 });

    expect(await customerDetailService.canManageCustomer(pool, MANAGER, 20)).toBe(true);
    expect(await customerDetailService.canManageCustomer(pool, MANAGER, 30)).toBe(false);
  });

  it('self：他人客户不可管理', async () => {
    getDataPermissions.mockResolvedValue(scope('customer', 'self'));
    const pool = makePool({ 10: 5, 20: 5 });
    const ok = await customerDetailService.canManageCustomer(pool, SALES, 20);
    expect(ok).toBe(false);
  });

  it('无 sys_data_permission 配置时 fail-closed 为 self', async () => {
    getDataPermissions.mockResolvedValue([]);
    const pool = makePool({ 10: 5, 20: 5 });
    const ok = await customerDetailService.canManageCustomer(pool, MANAGER, 20);
    expect(ok).toBe(false);
  });

  it('all 范围按数据权限放行（不依赖角色 ID）', async () => {
    getDataPermissions.mockResolvedValue(scope('customer', 'all'));
    const pool = makePool({ 10: 4, 20: 900 });
    const ok = await customerDetailService.canManageCustomer(pool, { ...MANAGER, roleId: 6 }, 20);
    expect(ok).toBe(true);
  });

  it('公海客户（owner_id IS NULL）：管理范围可维护，self 范围不可', async () => {
    const pool = makePool({ 10: 5 });

    getDataPermissions.mockResolvedValueOnce(scope('customer', 'dept_and_sub'));
    expect(await customerDetailService.canManageCustomer(pool, MANAGER, null)).toBe(true);

    getDataPermissions.mockResolvedValueOnce(scope('customer', 'self'));
    expect(await customerDetailService.canManageCustomer(pool, SALES, null)).toBe(false);
  });

  it('公海客户：经理数据范围若为 self，也不放行', async () => {
    getDataPermissions.mockResolvedValue(scope('customer', 'self'));
    const pool = makePool({ 10: 5 });
    expect(await customerDetailService.canManageCustomer(pool, MANAGER, null)).toBe(false);
  });

  it('归属人不存在/已删除时不可管理', async () => {
    getDataPermissions.mockResolvedValue(scope('customer', 'dept_and_sub'));
    const pool = makePool({ 10: 5 });
    const ok = await customerDetailService.canManageCustomer(pool, MANAGER, 404);
    expect(ok).toBe(false);
  });
});
