/**
 * assignService 单元测试
 */

const assignService = require('../../services/assignService');
const { CUSTOMER_STATUS } = require('../../constants/customerStatus');
const { BUSINESS_STATUS } = require('../../constants/poolStatus');

function createMockPool() {
  return { query: jest.fn(), getConnection: jest.fn() };
}

/**
 * [H-002 回归修复] 按 SQL 内容路由的 pool mock。
 *
 * 背景：manualAssign/batchAssign 在开头新增了 validateTargetUser() 查询，
 * 原先按序的 mockResolvedValueOnce 会整体错位一格，导致 500。
 * 此处改为根据 SQL 文本匹配，新��查询插入不会再打破既有断言。
 *
 * @param {Array<{match: string|RegExp, result: any}>} routes
 */
function createRoutedPool(routes) {
  const pool = createMockPool();
  pool.query.mockImplementation((sql) => {
    const text = String(sql);
    for (const r of routes) {
      if (typeof r.match === 'string' ? text.includes(r.match) : r.match.test(text)) {
        return Promise.resolve(r.result);
      }
    }
    throw new Error('未匹配的 SQL: ' + text.slice(0, 120));
  });
  return pool;
}

/** validateTargetUser 的标准返回：该用户是有效在职业务人员 */
const VALID_TARGET_USER = [[{ id: 2 }]];

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
      const pool = createRoutedPool([
        { match: 'FROM sys_user', result: VALID_TARGET_USER },
        { match: 'FROM crm_customer', result: [[]] }
      ]);

      const result = await assignService.manualAssign(pool, 1, 2, 3, 'r');
      expect(result.code).toBe(404);
    });

    it('分配时应更新 pool_status=0', async () => {
      const pool = createRoutedPool([
        { match: 'FROM sys_user', result: VALID_TARGET_USER },
        { match: 'FROM crm_customer', result: [[{ id: 1, owner_id: null, company_name: 'A' }]] },
        { match: 'UPDATE crm_customer', result: [{ affectedRows: 1 }] },
        { match: 'INSERT INTO crm_assign_log', result: [{ insertId: 1 }] }
      ]);

      const result = await assignService.manualAssign(pool, 1, 2, 3, 'r');
      expect(result.code).toBe(200);
      expect(result.message).toBe('分配成功');
      const updateCall = pool.query.mock.calls.find(c => String(c[0]).includes('UPDATE crm_customer'));
      expect(updateCall[0]).not.toContain(', status = ?');
    });

    it('回收时(pool_status=1)应更新状态为 sea 并同步 business_status=following', async () => {
      const pool = createRoutedPool([
        { match: 'FROM crm_customer', result: [[{ id: 1, owner_id: 2, company_name: 'A' }]] },
        { match: 'UPDATE crm_customer', result: [{ affectedRows: 1 }] },
        { match: 'INSERT INTO crm_assign_log', result: [{ insertId: 1 }] }
      ]);

      // toUserId=null → validateTargetUser 直接 return，不发起 sys_user 查询
      const result = await assignService.manualAssign(pool, 1, null, 3, 'r');
      expect(result.message).toBe('已回收为待分配');
      const updateCall = pool.query.mock.calls.find(c => String(c[0]).includes('UPDATE crm_customer'));
      const updateSql = updateCall[0];
      const updateParams = updateCall[1];
      expect(updateSql).toContain('status = ?');
      expect(updateSql).toContain('business_status = ?');
      expect(updateParams).toContain(CUSTOMER_STATUS.SEA);
      expect(updateParams).toContain(BUSINESS_STATUS.FOLLOWING);
    });

    // [H-002] 新增安全校验的回归测试
    it('[H-002] 目标用户非在职业务角色时应拒绝分配', async () => {
      const pool = createRoutedPool([
        { match: 'FROM sys_user', result: [[]] } // 无匹配行 → 校验失败
      ]);

      await expect(assignService.manualAssign(pool, 1, 999, 3, 'r'))
        .rejects.toThrow('目标用户不是有效的在职业务人员');
      // 校验失败时不应触碰客户表
      expect(pool.query.mock.calls.some(c => String(c[0]).includes('FROM crm_customer'))).toBe(false);
    });

    it('[H-002] 非 manageAll 操作者不得分配他人客户', async () => {
      const pool = createRoutedPool([
        { match: 'FROM sys_user', result: VALID_TARGET_USER },
        { match: 'FROM crm_customer', result: [[{ id: 1, owner_id: 77, company_name: 'A' }]] }
      ]);

      await expect(assignService.manualAssign(pool, 1, 2, 3, 'r', { manageAll: false }))
        .rejects.toThrow('无权分配不属于自己的客户');
    });

    it('[H-002] manageAll 操作者可分配他人客户', async () => {
      const pool = createRoutedPool([
        { match: 'FROM sys_user', result: VALID_TARGET_USER },
        { match: 'FROM crm_customer', result: [[{ id: 1, owner_id: 77, company_name: 'A' }]] },
        { match: 'UPDATE crm_customer', result: [{ affectedRows: 1 }] },
        { match: 'INSERT INTO crm_assign_log', result: [{ insertId: 1 }] }
      ]);

      const result = await assignService.manualAssign(pool, 1, 2, 3, 'r', { manageAll: true });
      expect(result.code).toBe(200);
    });

    it('[H-002] 无 operatorUser 时保持向后兼容（不做归属拦截）', async () => {
      const pool = createRoutedPool([
        { match: 'FROM sys_user', result: VALID_TARGET_USER },
        { match: 'FROM crm_customer', result: [[{ id: 1, owner_id: 77, company_name: 'A' }]] },
        { match: 'UPDATE crm_customer', result: [{ affectedRows: 1 }] },
        { match: 'INSERT INTO crm_assign_log', result: [{ insertId: 1 }] }
      ]);

      const result = await assignService.manualAssign(pool, 1, 2, 3, 'r');
      expect(result.code).toBe(200);
    });
  });

  describe('batchAssign', () => {
    it('应批量分配', async () => {
      const conn = createMockConn();
      let customerQueryCount = 0;
      conn.query.mockImplementation((sql) => {
        const text = String(sql);
        if (text.includes('FROM crm_customer')) {
          // 第 1 次查到客户，第 2 次（customerId=2）查不到 → 只成功 1 条
          customerQueryCount += 1;
          return Promise.resolve(
            customerQueryCount === 1 ? [[{ id: 1, company_name: 'A', owner_id: null }]] : [[]]
          );
        }
        if (text.includes('UPDATE crm_customer')) return Promise.resolve([{ affectedRows: 1 }]);
        if (text.includes('INSERT INTO crm_assign_log')) return Promise.resolve([{ insertId: 1 }]);
        throw new Error('未匹配的 SQL: ' + text.slice(0, 120));
      });
      const pool = createRoutedPool([{ match: 'FROM sys_user', result: VALID_TARGET_USER }]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await assignService.batchAssign(pool, [1, 2], 10, 3, 'r');
      expect(result.count).toBe(1);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('回收时应更新状态并同步 business_status', async () => {
      const conn = createMockConn();
      conn.query.mockImplementation((sql) => {
        const text = String(sql);
        if (text.includes('FROM crm_customer')) return Promise.resolve([[{ id: 1, company_name: 'A', owner_id: 2 }]]);
        if (text.includes('UPDATE crm_customer')) return Promise.resolve([{ affectedRows: 1 }]);
        if (text.includes('INSERT INTO crm_assign_log')) return Promise.resolve([{ insertId: 1 }]);
        throw new Error('未匹配的 SQL: ' + text.slice(0, 120));
      });
      const pool = createMockPool();
      pool.getConnection.mockResolvedValue(conn);

      // toUserId=null → 不校验目标用户
      await assignService.batchAssign(pool, [1], null, 3, 'r');
      const updateCall = conn.query.mock.calls.find(c => String(c[0]).includes('UPDATE crm_customer'));
      const updateSql = updateCall[0];
      const updateParams = updateCall[1];
      expect(updateSql).toContain('status = ?');
      expect(updateSql).toContain('business_status = ?');
      expect(updateParams).toContain(CUSTOMER_STATUS.SEA);
      expect(updateParams).toContain(BUSINESS_STATUS.FOLLOWING);
    });

    it('异常时应回滚', async () => {
      const conn = createMockConn();
      conn.query.mockRejectedValueOnce(new Error('db'));
      const pool = createRoutedPool([{ match: 'FROM sys_user', result: VALID_TARGET_USER }]);
      pool.getConnection.mockResolvedValue(conn);

      await expect(assignService.batchAssign(pool, [1], 10, 3, 'r')).rejects.toThrow('db');
      expect(conn.rollback).toHaveBeenCalled();
    });

    // [H-002] 新增安全校验的回归测试
    it('[H-002] 目标用户非在职业务角色时应拒绝且不开事务', async () => {
      const pool = createRoutedPool([{ match: 'FROM sys_user', result: [[]] }]);

      await expect(assignService.batchAssign(pool, [1], 999, 3, 'r'))
        .rejects.toThrow('目标用户不是有效的在职业务人员');
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    it('[H-002] 非 manageAll 时静默跳过他人客户（不中断整批）', async () => {
      const conn = createMockConn();
      conn.query.mockImplementation((sql) => {
        const text = String(sql);
        // 两个客户都归属他人（owner_id=77），operatorId=3
        if (text.includes('FROM crm_customer')) return Promise.resolve([[{ id: 1, company_name: 'A', owner_id: 77 }]]);
        if (text.includes('UPDATE crm_customer')) return Promise.resolve([{ affectedRows: 1 }]);
        if (text.includes('INSERT INTO crm_assign_log')) return Promise.resolve([{ insertId: 1 }]);
        throw new Error('未匹配的 SQL: ' + text.slice(0, 120));
      });
      const pool = createRoutedPool([{ match: 'FROM sys_user', result: VALID_TARGET_USER }]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await assignService.batchAssign(pool, [1], 10, 3, 'r', { manageAll: false });
      expect(result.count).toBe(0); // 跳过，但仍正常提交事务
      expect(conn.commit).toHaveBeenCalled();
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
