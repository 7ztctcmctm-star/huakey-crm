/**
 * assignService 单元测试
 */

const assignService = require('../../services/assignService');
const { CUSTOMER_STATUS } = require('../../constants/customerStatus');

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

describe('assignService', () => {
  describe('getAssignRules', () => {
    it('应返回规则列表', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1 }]]);

      const result = await assignService.getAssignRules(pool);
      expect(result).toHaveLength(1);
    });
  });

  describe('createRule', () => {
    it('应插入规则', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([{ insertId: 5 }]);

      const id = await assignService.createRule(pool, { rule_name: 'r', assign_type: 'round_robin', user_ids: [1, 2], priority: 1 });
      expect(id).toBe(5);
    });
  });

  describe('updateRule', () => {
    it('应动态更新字段', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const rows = await assignService.updateRule(pool, 1, { rule_name: 'new', is_active: 0 });
      expect(rows).toBe(1);
      expect(pool.query.mock.calls[0][0]).toContain('rule_name = ?');
      expect(pool.query.mock.calls[0][0]).toContain('is_active = ?');
    });

    it('无字段时应返回 0', async () => {
      const pool = createMockPool();
      const rows = await assignService.updateRule(pool, 1, {});
      expect(rows).toBe(0);
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe('deleteRule', () => {
    it('应删除规则', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const rows = await assignService.deleteRule(pool, 1);
      expect(rows).toBe(1);
    });
  });

  describe('applyRule', () => {
    it('无客户时应返回提示', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      conn.query.mockResolvedValueOnce([[]]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await assignService.applyRule(pool, 1);
      expect(result.message).toBe('没有可分配的客户');
    });

    it('无销售时应返回提示', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      conn.query
        .mockResolvedValueOnce([[{ id: 1, owner_id: null }]])
        .mockResolvedValueOnce([[]]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await assignService.applyRule(pool, 1);
      expect(result.message).toBe('没有可用的销售人员');
    });

    it('应轮询分配客户', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      conn.query
        .mockResolvedValueOnce([[{ id: 1, owner_id: null }, { id: 2, owner_id: null }]])
        .mockResolvedValueOnce([[{ id: 10 }, { id: 11 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ insertId: 100 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ insertId: 101 }]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await assignService.applyRule(pool, 1);
      expect(result.count).toBe(2);
      expect(result.sales_count).toBe(2);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('异常时应回滚', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      conn.query.mockRejectedValueOnce(new Error('db'));
      pool.getConnection.mockResolvedValue(conn);

      await expect(assignService.applyRule(pool, 1)).rejects.toThrow('db');
      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });
  });

  describe('autoAssignOwner', () => {
    it('无规则时返回 null', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);

      const result = await assignService.autoAssignOwner(pool, { source: 'web' });
      expect(result).toBeNull();
    });

    it('round_robin 规则应返回用户', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, assign_type: 'round_robin', user_ids: '[10,20]', last_assigned_index: 0 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await assignService.autoAssignOwner(pool, { source: 'web' });
      expect(result).toBe(20);
    });

    it('by_source 匹配应返回用户', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, assign_type: 'by_source', source_value: 'web', user_ids: '[10]', last_assigned_index: 0 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await assignService.autoAssignOwner(pool, { source: 'web' });
      expect(result).toBe(10);
    });

    it('by_region 匹配应返回用户', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, assign_type: 'by_region', region_value: '上海', user_ids: '[10]', last_assigned_index: -1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await assignService.autoAssignOwner(pool, { address: '上海市浦东新区' });
      expect(result).toBe(10);
    });

    it('user_ids 为空数组时应跳过', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1, assign_type: 'round_robin', user_ids: '[]', last_assigned_index: 0 }]]);

      const result = await assignService.autoAssignOwner(pool, {});
      expect(result).toBeNull();
    });

    it('user_ids 解析失败时应继续', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1, assign_type: 'round_robin', user_ids: 'invalid', last_assigned_index: 0 }]]);

      const result = await assignService.autoAssignOwner(pool, {});
      expect(result).toBeNull();
    });
  });

  describe('manualAssign', () => {
    it('客户不存在时应返回 404', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);

      const result = await assignService.manualAssign(pool, 1, 2, 3, 'r');
      expect(result.code).toBe(404);
    });

    it('分配时应更新 pool_status=0', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, owner_id: null, company_name: 'A' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ insertId: 1 }]);

      const result = await assignService.manualAssign(pool, 1, 2, 3, 'r');
      expect(result.code).toBe(200);
      expect(result.message).toBe('分配成功');
      expect(pool.query.mock.calls[1][0]).not.toContain(', status = ?');
    });

    it('回收时(pool_status=1)应更新状态为 sea', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, owner_id: 2, company_name: 'A' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ insertId: 1 }]);

      const result = await assignService.manualAssign(pool, 1, null, 3, 'r');
      expect(result.message).toBe('已回收为待分配');
      const updateParams = pool.query.mock.calls[1][1];
      expect(updateParams).toContain(CUSTOMER_STATUS.SEA);
    });
  });

  describe('batchAssign', () => {
    it('应批量分配', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      conn.query
        .mockResolvedValueOnce([[{ id: 1, company_name: 'A', owner_id: null }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([[]]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await assignService.batchAssign(pool, [1, 2], 10, 3, 'r');
      expect(result.count).toBe(1);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('回收时应更新状态', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      conn.query
        .mockResolvedValueOnce([[{ id: 1, company_name: 'A', owner_id: 2 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ insertId: 1 }]);
      pool.getConnection.mockResolvedValue(conn);

      await assignService.batchAssign(pool, [1], null, 3, 'r');
      expect(conn.query.mock.calls[1][0]).toContain('status = ?');
    });

    it('异常时应回滚', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      conn.query.mockRejectedValueOnce(new Error('db'));
      pool.getConnection.mockResolvedValue(conn);

      await expect(assignService.batchAssign(pool, [1], 10, 3, 'r')).rejects.toThrow('db');
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  describe('getAssignLogs', () => {
    it('应返回分页日志', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 1 }]]);

      const result = await assignService.getAssignLogs(pool, { customer_id: 1 });
      expect(result.total).toBe(1);
      expect(pool.query.mock.calls[0][0]).toContain('al.customer_id = ?');
    });
  });

  describe('getSalesUsers', () => {
    it('应返回销售用户', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1, real_name: 'S' }]]);

      const result = await assignService.getSalesUsers(pool);
      expect(result).toHaveLength(1);
    });
  });

  describe('getMySubordinates', () => {
    it('应返回下属', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 2, real_name: 'U' }]]);

      const result = await assignService.getMySubordinates(pool, 1);
      expect(result).toHaveLength(1);
    });
  });
});
