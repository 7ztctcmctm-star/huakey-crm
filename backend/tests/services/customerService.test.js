/**
 * customerService 单元测试
 * 直接 mock pool.query，不经过 HTTP 层
 */
const customerService = require('../../services/customerService');

// Mock getOverdueDays
jest.mock('../../utils/config', () => ({
  getOverdueDays: jest.fn().mockResolvedValue(7),
  getNearRecycleDays: jest.fn().mockResolvedValue(7)
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

  it('数据错位（owner_id=NULL 但 pool_status=private）应放行认领', async () => {
    // [2026-10-15 P0-2] 实测测试库 428 条无主客户 pool_status 全为 'private'（无一条 'sea'）。
    // 旧守卫按 pool_status='sea' 判定会把这些客户误杀在公海页外；修正后按 owner_id 判定。
    mockPool.query.mockResolvedValueOnce([[{
      id: 1, company_name: '错位客户', pool_status: 'private', pool_type: null, protect_until: null, owner_id: null
    }]]);
    const conn = {
      query: jest.fn()
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE
        .mockResolvedValueOnce([{}]),                // INSERT crm_pool_log
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    };
    mockPool.getConnection = jest.fn().mockResolvedValue(conn);

    const result = await customerService.claimCustomer(mockPool, 1, 1);

    expect(result).toEqual({ company_name: '错位客户' });
    // UPDATE 的原子条件必须只有 owner_id IS NULL，WHERE 里不能再带 pool_status='sea'
    // （SET 子句中的 pool_status = ? 是认领后置 'private'，属预期）
    const updateCall = conn.query.mock.calls[0];
    expect(updateCall[0]).toContain('owner_id IS NULL');
    expect(updateCall[0]).not.toContain('AND pool_status = ?');
    // [P1-03] 认领必须同步推进 status/business_status（均为 following）
    expect(updateCall[0]).toContain('status = ?');
    expect(updateCall[0]).toContain('business_status = ?');
    expect(updateCall[1]).toEqual(['private', 1, 'following', 'following', 1]);
  });
});

// ---------------------------------------------------------------------------
// releaseCustomerToPool（数据范围强校验，P0-05）
// ---------------------------------------------------------------------------
describe('customerService.releaseCustomerToPool 数据范围', () => {
  const createConn = () => ({
    query: jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn()
  });

  it('[P0-05] 销售不得释放他人客户（事务内范围复判失败即回滚）', async () => {
    mockPool.query.mockResolvedValueOnce([[{
      id: 1, company_name: '他人客户', business_status: 'following', owner_id: 9, pool_status: 'private'
    }]]);
    const conn = createConn();
    conn.query.mockResolvedValueOnce([[]]); // 加锁查询在范围内查不到
    mockPool.getConnection = jest.fn().mockResolvedValue(conn);

    await expect(customerService.releaseCustomerToPool(
      mockPool, 1, 5, null, { type: 'self', userId: 5, ownerColumn: 'owner_id', module: 'customer' }
    )).rejects.toMatchObject({ code: 403001 });

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.query.mock.calls.some(c => String(c[0]).includes('UPDATE crm_customer'))).toBe(false);
  });

  it('[P0-05] 缺少数据权限上下文时 fail-closed，不读业务表', async () => {
    mockPool.getConnection = jest.fn();

    await expect(customerService.releaseCustomerToPool(mockPool, 1, 5))
      .rejects.toMatchObject({ code: 403001 });

    expect(mockPool.query).not.toHaveBeenCalled();
    expect(mockPool.getConnection).not.toHaveBeenCalled();
  });

  it('[P0-05] 范围内释放成功：加锁复判 → 更新 → 写日志 → 提交', async () => {
    mockPool.query.mockResolvedValueOnce([[{
      id: 1, company_name: '本人客户', business_status: 'following', owner_id: 5, pool_status: 'private'
    }]]);
    const conn = createConn();
    conn.query
      .mockResolvedValueOnce([[{ id: 1, company_name: '本人客户', business_status: 'following', owner_id: 5, pool_status: 'private' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ insertId: 1 }]);
    mockPool.getConnection = jest.fn().mockResolvedValue(conn);

    const result = await customerService.releaseCustomerToPool(
      mockPool, 1, 5, null, { type: 'self', userId: 5, ownerColumn: 'owner_id', module: 'customer' }
    );

    expect(result).toEqual({ id: 1, company_name: '本人客户' });
    expect(conn.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(conn.query.mock.calls[2][0]).toContain('crm_pool_log');
    expect(conn.commit).toHaveBeenCalled();
  });

  it('[P2-07] 公海判据看 owner_id：owner_id=NULL 即已在公海（pool_status=private 也不能放行）', async () => {
    mockPool.query.mockResolvedValueOnce([[{
      id: 2, company_name: '无主客户', business_status: 'following', owner_id: null, pool_status: 'private'
    }]]);
    mockPool.getConnection = jest.fn();

    await expect(customerService.releaseCustomerToPool(
      mockPool, 2, 5, null, { type: 'self', userId: 5, ownerColumn: 'owner_id', module: 'customer' }
    )).rejects.toMatchObject({ code: 400005, message: '该客户已在待分配中' });

    expect(mockPool.getConnection).not.toHaveBeenCalled();
  });

  it('[P2-07] pool_status=sea 但仍有 owner_id 的错位行允许释放（归属以 owner_id 为准）', async () => {
    const row = { id: 3, company_name: '错位客户', business_status: 'following', owner_id: 5, pool_status: 'sea' };
    mockPool.query.mockResolvedValueOnce([[row]]);
    const conn = createConn();
    conn.query
      .mockResolvedValueOnce([[row]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ insertId: 1 }]);
    mockPool.getConnection = jest.fn().mockResolvedValue(conn);

    const result = await customerService.releaseCustomerToPool(
      mockPool, 3, 5, null, { type: 'self', userId: 5, ownerColumn: 'owner_id', module: 'customer' }
    );

    expect(result).toEqual({ id: 3, company_name: '错位客户' });
    expect(conn.query.mock.calls.some(c => String(c[0]).includes('UPDATE crm_customer'))).toBe(true);
    expect(conn.commit).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getNearRecycleCustomersList（P2-07：不再依赖 pool_status）
// ---------------------------------------------------------------------------
describe('customerService.getNearRecycleCustomersList', () => {
  it('只按 owner_id + 逾期天数 + 数据权限筛选，不读取 pool_status', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    await customerService.getNearRecycleCustomersList(
      mockPool, {}, { clause: 'c.owner_id = ?', params: [5] }
    );

    expect(mockPool.query).toHaveBeenCalledTimes(2);
    for (const [sql] of mockPool.query.mock.calls) {
      expect(sql).not.toContain('pool_status');
    }
    expect(mockPool.query.mock.calls[0][1]).toEqual([7, 7, 5]);
    expect(mockPool.query.mock.calls[1][1].slice(0, 3)).toEqual([7, 7, 5]);
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
    // 检查 UPDATE 语句（097 迁移后 pool_status 参数化，不再字面量 1）
    const updateCall = mockPool.query.mock.calls[1];
    expect(updateCall[0]).toContain('pool_status = ?');
    // [P1-03] 释放同步写 status=sea、business_status=following
    expect(updateCall[0]).toContain('status = ?');
    expect(updateCall[0]).toContain('business_status = ?');
    expect(updateCall[1]).toEqual(['sea', 'sea', 'following', 1]);
    // 检查 INSERT 日志
    const logCall = mockPool.query.mock.calls[2];
    expect(logCall[0]).toContain('crm_pool_log');
  });
});
