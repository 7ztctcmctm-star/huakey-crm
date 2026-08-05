/**
 * Opportunity Service 单元测试
 * 覆盖 MVP 范围内的核心逻辑：
 * - FIX-1: createOpportunity 客户状态校验放宽
 * - advanceStage 阶段推进 + change_reason 写入
 * - STAGE_MAP 应用层映射（不落库 stage_code）
 * - getStageLog 含 change_reason 字段
 */

const opportunityService = require('../services/opportunityService');

// Mock 依赖模块（opportunityService 内部 require 了 quoteService / contractService）
jest.mock('../services/quoteService', () => ({ createQuote: jest.fn() }));
jest.mock('../services/contractService', () => ({ createContract: jest.fn() }));
jest.mock('../config/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

// 构造 mock pool
const buildPool = (queryMocks = []) => {
  const query = jest.fn();
  queryMocks.forEach(m => query.mockImplementationOnce(m));
  return { query };
};

describe('opportunityService - MVP 单元测试', () => {
  describe('STAGE_MAP 应用层映射（不落库 stage_code）', () => {
    it('应正确映射 stage 数值到中文名称', () => {
      expect(opportunityService.STAGE_MAP[1]).toBe('询盘');
      expect(opportunityService.STAGE_MAP[2]).toBe('需求确认');
      expect(opportunityService.STAGE_MAP[3]).toBe('方案报价');
      expect(opportunityService.STAGE_MAP[4]).toBe('谈判');
      expect(opportunityService.STAGE_MAP[5]).toBe('成交');
      expect(opportunityService.STAGE_MAP[6]).toBe('失败');
    });

    it('DEFAULT_STAGE_PROBABILITY 应覆盖 1-6 全部阶段', () => {
      for (let s = 1; s <= 6; s++) {
        expect(opportunityService.DEFAULT_STAGE_PROBABILITY[s]).toBeDefined();
      }
    });
  });

  describe('FIX-1: createOpportunity 客户状态校验', () => {
    it('客户不存在时抛 CUSTOMER_NOT_FOUND', async () => {
      const pool = buildPool([async () => [[]]]);
      await expect(
        opportunityService.createOpportunity(pool, { customer_id: 999, name: '测试商机' }, 1)
      ).rejects.toMatchObject({ code: 404002 });
    });

    it('客户状态为 leads（潜客）时拒绝创建商机', async () => {
      const pool = buildPool([async () => [[{ id: 1, status: 'leads' }]]]);
      await expect(
        opportunityService.createOpportunity(pool, { customer_id: 1, name: '测试商机' }, 1)
      ).rejects.toMatchObject({ code: 400005 });
    });

    it('客户状态为 lost（流失）时拒绝创建商机', async () => {
      const pool = buildPool([async () => [[{ id: 1, status: 'lost' }]]]);
      await expect(
        opportunityService.createOpportunity(pool, { customer_id: 1, name: '测试商机' }, 1)
      ).rejects.toMatchObject({ code: 400005 });
    });

    it.each([
      ['following', '跟进中'],
      ['quoted', '已报价'],
      ['negotiating', '谈判中'],
      ['signed', '已签约']
    ])('客户状态为 %s (%s) 时允许创建商机', async (status) => {
      const insertResult = { insertId: 100 };
      const pool = buildPool([
        async () => [[{ id: 1, status }]],          // SELECT customer
        async () => [[{ cnt: 0 }]],                  // generateOpportunityNo COUNT
        async () => [insertResult]                    // INSERT opportunity
      ]);
      const result = await opportunityService.createOpportunity(pool, { customer_id: 1, name: '新商机' }, 1);
      expect(result).toEqual({ id: 100, opportunity_no: expect.stringMatching(/^OPP-\d{6}-001$/) });
    });

    it('创建商机时不应修改 crm_customer 任何字段（领域边界约束）', async () => {
      const query = jest.fn()
        .mockResolvedValueOnce([[{ id: 1, status: 'following' }]])  // SELECT customer
        .mockResolvedValueOnce([[{ cnt: 0 }]])                       // generateOpportunityNo COUNT
        .mockResolvedValueOnce([{ insertId: 100 }]);                 // INSERT opportunity
      const pool = { query };

      await opportunityService.createOpportunity(pool, { customer_id: 1, name: '新商机' }, 1);

      // 断言所有 SQL 调用：不应包含 UPDATE crm_customer
      const allCalls = query.mock.calls.map(c => c[0]);
      const updateCustomerCalls = allCalls.filter(sql => /UPDATE\s+crm_customer/i.test(sql));
      expect(updateCustomerCalls).toHaveLength(0);
    });

    it('v1.1: 传入无效 source_id 时应抛业务校验错误', async () => {
      const pool = buildPool([
        async () => [[{ id: 1, status: 'following' }]],  // SELECT customer
        async () => [[]]                                  // validateSourceId 查询返回空
      ]);
      await expect(
        opportunityService.createOpportunity(pool, { customer_id: 1, name: '新商机', source_id: 999 }, 1)
      ).rejects.toMatchObject({ code: 400005 });
    });

    it('v1.1: 传入有效 source_id 时应成功创建并生成编号', async () => {
      const pool = buildPool([
        async () => [[{ id: 1, status: 'following' }]],   // SELECT customer
        async () => [[{ id: 1 }]],                          // validateSourceId 查询返回存在
        async () => [[{ cnt: 2 }]],                         // generateOpportunityNo COUNT
        async () => [{ insertId: 100 }]                     // INSERT opportunity
      ]);
      const result = await opportunityService.createOpportunity(pool, { customer_id: 1, name: '新商机', source_id: 1 }, 1);
      expect(result.id).toBe(100);
      expect(result.opportunity_no).toMatch(/^OPP-\d{6}-003$/);
    });
  });

  describe('advanceStage - 阶段推进 + change_reason', () => {
    it('阶段值无效时抛业务校验错误', async () => {
      const pool = buildPool();
      await expect(
        opportunityService.advanceStage(pool, 1, 0, 1)
      ).rejects.toMatchObject({ code: 400005 });

      await expect(
        opportunityService.advanceStage(pool, 1, 7, 1)
      ).rejects.toMatchObject({ code: 400005 });
    });

    it('商机不存在时抛权限错误', async () => {
      const pool = buildPool([async () => [[]]]);
      await expect(
        opportunityService.advanceStage(pool, 999, 2, 1)
      ).rejects.toMatchObject({ code: 403001 });
    });

    it('商机已成交（stage=5）时拒绝推进', async () => {
      const pool = buildPool([async () => [[{ id: 1, stage: 5 }]]]);
      await expect(
        opportunityService.advanceStage(pool, 1, 4, 1)
      ).rejects.toMatchObject({ code: 400005 });
    });

    it('商机已失败（stage=6）时拒绝推进', async () => {
      const pool = buildPool([async () => [[{ id: 1, stage: 6 }]]]);
      await expect(
        opportunityService.advanceStage(pool, 1, 4, 1)
      ).rejects.toMatchObject({ code: 400005 });
    });

    it('正常推进时应写入 change_reason 到 stage_log', async () => {
      const query = jest.fn()
        .mockResolvedValueOnce([[{ id: 1, stage: 1 }]])   // SELECT opportunity
        .mockResolvedValueOnce([{ affectedRows: 1 }])       // UPDATE opportunity
        .mockResolvedValueOnce([{ affectedRows: 1 }]);      // INSERT stage_log
      const pool = { query };

      const result = await opportunityService.advanceStage(pool, 1, 3, 2, {
        changeReason: '客户确认需求，进入方案报价'
      });

      expect(result).toEqual({ oldStage: 1, newStage: 3, stageName: '方案报价' });

      // 验证 stage_log INSERT 包含 change_reason
      const insertLogCall = query.mock.calls.find(
        c => /INSERT\s+INTO\s+crm_opportunity_stage_log/i.test(c[0])
      );
      expect(insertLogCall).toBeDefined();
      expect(insertLogCall[1]).toContain('客户确认需求，进入方案报价');
    });

    it('未提供 changeReason 时 stage_log 写入 NULL', async () => {
      const query = jest.fn()
        .mockResolvedValueOnce([[{ id: 1, stage: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      const pool = { query };

      await opportunityService.advanceStage(pool, 1, 2, 2);

      const insertLogCall = query.mock.calls.find(
        c => /INSERT\s+INTO\s+crm_opportunity_stage_log/i.test(c[0])
      );
      expect(insertLogCall[1][3]).toBeNull(); // change_reason 参数
    });
  });

  describe('v1.1: backwardStage - 阶段回退', () => {
    it('阶段值无效时抛业务校验错误', async () => {
      const pool = buildPool();
      await expect(
        opportunityService.backwardStage(pool, 1, 0, 1)
      ).rejects.toMatchObject({ code: 400005 });
      await expect(
        opportunityService.backwardStage(pool, 1, 7, 1)
      ).rejects.toMatchObject({ code: 400005 });
    });

    it('商机不存在时抛权限错误', async () => {
      const pool = buildPool([async () => [[]]]);
      await expect(
        opportunityService.backwardStage(pool, 999, 1, 1)
      ).rejects.toMatchObject({ code: 403001 });
    });

    it('商机已成交（stage=5）时拒绝回退', async () => {
      const pool = buildPool([async () => [[{ id: 1, stage: 5 }]]]);
      await expect(
        opportunityService.backwardStage(pool, 1, 3, 1)
      ).rejects.toMatchObject({ code: 400005 });
    });

    it('商机已失败（stage=6）时拒绝回退', async () => {
      const pool = buildPool([async () => [[{ id: 1, stage: 6 }]]]);
      await expect(
        opportunityService.backwardStage(pool, 1, 3, 1)
      ).rejects.toMatchObject({ code: 400005 });
    });

    it('从 stage=1（询盘）不允许回退（无目标阶段）', async () => {
      const pool = buildPool([async () => [[{ id: 1, stage: 1 }]]]);
      await expect(
        opportunityService.backwardStage(pool, 1, 0, 1)
      ).rejects.toMatchObject({ code: 400005 });
    });

    it('从 stage=3 不允许回退到 stage=4（目标必须小于当前）', async () => {
      const pool = buildPool([async () => [[{ id: 1, stage: 3 }]]]);
      await expect(
        opportunityService.backwardStage(pool, 1, 4, 1)
      ).rejects.toMatchObject({ code: 400005 });
    });

    it('正常回退 stage=3 → stage=1 时应写入 stage_log', async () => {
      const query = jest.fn()
        .mockResolvedValueOnce([[{ id: 1, stage: 3 }]])   // SELECT opportunity
        .mockResolvedValueOnce([{ affectedRows: 1 }])       // UPDATE opportunity
        .mockResolvedValueOnce([{ affectedRows: 1 }]);      // INSERT stage_log
      const pool = { query };

      const result = await opportunityService.backwardStage(pool, 1, 1, 2, {
        changeReason: '客户需求变更，回退到询盘阶段'
      });

      expect(result).toEqual({ oldStage: 3, newStage: 1, stageName: '询盘' });

      // 验证 stage_log INSERT 包含 change_reason
      const insertLogCall = query.mock.calls.find(
        c => /INSERT\s+INTO\s+crm_opportunity_stage_log/i.test(c[0])
      );
      expect(insertLogCall).toBeDefined();
      expect(insertLogCall[1]).toContain('客户需求变更，回退到询盘阶段');
    });

    it('BACKWARD_RULES 应正确定义回退矩阵', () => {
      expect(opportunityService.BACKWARD_RULES[2]).toEqual([1]);
      expect(opportunityService.BACKWARD_RULES[3]).toEqual([1, 2]);
      expect(opportunityService.BACKWARD_RULES[4]).toEqual([1, 2, 3]);
      expect(opportunityService.BACKWARD_RULES[5]).toBeUndefined();
      expect(opportunityService.BACKWARD_RULES[6]).toBeUndefined();
      expect(opportunityService.BACKWARD_RULES[1]).toBeUndefined();
    });
  });

  describe('getStageLog - 阶段日志读取', () => {
    it('应返回包含 change_reason 字段的日志列表', async () => {
      const mockLogs = [{
        id: 1,
        from_stage: 1,
        to_stage: 3,
        change_reason: '客户确认需求',
        changed_at: '2026-08-04 10:00:00',
        create_time: '2026-08-04 10:00:00',
        changed_by_name: '张三',
        hours_in_stage: 48
      }];
      const pool = buildPool([async () => [mockLogs]]);

      const logs = await opportunityService.getStageLog(pool, 1);
      expect(logs).toHaveLength(1);
      expect(logs[0].change_reason).toBe('客户确认需求');
      expect(logs[0]).toHaveProperty('hours_in_stage');
    });
  });
});
