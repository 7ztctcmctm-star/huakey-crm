/**
 * [P0-03 2026-10-23] 用户管理纵向越权防护单测
 *
 * 背景：routes/user.js 仅校验 system:user:* 功能权限。HR 持有这些权限，
 * 原实现允许 HR 创建 boss、重置 boss 密码、把任意账号改为高权限角色。
 * 本套件锁定「调用者角色层级 >= 目标角色层级」的后端强制规则。
 */

jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('hashed_pwd') }));
jest.mock('../../services/permissionService', () => ({
  clearPermissionCache: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../services/customerService', () => ({
  systemReleaseOwnedCustomersOnLeave: jest.fn().mockResolvedValue({ affectedRows: 0 })
}));
jest.mock('../../utils/sseManager', () => ({ send: jest.fn() }));

const {
  addUser,
  updateUser,
  resetPassword,
  deleteUser
} = require('../../services/userRouteService');

const hr = { userId: 4, username: 'hr01', roleCode: 'hr' };
const sales = { userId: 3, username: 'sales01', roleCode: 'sales' };
const superAdmin = { userId: 70, username: 'root', roleCode: 'super_admin' };

const roleBoss = [{ id: 1, code: 'boss', status: 1, deleted_at: null }];
const roleManager = [{ id: 2, code: 'manager', status: 1, deleted_at: null }];
const roleSales = [{ id: 3, code: 'sales', status: 1, deleted_at: null }];
const roleUnknown = [{ id: 99, code: 'custom_high', status: 1, deleted_at: null }];

function makePool() {
  return { query: jest.fn(), getConnection: jest.fn() };
}

const addPayload = (roleId) => ({
  username: 'new_user',
  password: 'Passw0rd',
  role_id: roleId
});

