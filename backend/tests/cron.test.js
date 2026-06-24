/**
 * 定时任务模块测试
 * 测试 executeWithRetry 和 logCronRun
 */

const mockPool = {
  query: jest.fn().mockResolvedValue([{}])
};

jest.mock('../config/database', () => mockPool);

// mock node-cron 避免实际调度
jest.mock('node-cron', () => ({
  schedule: jest.fn()
}));

// mock 依赖的工具模块
jest.mock('../utils/scoring', () => ({
  checkAllSuppliersScores: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../utils/qualification-reminder', () => ({
  checkQualificationExpiry: jest.fn().mockResolvedValue(undefined),
  updateQualificationStatus: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../scripts/generate_reminders', () => ({
  generateReminders: jest.fn().mockResolvedValue(undefined)
}));

const { executeWithRetry } = require('../cron/scheduler');
const { logCronRun, createSysCronLogTable } = require('../cron/logger');

describe('定时任务模块', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue([{}]);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
    console.log.mockRestore();
  });

  describe('executeWithRetry', () => {
    it('应该在首次成功时记录 success 日志', async () => {
      const fn = jest.fn().mockResolvedValue(undefined);
      await executeWithRetry(fn, 'test-job', 3);

      expect(fn).toHaveBeenCalledTimes(1);
      // logCronRun 调用: INSERT INTO sys_cron_log
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sys_cron_log'),
        expect.arrayContaining(['test-job', 'success'])
      );
    });

    it('应该在失败后重试并最终成功', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('临时失败'))
        .mockResolvedValue(undefined);

      await executeWithRetry(fn, 'retry-job', 3);

      expect(fn).toHaveBeenCalledTimes(2);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sys_cron_log'),
        expect.arrayContaining(['retry-job', 'success'])
      );
    });

    it('应该在全部重试失败后记录 failed 日志', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('持续失败'));

      await executeWithRetry(fn, 'fail-job', 2);

      expect(fn).toHaveBeenCalledTimes(2);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sys_cron_log'),
        expect.arrayContaining(['fail-job', 'failed', '持续失败'])
      );
    });

    it('关键任务失败时应输出醒目错误', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('关键故障'));

      await executeWithRetry(fn, 'supplier-scoring', 1);

      const errorCalls = console.error.mock.calls.flat().join(' ');
      expect(errorCalls).toContain('关键定时任务');
      expect(errorCalls).toContain('supplier-scoring');
    });

    it('非关键任务失败时不输出醒目错误', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('普通故障'));

      await executeWithRetry(fn, 'log-cleanup', 1);

      const errorCalls = console.error.mock.calls.flat().join(' ');
      expect(errorCalls).not.toContain('关键定时任务');
    });
  });

  describe('logCronRun', () => {
    it('应该正确写入执行日志', async () => {
      const start = new Date('2026-01-01T02:00:00Z');
      const end = new Date('2026-01-01T02:00:05Z');

      await logCronRun('test-job', start, end, 'success');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sys_cron_log'),
        ['test-job', start, end, 'success', null]
      );
    });

    it('应该截断过长的 error_msg', async () => {
      const longError = 'x'.repeat(3000);
      const start = new Date();
      const end = new Date();

      await logCronRun('test-job', start, end, 'failed', longError);

      const callArgs = mockPool.query.mock.calls[0][1];
      expect(callArgs[4].length).toBeLessThanOrEqual(2000);
    });

    it('数据库写入失败时不抛出异常', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB down'));

      await expect(logCronRun('test-job', new Date(), new Date(), 'success'))
        .resolves.not.toThrow();
    });
  });

  describe('createSysCronLogTable', () => {
    it('应该执行 CREATE TABLE IF NOT EXISTS', async () => {
      await createSysCronLogTable();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS sys_cron_log')
      );
    });

    it('建表失败时不抛出异常', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      await expect(createSysCronLogTable()).resolves.not.toThrow();
    });
  });
});
