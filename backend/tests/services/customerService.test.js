/**
 * customerService 单元测试
 * 直接 mock pool.query，不经过 HTTP 层
 */
const customerService = require('../../services/customerService');

// Mock getOverdueDays
jest.mock('../../utils/config', () => ({
  getOverdueDays: jest.fn().mockResolvedValue(7)
}));

const mockPool = { query: jest.fn() };

beforeEach(() => {
  mockPool.query.mockReset();
});

// ---------------------------------------------------------------------------
// listCustomers
// ---------------------------------------------------------------------------
describe('customerService.listCustomers', () => {
  it('应该使用默认分页参数 (page=1, pageSize=10)', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])   // COUNT
      .mockResolvedValueOnce([[]])                 // SELECT
      .mockResolvedValueOnce([[]]);                // tags

    await customerService.listCustomers(mockPool, {});

    // 第二次调用是主查询，检查 LIMIT/OFFSET 参数
    const mainCall = mockPool.query.mock.calls[1];
    const params = mainCall[1];
    // 最后两个参数是 pageSize 和 offset
    expect(params[params.length - 2]).toBe(10);  // pageSize
    expect(params[params.length - 1]).toBe(0);   // offset (page=1)
  });

  it('应该正确拼接 keyword LIKE 查询（company_name）', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    await customerService.listCustomers(mockPool, { company_name: '测试公司' });

    const countCall = mockPool.query.mock.calls[0];
    expect(countCall[0]).toContain('c.company_name LIKE ?');
    expect(countCall[1]).toContain('%测试公司%');
  });

  it('空结果应返回 { list: [], total: 0 }', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    const result = await customerService.listCustomers(mockPool, {});
    expect(result).toEqual({ list: [], total: 0 });
  });

  it('指定 status 时应按状态筛选', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 5 }]])
      .mockResolvedValueOnce([[{ id: 1, status: 'following' }]])
      .mockResolvedValueOnce([[]]);

    await customerService.listCustomers(mockPool, { status: 'following' });

    const countCall = mockPool.query.mock.calls[0];
    expect(countCall[0]).toContain('c.status = ?');
    expect(countCall[1]).toContain('following');
  });

  it('未指定 status 时应加 deleted_at IS NULL 条件', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    await customerService.listCustomers(mockPool, {});

    const countCall = mockPool.query.mock.calls[0];
    expect(countCall[0]).toContain('c.deleted_at IS NULL');
  });

  it('source 为父级（如"网络"）时应展开为子级 IN 查询', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    await customerService.listCustomers(mockPool, { source: '网络' });

    const countCall = mockPool.query.mock.calls[0];
    expect(countCall[0]).toContain('c.source IN (');
    // 应包含所有子级来源
    expect(countCall[1]).toEqual(
      expect.arrayContaining(['Facebook', 'Instagram', 'LinkedIn', '独立站', '其他网络渠道'])
    );
  });

  it('数据权限 clause 应注入到 WHERE 条件中', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    const permission = { clause: 'c.owner_id IN (1,2,3)', params: [] };
    await customerService.listCustomers(mockPool, {}, permission);

    const countCall = mockPool.query.mock.calls[0];
    expect(countCall[0]).toContain('c.owner_id IN (1,2,3)');
  });
});

// ---------------------------------------------------------------------------
// getCustomer
// ---------------------------------------------------------------------------
describe('customerService.getCustomer', () => {
  it('客户不存在时应返回 null', async () => {
    mockPool.query.mockResolvedValueOnce([[]]);

    const result = await customerService.getCustomer(mockPool, 999);
    expect(result).toBeNull();
  });

  it('客户存在时应返回 customer + contacts + followRecords', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ id: 1, company_name: 'A公司' }]])  // customer
      .mockResolvedValueOnce([[{ id: 10, name: '张三' }]])          // contacts
      .mockResolvedValueOnce([[{ id: 100, content: '跟进' }]])      // followRecords
      .mockResolvedValueOnce([[]]);                                   // attachments

    const result = await customerService.getCustomer(mockPool, 1);
    expect(result.customer.company_name).toBe('A公司');
    expect(result.contacts).toHaveLength(1);
    expect(result.followRecords).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// convertStatus 已废弃：070 迁移后状态流转改由 sys_customer_status_transition 表管理
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// assignCustomer
// ---------------------------------------------------------------------------
describe('customerService.assignCustomer', () => {
  it('客户不存在应抛出 404', async () => {
    mockPool.query.mockResolvedValueOnce([[]]);

    await expect(
      customerService.assignCustomer(mockPool, 999, 2, 1)
    ).rejects.toMatchObject({ code: 404002 });
  });

  it('分配成功应返回原负责人 ID', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ id: 1, owner_id: 5, company_name: 'A' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE
      .mockResolvedValueOnce([{ insertId: 1 }]);      // INSERT log

    const result = await customerService.assignCustomer(mockPool, 1, 2, 1, '测试分配');
    expect(result.fromUserId).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// claimCustomer
// ---------------------------------------------------------------------------
describe('customerService.claimCustomer', () => {
  it('客户不存在应抛出 404', async () => {
    mockPool.query.mockResolvedValueOnce([[]]);

    await expect(
      customerService.claimCustomer(mockPool, 999, 1)
    ).rejects.toMatchObject({ code: 404002 });
  });

  it('客户不在公海应抛出 400', async () => {
    mockPool.query.mockResolvedValueOnce([[{
      id: 1, pool_status: 0, pool_type: null, protect_until: null, owner_id: 5
    }]]);

    await expect(
      customerService.claimCustomer(mockPool, 1, 1)
    ).rejects.toMatchObject({ code: 400005, message: '该客户不在公海中' });
  });
});

// ---------------------------------------------------------------------------
// releaseCustomer
// ---------------------------------------------------------------------------
describe('customerService.releaseCustomer', () => {
  it('客户不存在应抛出 404', async () => {
    mockPool.query.mockResolvedValueOnce([[]]);

    await expect(
      customerService.releaseCustomer(mockPool, 999, 1)
    ).rejects.toMatchObject({ code: 404002 });
  });

  it('释放成功应执行 UPDATE 和 INSERT 日志', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ id: 1, owner_id: 5, company_name: 'A' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ insertId: 1 }]);

    await customerService.releaseCustomer(mockPool, 1, 5);

    expect(mockPool.query).toHaveBeenCalledTimes(3);
    // 检查 UPDATE 语句
    const updateCall = mockPool.query.mock.calls[1];
    expect(updateCall[0]).toContain('pool_status = 1');
    // 检查 INSERT 日志
    const logCall = mockPool.query.mock.calls[2];
    expect(logCall[0]).toContain('crm_pool_log');
  });
});
