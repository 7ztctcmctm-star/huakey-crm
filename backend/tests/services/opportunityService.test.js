/**
 * opportunityService 单元测试
 * 直接 mock pool.query，不经过 HTTP 层
 */
const opportunityService = require('../../services/opportunityService');

const mockPool = { query: jest.fn() };

beforeEach(() => {
  mockPool.query.mockReset();
});

// ---------------------------------------------------------------------------
// listOpportunities
// ---------------------------------------------------------------------------
describe('opportunityService.listOpportunities', () => {
  it('应该使用默认分页参数', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    await opportunityService.listOpportunities(mockPool, {});

    const mainCall = mockPool.query.mock.calls[1];
    const params = mainCall[1];
    expect(params[params.length - 2]).toBe(10);  // pageSize
    expect(params[params.length - 1]).toBe(0);   // offset
  });

  it('stage 筛选应拼接到 WHERE 条件', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ id: 1, stage: 3 }]]);

    await opportunityService.listOpportunities(mockPool, { stage: '3' });

    const countCall = mockPool.query.mock.calls[0];
    expect(countCall[0]).toContain('o.stage = ?');
    expect(countCall[1]).toContain(3);
  });

  it('customer_id 筛选应拼接到 WHERE 条件', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    await opportunityService.listOpportunities(mockPool, { customer_id: '42' });

    const countCall = mockPool.query.mock.calls[0];
    expect(countCall[0]).toContain('o.customer_id = ?');
    expect(countCall[1]).toContain(42);
  });

  it('空结果应返回 { list: [], total: 0 }', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    const result = await opportunityService.listOpportunities(mockPool, {});
    expect(result).toEqual({ list: [], total: 0 });
  });

  it('name 筛选应使用 LIKE 模糊匹配', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    await opportunityService.listOpportunities(mockPool, { name: '大单' });

    const countCall = mockPool.query.mock.calls[0];
    expect(countCall[0]).toContain('o.name LIKE ?');
    expect(countCall[1]).toContain('%大单%');
  });

  it('数据权限 clause 应注入查询', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    const permission = { clause: 'o.owner_id IN (1,2)', params: [] };
    await opportunityService.listOpportunities(mockPool, {}, permission);

    const countCall = mockPool.query.mock.calls[0];
    expect(countCall[0]).toContain('o.owner_id IN (1,2)');
  });
});

// ---------------------------------------------------------------------------
// createOpportunity
// ---------------------------------------------------------------------------
describe('opportunityService.createOpportunity', () => {
  it('客户不存在应抛出 404', async () => {
    mockPool.query.mockResolvedValueOnce([[]]);

    await expect(
      opportunityService.createOpportunity(mockPool, { customer_id: 999, name: '商机A' }, 1)
    ).rejects.toMatchObject({ code: 404002, message: '客户不存在' });
  });

  it('客户状态为 leads(潜客) 时应抛出 400', async () => {
    mockPool.query.mockResolvedValueOnce([[{ id: 1, status: 'leads' }]]);

    await expect(
      opportunityService.createOpportunity(mockPool, { customer_id: 1, name: '商机A' }, 1)
    ).rejects.toMatchObject({ code: 400005 });
  });

  it('创建成功应返回 { id, opportunity_no }', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ id: 1, status: 'signed' }]])   // 客户校验
      .mockResolvedValueOnce([[{ cnt: 0 }]])                       // generateOpportunityNo COUNT
      .mockResolvedValueOnce([{ insertId: 100 }]);                  // INSERT

    const result = await opportunityService.createOpportunity(
      mockPool,
      { customer_id: 1, name: '新商机', expected_amount: 50000 },
      1
    );
    expect(result).toEqual({ id: 100, opportunity_no: expect.stringMatching(/^OPP-\d{6}-001$/) });
  });

  it('未传 owner_id 时应使用 userId 作为默认负责人', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ id: 1, status: 'signed' }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])      // generateOpportunityNo COUNT
      .mockResolvedValueOnce([{ insertId: 101 }]);

    await opportunityService.createOpportunity(
      mockPool,
      { customer_id: 1, name: '商机B' },
      42
    );

    const insertCall = mockPool.query.mock.calls[2];
    // owner_id 是 INSERT 的最后一个参数
    expect(insertCall[1]).toContain(42);
  });

  it('未传 expected_amount 时默认为 0', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ id: 1, status: 'signed' }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])      // generateOpportunityNo COUNT
      .mockResolvedValueOnce([{ insertId: 102 }]);

    await opportunityService.createOpportunity(
      mockPool,
      { customer_id: 1, name: '商机C' },
      1
    );

    const insertCall = mockPool.query.mock.calls[2];
    expect(insertCall[1]).toContain(0);  // expected_amount 默认值
  });
});

