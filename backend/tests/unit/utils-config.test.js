/**
 * config 工具单元测试
 */
const mockPool = { query: jest.fn() };

jest.mock('../../config/database', () => mockPool);

const {
  getConfig,
  getOverdueDays,
  isFollowupReminderEnabled,
  getNearRecycleDays,
  getRecycleDays,
  clearConfigCache
} = require('../../utils/config');

describe('utils/config', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
    clearConfigCache();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getConfig', () => {
    it('缓存命中时应直接返回缓存值', async () => {
      mockPool.query.mockResolvedValueOnce([[{ config_value: '20' }]]);
      await getConfig('overdue_days');
      const result = await getConfig('overdue_days');
      expect(result).toBe('20');
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('缓存过期后应重新查询', async () => {
      mockPool.query
        .mockResolvedValueOnce([[{ config_value: '10' }]])
        .mockResolvedValueOnce([[{ config_value: '20' }]]);

      await getConfig('overdue_days');
      jest.advanceTimersByTime(61 * 1000);
      const result = await getConfig('overdue_days');
      expect(result).toBe('20');
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('无记录时应返回默认值', async () => {
      mockPool.query.mockResolvedValueOnce([[]]);
      const result = await getConfig('missing_key', 'default');
      expect(result).toBe('default');
    });
  });

  describe('便捷函数', () => {
    it('getOverdueDays 应返回整数', async () => {
      mockPool.query.mockResolvedValueOnce([[{ config_value: '30' }]]);
      const days = await getOverdueDays();
      expect(days).toBe(30);
    });

    it('getOverdueDays 解析失败时使用默认值 15', async () => {
      mockPool.query.mockResolvedValueOnce([[{ config_value: 'abc' }]]);
      const days = await getOverdueDays();
      expect(days).toBe(15);
    });

    it('isFollowupReminderEnabled 应解析 0/1', async () => {
      mockPool.query.mockResolvedValueOnce([[{ config_value: '0' }]]);
      expect(await isFollowupReminderEnabled()).toBe(false);
      clearConfigCache();
      mockPool.query.mockResolvedValueOnce([[{ config_value: '1' }]]);
      expect(await isFollowupReminderEnabled()).toBe(true);
    });

    it('getNearRecycleDays 解析失败时使用默认值 7', async () => {
      mockPool.query.mockResolvedValueOnce([[{ config_value: null }]]);
      expect(await getNearRecycleDays()).toBe(7);
    });

    it('getRecycleDays 解析失败时使用默认值 15', async () => {
      mockPool.query.mockResolvedValueOnce([[{ config_value: '' }]]);
      expect(await getRecycleDays()).toBe(15);
    });
  });
});