describe('P0-03 用户管理纵向越权防护', () => {
  let pool;

  beforeEach(() => {
    jest.clearAllMocks();
    pool = makePool();
  });

  describe('addUser', () => {
    it('HR 不得创建 boss（同级/更高角色）', async () => {
      pool.query.mockResolvedValueOnce([roleBoss]);

      await expect(addUser(pool, addPayload(1), hr)).rejects.toMatchObject({ code: 403001 });
      expect(pool.query).toHaveBeenCalledTimes(1); // 只查了角色，未 INSERT
    });

    it('HR 不得创建财务/经理等更高层级角色', async () => {
      pool.query.mockResolvedValueOnce([roleManager]);

      await expect(addUser(pool, addPayload(2), hr)).rejects.toMatchObject({ code: 403001 });
    });

    it('未登记的自定义角色一律不可由非超管授予', async () => {
      pool.query.mockResolvedValueOnce([roleUnknown]);

      await expect(addUser(pool, addPayload(99), hr)).rejects.toMatchObject({ code: 403001 });
    });

    it('销售即使持有 system:user:add 也不得创建经理', async () => {
      pool.query.mockResolvedValueOnce([roleManager]);

      await expect(addUser(pool, addPayload(2), sales)).rejects.toMatchObject({ code: 403001 });
    });

    it('HR 可以创建不高于自身的销售账号', async () => {
      pool.query
        .mockResolvedValueOnce([roleSales])   // SELECT role
        .mockResolvedValueOnce([[]])          // 用户名查重
        .mockResolvedValueOnce([{ insertId: 20 }]); // INSERT

      await expect(addUser(pool, addPayload(3), hr)).resolves.toEqual({ id: 20 });
      const insertCall = pool.query.mock.calls[2];
      expect(insertCall[0]).toContain('INSERT INTO sys_user');
      expect(insertCall[1]).toContain(3);
    });

    it('super_admin 可以创建 boss', async () => {
      pool.query
        .mockResolvedValueOnce([roleBoss])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 21 }]);

      await expect(addUser(pool, addPayload(1), superAdmin)).resolves.toEqual({ id: 21 });
    });

    it('无角色账号允许创建（role_id 为空不属于提权）', async () => {
      pool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 22 }]);

      await expect(addUser(pool, addPayload(null), hr)).resolves.toEqual({ id: 22 });
    });
  });

  describe('updateUser', () => {
    it('HR 不得修改 boss 账号', async () => {
      pool.query.mockResolvedValueOnce([[{ id: 1, role_code: 'boss' }]]);

      await expect(updateUser(pool, { id: 1, real_name: 'x' }, hr))
        .rejects.toMatchObject({ code: 403001 });
    });

    it('HR 不得把销售提升为经理', async () => {
      pool.query
        .mockResolvedValueOnce([[{ id: 3, role_code: 'sales' }]])
        .mockResolvedValueOnce([roleManager]);

      await expect(updateUser(pool, { id: 3, role_id: 2 }, hr))
        .rejects.toMatchObject({ code: 403001 });
      expect(pool.query).toHaveBeenCalledTimes(2); // 未执行 UPDATE
    });

    it('管理员不得修改自己的角色或状态（防自提权/自停用）', async () => {
      pool.query.mockResolvedValueOnce([[{ id: 4, role_code: 'hr' }]]);
      await expect(updateUser(pool, { id: 4, role_id: 1 }, hr))
        .rejects.toMatchObject({ code: 400005 });

      pool.query.mockResolvedValueOnce([[{ id: 4, role_code: 'hr' }]]);
      await expect(updateUser(pool, { id: 4, status: 0 }, hr))
        .rejects.toMatchObject({ code: 400005 });
    });

    it('HR 可以修改销售的基础信息', async () => {
      pool.query
        .mockResolvedValueOnce([[{ id: 3, role_code: 'sales' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await expect(updateUser(pool, { id: 3, real_name: '张三' }, hr)).resolves.toBeUndefined();
    });
  });

  describe('resetPassword', () => {
    it('HR 不得重置 boss 密码', async () => {
      pool.query.mockResolvedValueOnce([[{ id: 1, username: 'boss01', role_code: 'boss' }]]);

      await expect(resetPassword(pool, 1, 'NewPassw0rd', hr))
        .rejects.toMatchObject({ code: 403001 });
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it('HR 可以重置销售密码', async () => {
      pool.query
        .mockResolvedValueOnce([[{ id: 3, username: 'sales01', role_code: 'sales' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await expect(resetPassword(pool, 3, 'NewPassw0rd', hr))
        .resolves.toEqual({ id: 3, username: 'sales01' });
    });
  });

  describe('deleteUser', () => {
    it('HR 不得删除 boss（事务应回滚）', async () => {
      const conn = {
        query: jest.fn().mockResolvedValueOnce([[{ id: 1, username: 'boss01', manager_id: null, role_code: 'boss' }]]),
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn()
      };
      pool.getConnection.mockResolvedValue(conn);

      await expect(deleteUser(pool, { id: 1 }, hr)).rejects.toMatchObject({ code: 403001 });
      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.commit).not.toHaveBeenCalled();
    });

    it('管理员不得删除自己', async () => {
      const conn = {
        query: jest.fn().mockResolvedValueOnce([[{ id: 4, username: 'hr01', manager_id: null, role_code: 'hr' }]]),
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn()
      };
      pool.getConnection.mockResolvedValue(conn);

      await expect(deleteUser(pool, { id: 4 }, hr)).rejects.toMatchObject({ code: 400005 });
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  it('缺少登录身份时一律拒绝（fail-closed）', async () => {
    await expect(addUser(pool, addPayload(null), null)).rejects.toMatchObject({ code: 403001 });
    await expect(updateUser(pool, { id: 3, real_name: 'x' }, null)).rejects.toMatchObject({ code: 403001 });
    await expect(resetPassword(pool, 3, 'NewPassw0rd', null)).rejects.toMatchObject({ code: 403001 });
  });
});
