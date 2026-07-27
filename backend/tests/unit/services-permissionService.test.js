/**
 * permissionService 单元测试
 */

const permissionService = require('../../services/permissionService');
const ROLES = require('../../config/roles');

jest.mock('../../config/logger', () => ({
  error: jest.fn()
}));

function createMockPool() {
  return { query: jest.fn(), getConnection: jest.fn() };
}

describe('permissionService', () => {
  beforeEach(() => {
    permissionService.clearAllPermissionCache();
  });

  describe('getUserPermissions', () => {
    it('应从数据库查询并缓存', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ code: 'customer' }, { code: 'user' }]]);

      const result = await permissionService.getUserPermissions(pool, 1, 2);
      expect(result).toEqual(['customer', 'user']);
      expect(pool.query).toHaveBeenCalledTimes(1);

      // 第二次应走缓存
      const result2 = await permissionService.getUserPermissions(pool, 1, 2);
      expect(result2).toEqual(['customer', 'user']);
      expect(pool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('hasPermission', () => {
    it('ADMIN 角色应直接返回 true', async () => {
      const pool = createMockPool();
      const result = await permissionService.hasPermission(pool, 1, ROLES.ADMIN, 'any');
      expect(result).toBe(true);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('非 ADMIN 应检查权限列表', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ code: 'customer' }]]);

      const result = await permissionService.hasPermission(pool, 1, ROLES.SALES, 'customer');
      expect(result).toBe(true);
    });

    it('无权限时应返回 false', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ code: 'customer' }]]);

      const result = await permissionService.hasPermission(pool, 1, ROLES.SALES, 'user');
      expect(result).toBe(false);
    });
  });

  describe('clearPermissionCache', () => {
    it('应清除指定用户缓存', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ code: 'customer' }]])
        .mockResolvedValueOnce([[{ code: 'user' }]]);
      await permissionService.getUserPermissions(pool, 1, 2);

      permissionService.clearPermissionCache(1);
      const result = await permissionService.getUserPermissions(pool, 1, 2);
      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(result).toEqual(['user']);
    });
  });

  describe('getMenuPermissions', () => {
    it('应构建菜单树', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1, name: 'a', code: 'a', parent_id: 0, path: '/a', icon: '', sort: 1 }]]);

      const result = await permissionService.getMenuPermissions(pool, 2);
      expect(result).toHaveLength(1);
      expect(result[0].children).toEqual([]);
    });
  });

  describe('getDataPermissions', () => {
    it('缓存未命中时应查询并缓存', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ module: 'customer', data_scope: 'self' }]]);

      const result = await permissionService.getDataPermissions(pool, 2);
      expect(result).toHaveLength(1);
      expect(pool.query).toHaveBeenCalledTimes(1);

      await permissionService.getDataPermissions(pool, 2);
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it('缓存命中时应直接返回', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ module: 'customer', data_scope: 'self' }]]);

      await permissionService.getDataPermissions(pool, 2);
      const result = await permissionService.getDataPermissions(pool, 2);
      expect(result).toHaveLength(1);
    });
  });

  describe('getUserDirectPermissions', () => {
    it('应返回用户直接权限', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1, code: 'x', name: 'X', type: 'menu' }]]);

      const result = await permissionService.getUserDirectPermissions(pool, 1);
      expect(result).toHaveLength(1);
    });
  });

  describe('addUserPermission', () => {
    it('应插入并清缓存', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await permissionService.addUserPermission(pool, 1, 2);
      expect(result).toBe(true);
    });

    it('失败时应记录日志并抛错', async () => {
      const pool = createMockPool();
      pool.query.mockRejectedValueOnce(new Error('db'));

      await expect(permissionService.addUserPermission(pool, 1, 2)).rejects.toThrow('db');
    });
  });

  describe('removeUserPermission', () => {
    it('应删除并清缓存', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await permissionService.removeUserPermission(pool, 1, 2);
      expect(result).toBe(true);
    });
  });

  describe('setUserPermissions', () => {
    it('应删除旧权限并插入新权限', async () => {
      const pool = createMockPool();
      const conn = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: jest.fn() };
      conn.query.mockResolvedValue([{}]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await permissionService.setUserPermissions(pool, 1, [2, 3]);
      expect(result).toBe(true);
      expect(conn.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM crm_user_permission'),
        [1]
      );
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });

    it('permissionIds 为空时应只删除', async () => {
      const pool = createMockPool();
      const conn = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: jest.fn() };
      conn.query.mockResolvedValue([{}]);
      pool.getConnection.mockResolvedValue(conn);

      await permissionService.setUserPermissions(pool, 1, []);
      expect(conn.query).toHaveBeenCalledTimes(1);
    });

    it('异常时应回滚', async () => {
      const pool = createMockPool();
      const conn = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: jest.fn() };
      conn.query.mockRejectedValue(new Error('db'));
      pool.getConnection.mockResolvedValue(conn);

      await expect(permissionService.setUserPermissions(pool, 1, [2])).rejects.toThrow('db');
      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });
  });
});
