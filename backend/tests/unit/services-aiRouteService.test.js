/**
 * aiRouteService 单元测试
 */

const aiRouteService = require('../../services/aiRouteService');

jest.mock('../../utils/llmClient', () => ({
  getProviderStatus: jest.fn()
}));

function createMockPool() {
  return { query: jest.fn() };
}

describe('aiRouteService', () => {
  describe('getAiStatus', () => {
    it('应返回 llmClient 状态', async () => {
      const { getProviderStatus } = require('../../utils/llmClient');
      getProviderStatus.mockResolvedValue({ online: true, provider: 'ollama' });

      const result = await aiRouteService.getAiStatus();
      expect(result.online).toBe(true);
    });
  });

  describe('getAiSuggestions', () => {
    it('未传 type 时应返回列表', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 1, type: 'follow_up', ref_id: 10, create_by: 2 }]]);
      pool.query.mockResolvedValueOnce([[{ id: 10, company_name: 'A' }]]);

      const result = await aiRouteService.getAiSuggestions(pool, { page: 1, pageSize: 10 });
      expect(result.total).toBe(1);
      expect(result.list[0].ref_name).toBe('A');
    });

    it('传入 type 时应追加过滤', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]);

      await aiRouteService.getAiSuggestions(pool, { type: 'opportunity' });
      expect(pool.query.mock.calls[0][0]).toContain('s.type = ?');
      expect(pool.query.mock.calls[0][1]).toEqual(['opportunity']);
    });

    it('customer 类型应查询客户名', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 1, type: 'customer', ref_id: 5 }]]);
      pool.query.mockResolvedValueOnce([[{ id: 5, company_name: 'Cust' }]]);

      const result = await aiRouteService.getAiSuggestions(pool, {});
      expect(result.list[0].ref_name).toBe('Cust');
    });

    it('opportunity 类型缺失时应返回未知商机', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 1, type: 'opportunity', ref_id: 5 }]]);
      pool.query.mockResolvedValueOnce([[]]);

      const result = await aiRouteService.getAiSuggestions(pool, {});
      expect(result.list[0].ref_name).toBe('未知商机');
    });
  });

  describe('submitFeedback', () => {
    it('两个字段都更新', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await aiRouteService.submitFeedback(pool, 1, true, 'good');
      expect(result.success).toBe(true);
      expect(pool.query.mock.calls[0][0]).toContain('is_accepted = ?');
      expect(pool.query.mock.calls[0][0]).toContain('feedback = ?');
    });

    it('无字段时应返回错误', async () => {
      const pool = createMockPool();
      const result = await aiRouteService.submitFeedback(pool, 1);
      expect(result.error).toBe('没有要更新的字段');
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe('generateSuggestions', () => {
    it('应创建跟进建议', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, company_name: 'A', last_follow_time: null, overdue_days: 35 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      pool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      const result = await aiRouteService.generateSuggestions(pool, 1);
      expect(result.created).toBe(1);
    });

    it('24 小时内已存在建议时应跳过', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, company_name: 'A', last_follow_time: null, overdue_days: 35 }]])
        .mockResolvedValueOnce([[{ ref_id: 1 }]]);
      pool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      const result = await aiRouteService.generateSuggestions(pool, 1);
      expect(result.created).toBe(0);
    });
  });

  describe('executeReadOnlyQuery', () => {
    it('应返回查询结果', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1 }]]);

      const result = await aiRouteService.executeReadOnlyQuery(pool, 'SELECT 1');
      expect(result).toEqual([{ id: 1 }]);
    });
  });
});
