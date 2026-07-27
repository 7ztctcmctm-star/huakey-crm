/**
 * queue 工具单元测试（Redis 可用场景）
 */
const mockRedis = {
  lpush: jest.fn().mockResolvedValue(1),
  rpop: jest.fn(),
  lrange: jest.fn()
};

jest.mock('../../config/redis', () => ({
  redis: mockRedis,
  REDIS_ENABLED: true
}));

jest.mock('../../config/logger', () => ({
  error: jest.fn(),
  info: jest.fn()
}));

const { enqueue, processBatch, getDeadLetters, DEAD_LETTER_KEY } = require('../../utils/queue');

describe('queue', () => {
  beforeEach(() => {
    mockRedis.lpush.mockClear();
    mockRedis.rpop.mockClear();
    mockRedis.lrange.mockClear();
  });

  describe('enqueue', () => {
    it('应将任务序列化后推入队列', async () => {
      const result = await enqueue('customer_import', { ids: [1, 2] }, 5);
      expect(result.queued).toBe(true);
      expect(mockRedis.lpush).toHaveBeenCalledTimes(1);
      const job = JSON.parse(mockRedis.lpush.mock.calls[0][1]);
      expect(job.type).toBe('customer_import');
      expect(job.userId).toBe(5);
    });
  });

  describe('processBatch', () => {
    it('空队列时应直接返回', async () => {
      mockRedis.rpop.mockResolvedValue(null);
      const handler = jest.fn();
      await processBatch({}, handler);
      expect(handler).not.toHaveBeenCalled();
    });

    it('应处理所有任务并在失败时写入死信队列', async () => {
      const jobs = [
        JSON.stringify({ type: 'a', payload: {}, userId: 1 }),
        JSON.stringify({ type: 'b', payload: {}, userId: 2 })
      ];
      mockRedis.rpop
        .mockResolvedValueOnce(jobs[0])
        .mockResolvedValueOnce(jobs[1])
        .mockResolvedValueOnce(null);

      const handler = jest.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('fail'));

      await processBatch({}, handler);
      expect(handler).toHaveBeenCalledTimes(2);
      expect(mockRedis.lpush).toHaveBeenCalled();
      const deadCall = mockRedis.lpush.mock.calls.find(c => c[0] === DEAD_LETTER_KEY);
      expect(deadCall).toBeDefined();
      const deadJob = JSON.parse(deadCall[1]);
      expect(deadJob.error).toBe('fail');
    });
  });

  describe('getDeadLetters', () => {
    it('应解析死信队列 JSON', async () => {
      mockRedis.lrange.mockResolvedValue([
        JSON.stringify({ type: 'a' }),
        'invalid-json'
      ]);
      const result = await getDeadLetters(10);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('a');
      expect(result[1]).toBe('invalid-json');
      expect(mockRedis.lrange).toHaveBeenCalledWith(DEAD_LETTER_KEY, 0, 9);
    });
  });
});
