/**
 * leadsService 单元测试
 */

const leadsService = require('../../services/leadsService');
const ROLES = require('../../config/roles');

function createMockPool() {
  return { query: jest.fn(), getConnection: jest.fn() };
}

function createMockConn() {
  return {
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
    query: jest.fn()
  };
}

describe('leadsService', () => {
  describe('buildLeadsPermissionClause', () => {
    it('SALES 角色应返回本部门子句', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ dept_id: 10 }]])
        .mockResolvedValueOnce([[{ id: 2 }, { id: 3 }]]);

      const result = await leadsService.buildLeadsPermissionClause(pool, { userId: 1, roleId: ROLES.SALES });
      expect(result.params).toEqual([1, 2, 3]);
    });

    it('SALES 无部门时应只返回自己', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ dept_id: null }]]);

      const result = await leadsService.buildLeadsPermissionClause(pool, { userId: 1, roleId: ROLES.SALES });
      expect(result.params).toEqual([1]);
    });

    it('ADMIN/MANAGER/manageAll 应返回 1=1', async () => {
      const pool = createMockPool();
      let result = await leadsService.buildLeadsPermissionClause(pool, { userId: 1, roleId: ROLES.ADMIN });
      expect(result.clause).toBe('1=1');

      result = await leadsService.buildLeadsPermissionClause(pool, { userId: 1, roleId: ROLES.MANAGER });
      expect(result.clause).toBe('1=1');

      result = await leadsService.buildLeadsPermissionClause(pool, { userId: 1, roleId: 99, manageAll: true });
      expect(result.clause).toBe('1=1');
    });

    it('其他角色应返回自己或公海', async () => {
      const pool = createMockPool();
      const result = await leadsService.buildLeadsPermissionClause(pool, { userId: 1, roleId: ROLES.HR });
      expect(result.params).toEqual([1]);
    });
  });

  describe('getLeadsList', () => {
    it('应返回列表和总数', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 1, company_name: 'A' }]]);

      const result = await leadsService.getLeadsList(pool, {}, { userId: 1, roleId: ROLES.ADMIN });
      expect(result.list).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('应支持 owner_id 和各类筛选', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]);

      await leadsService.getLeadsList(pool, {
        owner_id: 2, company_name: 'A', contact_name: 'B', phone: '1', source: 'web', lead_level: 'A', follow_status: 'new'
      }, { userId: 1, roleId: ROLES.ADMIN });
      const countSql = pool.query.mock.calls[0][0];
      expect(countSql).toContain('c.owner_id = ?');
      expect(countSql).toContain('c.company_name LIKE ?');
      expect(countSql).toContain('c.source = ?');
    });

    it('source 在 sourceParentMap 中时应使用 IN', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]);

      await leadsService.getLeadsList(pool, { source: 'online' }, { userId: 1, roleId: ROLES.ADMIN }, { online: ['seo', 'ads'] });
      expect(pool.query.mock.calls[0][0]).toContain('c.source IN (?,?)');
    });
  });

  describe('convertLead', () => {
    it('应更新 owner_id 并提交', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      conn.query
        .mockResolvedValueOnce([[{ id: 1, company_name: 'A', owner_id: null }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await leadsService.convertLead(pool, 1, 2);
      expect(result.company_name).toBe('A');
      expect(conn.commit).toHaveBeenCalled();
    });

    it('线索不存在时应抛 404', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      conn.query.mockResolvedValueOnce([[]]);
      pool.getConnection.mockResolvedValue(conn);

      await expect(leadsService.convertLead(pool, 1, 2)).rejects.toThrow('线索不存在或已分配');
    });

    it('异常时应回滚', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      conn.query.mockRejectedValueOnce(new Error('db'));
      pool.getConnection.mockResolvedValue(conn);

      await expect(leadsService.convertLead(pool, 1, 2)).rejects.toThrow('db');
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  describe('batchConvert', () => {
    it('应统计成功和失败', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      conn.query
        .mockResolvedValueOnce([[{ id: 1, company_name: 'A', owner_id: null }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await leadsService.batchConvert(pool, [1, 2]);
      expect(result.converted).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('importLeads', () => {
    it('应导入线索并插入联系人', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      conn.query
        .mockResolvedValueOnce([{ insertId: 10 }])
        .mockResolvedValueOnce([{ insertId: 100 }]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await leadsService.importLeads(pool, [{ company_name: 'A', contact_name: 'B', phone: '138' }], 1);
      expect(result.imported).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('无联系人时不插入', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      conn.query.mockResolvedValueOnce([{ insertId: 10 }]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await leadsService.importLeads(pool, [{ company_name: 'A' }], 1);
      expect(result.imported).toBe(1);
    });

    it('失败时应记录错误', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      conn.query.mockRejectedValueOnce(new Error('dup'));
      pool.getConnection.mockResolvedValue(conn);

      const result = await leadsService.importLeads(pool, [{ company_name: 'A' }], 1);
      expect(result.imported).toBe(0);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('claimLead', () => {
    it('应更新 owner_id 和 dept_id', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, company_name: 'A' }]])
        .mockResolvedValueOnce([[{ dept_id: 5 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await leadsService.claimLead(pool, 1, 2);
      expect(result.company_name).toBe('A');
    });

    it('不存在时应抛 404', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);

      await expect(leadsService.claimLead(pool, 1, 2)).rejects.toThrow('线索不存在或已被领取');
    });
  });

  describe('markLeadLost', () => {
    it('应更新状态', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await leadsService.markLeadLost(pool, 1, 2);
    });

    it('不存在时应抛 404', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);

      await expect(leadsService.markLeadLost(pool, 1, 2)).rejects.toThrow('线索不存在或无权操作');
    });
  });

  describe('getLeadsStats', () => {
    it('应返回统计数据', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ cnt: 10 }]])
        .mockResolvedValueOnce([[{ cnt: 2 }]])
        .mockResolvedValueOnce([[{ cnt: 3 }]]);

      const result = await leadsService.getLeadsStats(pool, { userId: 1, roleId: ROLES.ADMIN });
      expect(result.total).toBe(10);
      expect(result.week_new).toBe(2);
      expect(result.month_converted).toBe(3);
    });
  });
});
