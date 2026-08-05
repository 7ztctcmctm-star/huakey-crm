/**
 * cronService 单元测试
 */

const cronService = require('../../services/cronService');

jest.mock('../../utils/config', () => ({
  getRecycleDays: jest.fn().mockResolvedValue(30),
  getNearRecycleDays: jest.fn().mockResolvedValue(25)
}));

jest.mock('../../utils/notification', () => ({
  sendMarkdown: jest.fn().mockResolvedValue({})
}));

jest.mock('../../utils/sseManager', () => ({
  send: jest.fn()
}));

jest.mock('../../config/logger', () => ({
  error: jest.fn()
}));

function createMockPool() {
  return {
    query: jest.fn(),
    getConnection: jest.fn()
  };
}

function createMockConnection() {
  return {
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
    query: jest.fn()
  };
}

describe('cronService', () => {
  describe('cleanExpiredLogs', () => {
    it('应返回删除行数', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([{ affectedRows: 5 }]);

      const result = await cronService.cleanExpiredLogs(pool, 30);
      expect(result).toBe(5);
      expect(pool.query).toHaveBeenCalledWith(
        'DELETE FROM sys_log WHERE create_time < NOW() - INTERVAL ? DAY',
        [30]
      );
    });

    it('应使用默认天数 90', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

      await cronService.cleanExpiredLogs(pool);
      expect(pool.query.mock.calls[0][1]).toEqual([90]);
    });
  });

  describe('getNearRecycleCustomers', () => {
    it('应返回客户列表并使用传入阈值', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1, company_name: 'A' }]]);

      const result = await cronService.getNearRecycleCustomers(pool, 20);
      expect(result).toHaveLength(1);
      // 097 迁移后 pool_status 为 VARCHAR('private')，参数首位为 POOL_STATUS.PRIVATE
      expect(pool.query.mock.calls[0][1]).toEqual(['private', 20, 20]);
    });

    it('未传入阈值时应读取配置', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);

      await cronService.getNearRecycleCustomers(pool);
      expect(pool.query.mock.calls[0][1]).toEqual(['private', 25, 25]);
    });
  });

  describe('notifyPreReleaseCustomers', () => {
    it('preReleaseDays <= 0 时应直接返回 0', async () => {
      const pool = createMockPool();
      const result = await cronService.notifyPreReleaseCustomers(pool, 1);
      expect(result).toBe(0);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('应插入提醒并发送通知', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, company_name: 'A', owner_id: 2, overdue_days: 29, owner_name: 'O' }]])
        .mockResolvedValueOnce([{ insertId: 10 }]);

      const result = await cronService.notifyPreReleaseCustomers(pool, 30);
      expect(result).toBe(1);
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it('插入提醒重复错误应被静默捕获', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, company_name: 'A', owner_id: 2, overdue_days: 29, owner_name: 'O' }]])
        .mockRejectedValueOnce(new Error('Duplicate entry'));

      const result = await cronService.notifyPreReleaseCustomers(pool, 30);
      expect(result).toBe(1);
    });

    it('通知发送失败应记录日志但不抛错', async () => {
      const pool = createMockPool();
      const { sendMarkdown } = require('../../utils/notification');
      sendMarkdown.mockRejectedValueOnce(new Error('send fail'));
      pool.query
        .mockResolvedValueOnce([[{ id: 1, company_name: 'A', owner_id: 2, overdue_days: 29, owner_name: 'O' }]])
        .mockResolvedValueOnce([{ insertId: 10 }]);

      const result = await cronService.notifyPreReleaseCustomers(pool, 30);
      expect(result).toBe(1);
    });
  });

  describe('autoReleaseCustomers', () => {
    it('无客户时应提交并返回 0', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      conn.query.mockResolvedValueOnce([[]]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await cronService.autoReleaseCustomers(pool, 30);
      expect(result).toBe(0);
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });

    it('应更新客户状态并插入日志', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      conn.query
        .mockResolvedValueOnce([[{ id: 1, company_name: 'A', owner_id: 2 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await cronService.autoReleaseCustomers(pool, 30);
      expect(result).toBe(1);
      // 097 迁移后 pool_status 参数化：[POOL_STATUS.SEA, 'sea', ids]
      expect(conn.query).toHaveBeenCalledWith(
        'UPDATE crm_customer SET pool_status = ?, owner_id = NULL, protect_until = NULL, status = ? WHERE id IN (?)',
        ['sea', 'sea', [1]]
      );
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });

    it('异常时应回滚并释放连接', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      conn.query.mockRejectedValueOnce(new Error('db error'));
      pool.getConnection.mockResolvedValue(conn);

      await expect(cronService.autoReleaseCustomers(pool, 30)).rejects.toThrow('db error');
      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });
  });
});