// ---------------------------------------------------------------------------
// advanceStage（即用户所说的 updateStage）
// ---------------------------------------------------------------------------
describe('opportunityService.advanceStage', () => {
  it('阶段值无效(超出1-6)应抛出 400', async () => {
    await expect(
      opportunityService.advanceStage(mockPool, 1, 7, 1)
    ).rejects.toMatchObject({ code: 400005, message: '阶段值无效(1-6)' });

    await expect(
      opportunityService.advanceStage(mockPool, 1, 0, 1)
    ).rejects.toMatchObject({ code: 400005 });
  });

  it('商机不存在应抛出 403', async () => {
    mockPool.query.mockResolvedValueOnce([[]]);

    await expect(
      opportunityService.advanceStage(mockPool, 999, 2, 1)
    ).rejects.toMatchObject({ code: 403001 });
  });

  it('已成交(stage=5)的商机不可推进', async () => {
    mockPool.query.mockResolvedValueOnce([[{ id: 1, stage: 5 }]]);

    await expect(
      opportunityService.advanceStage(mockPool, 1, 6, 1)
    ).rejects.toMatchObject({ code: 400005, message: '商机已成交，不可再推进' });
  });

  it('已失败(stage=6)的商机不可推进', async () => {
    mockPool.query.mockResolvedValueOnce([[{ id: 1, stage: 6 }]]);

    await expect(
      opportunityService.advanceStage(mockPool, 1, 1, 1)
    ).rejects.toMatchObject({ code: 400005, message: '商机已失败，不可再推进' });
  });

  it('正常推进应返回旧阶段、新阶段和阶段名称', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ id: 1, stage: 2 }]])   // 查询当前阶段
      .mockResolvedValueOnce([{ affectedRows: 1 }])     // UPDATE
      .mockResolvedValueOnce([{ insertId: 1 }]);        // INSERT log

    const result = await opportunityService.advanceStage(mockPool, 1, 3, 1);
    expect(result).toEqual({ oldStage: 2, newStage: 3, stageName: '方案报价' });
  });

  it('推进时应自动设置对应阶段的赢率', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ id: 1, stage: 1 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ insertId: 1 }]);

    await opportunityService.advanceStage(mockPool, 1, 3, 1);

    const updateCall = mockPool.query.mock.calls[1];
    // stage 3 的默认赢率是 50
    expect(updateCall[1]).toContain(50);
  });
});

// ---------------------------------------------------------------------------
// getOpportunity
// ---------------------------------------------------------------------------
describe('opportunityService.getOpportunity', () => {
  it('商机不存在应返回 null', async () => {
    mockPool.query.mockResolvedValueOnce([[]]);

    const result = await opportunityService.getOpportunity(mockPool, 999);
    expect(result).toBeNull();
  });

  it('商机存在时应返回完整对象', async () => {
    const mockData = { id: 1, name: '测试商机', stage: 2, expected_amount: 10000 };
    mockPool.query.mockResolvedValueOnce([[mockData]]);

    const result = await opportunityService.getOpportunity(mockPool, 1);
    expect(result).toEqual(mockData);
  });
});
