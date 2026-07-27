/**
 * followUpService 单元测试
 */

const followUpService = require('../../services/followUpService');

jest.mock('../../services/customerService', () => ({
  transitionStatus: jest.fn().mockResolvedValue()
}));

jest.mock('../../config/logger', () => ({
  error: jest.fn()
}));

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

describe('followUpService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addFollowUp', () => {
    it('客户不存在应抛 404', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);

      await expect(followUpService.addFollowUp(pool, { customer_id: 1 }, 1)).rejects.toThrow('客户不存在');
    });

    it('应添加跟进并更新客户状态', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ insertId: 100 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ status: 'sea' }]]);

      const result = await followUpService.addFollowUp(pool, {
        customer_id: 1, contact_id: 2, follow_type: '电话', content: 'c', next_time: '2026-08-01', next_content: 'nc', attachment_ids: [1, 2]
      }, 1);
      expect(result.id).toBe(100);
    });

    it('advance_status=false 时不推进状态', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ insertId: 100 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await followUpService.addFollowUp(pool, { customer_id: 1, content: 'c', advance_status: false }, 1);
      const customerService = require('../../services/customerService');
      expect(customerService.transitionStatus).not.toHaveBeenCalled();
    });

    it('状态推进异常应记录日志不抛错', async () => {
      const pool = createMockPool();
      const customerService = require('../../services/customerService');
      customerService.transitionStatus.mockRejectedValueOnce(new Error('trans error'));
      pool.query
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ insertId: 100 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ status: 'new' }]]);

      const result = await followUpService.addFollowUp(pool, { customer_id: 1, content: 'c' }, 1);
      expect(result.id).toBe(100);
    });
  });

  describe('batchAddFollowUp', () => {
    it('应跳过无效项并提交', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      conn.query.mockResolvedValue([{ affectedRows: 1 }]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await followUpService.batchAddFollowUp(pool, [
        { customer_id: 1, content: 'a' },
        { customer_id: null, content: 'b' },
        { customer_id: 2, content: 'c' }
      ], 1);
      expect(result.count).toBe(3);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('异常应回滚', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      conn.query.mockRejectedValueOnce(new Error('db'));
      pool.getConnection.mockResolvedValue(conn);

      await expect(followUpService.batchAddFollowUp(pool, [{ customer_id: 1, content: 'a' }], 1)).rejects.toThrow('db');
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  describe('listFollowUps', () => {
    it('应返回分页列表', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 5 }]])
        .mockResolvedValueOnce([[{ id: 1 }]]);

      const result = await followUpService.listFollowUps(pool, { customer_id: 1, page: 2, pageSize: 10 }, { clause: '1=1', params: [] });
      expect(result.total).toBe(5);
      expect(result.page).toBe(2);
    });
  });

  describe('今日/明日/逾期提醒', () => {
    it('getTodayRemind 应返回列表', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([[{ id: 1 }]]);
      const result = await followUpService.getTodayRemind(pool, { clause: '1=1', params: [] });
      expect(result.total).toBe(1);
    });

    it('getTomorrowPlan 应返回列表', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([[{ id: 1 }]]);
      const result = await followUpService.getTomorrowPlan(pool, { clause: '1=1', params: [] });
      expect(result.total).toBe(1);
    });

    it('getOverdueList 应返回列表', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([[{ id: 1 }]]);
      const result = await followUpService.getOverdueList(pool, { clause: '1=1', params: [] });
      expect(result.total).toBe(1);
    });
  });

  describe('getTaskStats', () => {
    it('type=all 应不追加权限条件', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([[{ today_count: 1, tomorrow_count: 2, overdue_count: 3 }]]);
      const result = await followUpService.getTaskStats(pool, { type: 'all', userId: 1 });
      expect(result.today_count).toBe(1);
    });

    it('type=dept 且有下属时应 IN 子句', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ dept_id: 2 }]])
        .mockResolvedValueOnce([[{ id: 10 }, { id: 20 }]])
        .mockResolvedValueOnce([[{ today_count: 1, tomorrow_count: 0, overdue_count: 0 }]]);

      const result = await followUpService.getTaskStats(pool, { type: 'dept', userId: 1 });
      const sql = pool.query.mock.calls[2][0];
      expect(sql).toContain('create_by IN (');
      expect(result.today_count).toBe(1);
    });

    it('type=dept 无部门时不修改 permClause', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{}]])
        .mockResolvedValueOnce([[{ today_count: 0, tomorrow_count: 0, overdue_count: 0 }]]);

      await followUpService.getTaskStats(pool, { type: 'dept', userId: 1 });
      expect(pool.query.mock.calls[1][0]).toContain('1=1');
    });

    it('type=custom 应使用自定义部门', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([[{ today_count: 0, tomorrow_count: 0, overdue_count: 0 }]]);

      await followUpService.getTaskStats(pool, { type: 'custom', userId: 1, customDeptIds: '2,3,abc' });
      const params = pool.query.mock.calls[0][1];
      expect(params).toEqual([2, 3, 2, 3]);
    });

    it('type=self 默认应使用 create_by = ?', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([[{ today_count: 0, tomorrow_count: 0, overdue_count: 0 }]]);

      await followUpService.getTaskStats(pool, { type: 'self', userId: 1 });
      expect(pool.query.mock.calls[0][0]).toContain('create_by = ?');
    });
  });

  describe('updateFollowUp', () => {
    it('记录不存在应抛 404', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);
      await expect(followUpService.updateFollowUp(pool, { id: 1 }, {})).rejects.toThrow('跟进记录不存在');
    });

    it('无权限应抛 403', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1, create_by: 1 }]]);
      await expect(followUpService.updateFollowUp(pool, { id: 1 }, { manageAll: false, roleId: 'sales', userId: 2 })).rejects.toThrow('无权编辑该记录');
    });

    it('应更新记录', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1, create_by: 1 }]]);
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      await followUpService.updateFollowUp(pool, { id: 1, content: 'c' }, { manageAll: true });
      expect(pool.query.mock.calls[1][0]).toContain('UPDATE crm_follow_up');
    });
  });

  describe('deleteFollowUp', () => {
    it('不存在应抛 404', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);
      await expect(followUpService.deleteFollowUp(pool, 1, {})).rejects.toThrow('跟进记录不存在');
    });

    it('无权限应抛 403', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1, create_by: 1, customer_id: 5 }]]);
      await expect(followUpService.deleteFollowUp(pool, 1, { manageAll: false, roleId: 'sales', userId: 2 })).rejects.toThrow('无权删除该记录');
    });

    it('应软删除并更新最后跟进时间', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, create_by: 1, customer_id: 5 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ latest_time: '2026-07-20' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await followUpService.deleteFollowUp(pool, 1, { manageAll: true });
      expect(result).toBeUndefined();
    });
  });

  describe('getCalendar', () => {
    it('all 权限应使用 1=1', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([[{ id: 1 }]]);
      const result = await followUpService.getCalendar(pool, { year: 2026, month: 7 }, { type: 'all', userId: 1 });
      expect(result.total).toBe(1);
      expect(pool.query.mock.calls[0][0]).toContain('1=1');
    });

    it('dept 权限应使用 IN 子句', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ dept_id: 2 }]])
        .mockResolvedValueOnce([[{ id: 10 }]])
        .mockResolvedValueOnce([[{ id: 1 }]]);

      await followUpService.getCalendar(pool, { year: 2026, month: 7 }, { type: 'dept', userId: 1 });
      expect(pool.query.mock.calls[2][0]).toContain('f.create_by IN (');
    });

    it('custom 权限应使用子查询', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([[{ id: 1 }]]);

      await followUpService.getCalendar(pool, { year: 2026, month: 7 }, { type: 'custom', userId: 1, customDeptIds: '2' });
      expect(pool.query.mock.calls[0][0]).toContain('dept_id IN (');
    });

    it('self 权限应使用 create_by = ?', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([[{ id: 1 }]]);

      await followUpService.getCalendar(pool, { year: 2026, month: 7 }, { type: 'self', userId: 1 });
      expect(pool.query.mock.calls[0][0]).toContain('f.create_by = ?');
    });
  });

  describe('addPlan', () => {
    it('客户不存在应抛 404', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);
      await expect(followUpService.addPlan(pool, { customer_id: 1 }, 1)).rejects.toThrow('客户不存在');
    });

    it('应添加计划', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ insertId: 200 }]);
      const result = await followUpService.addPlan(pool, { customer_id: 1, contact_id: 2, plan_time: '2026-08-01', plan_content: 'p' }, 1);
      expect(result.id).toBe(200);
    });
  });

  describe('listPlans', () => {
    it('应支持全部筛选条件', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 1 }]]);

      const result = await followUpService.listPlans(pool, {
        customer_id: 1, status: 'pending', start_date: '2026-07-01', end_date: '2026-07-31', page: 1, pageSize: 10
      }, { clause: '1=1', params: [] });
      expect(result.total).toBe(1);
      const sql = pool.query.mock.calls[1][0];
      expect(sql).toContain('f.plan_status = ?');
      expect(sql).toContain('DATE(f.next_time) >= ?');
    });
  });

  describe('completePlan', () => {
    it('计划不存在应抛 404', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);
      await expect(followUpService.completePlan(pool, { id: 1 })).rejects.toThrow('跟进计划不存在');
    });

    it('应完成计划', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, customer_id: 5, create_by: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await followUpService.completePlan(pool, { id: 1, content: 'done', follow_type: '电话' });
      expect(result.id).toBe(1);
    });
  });

  describe('cancelPlan', () => {
    it('计划不存在应抛 404', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);
      await expect(followUpService.cancelPlan(pool, { id: 1 })).rejects.toThrow('跟进计划不存在');
    });

    it('无权限应抛 403', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1, create_by: 1 }]]);
      await expect(followUpService.cancelPlan(pool, { id: 1, roleId: 'sales', userId: 2, manageAll: false })).rejects.toThrow('无权取消该计划');
    });

    it('应取消计划', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, create_by: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      const result = await followUpService.cancelPlan(pool, { id: 1, roleId: 'sales', userId: 1, manageAll: false });
      expect(result.id).toBe(1);
    });
  });
});
