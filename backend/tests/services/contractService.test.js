/**
 * contractService 单元测试
 * 直接 mock pool.query / pool.getConnection，不经过 HTTP 层
 */
const contractService = require('../../services/contractService');

const mockPool = { query: jest.fn(), getConnection: jest.fn() };

// 创建一个 mock connection（用于事务操作）
function createMockConnection() {
  const conn = {
    query: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn()
  };
  return conn;
}

beforeEach(() => {
  mockPool.query.mockReset();
  mockPool.getConnection.mockReset();
});

// ---------------------------------------------------------------------------
// listContracts
// ---------------------------------------------------------------------------
describe('contractService.listContracts', () => {
  it('应该使用默认分页参数', async () => {
    mockPool.query
      .mockResolvedValueOnce([[]])                    // SELECT rows
      .mockResolvedValueOnce([[{ total: 0 }]]);       // COUNT

    await contractService.listContracts(mockPool, {});

    const selectCall = mockPool.query.mock.calls[0];
    const params = selectCall[1];
    // 最后两个参数是 offset 和 pageSize
    expect(params[params.length - 2]).toBe(0);   // offset (page=1)
    expect(params[params.length - 1]).toBe(10);  // pageSize
  });

  it('status 筛选应拼接到 WHERE 条件', async () => {
    mockPool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]]);

    await contractService.listContracts(mockPool, { status: 2 });

    const selectCall = mockPool.query.mock.calls[0];
    expect(selectCall[0]).toContain('c.status = ?');
    expect(selectCall[1]).toContain(2);
  });

  it('keyword 应同时匹配 contract_no 和 company_name', async () => {
    mockPool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]]);

    await contractService.listContracts(mockPool, { keyword: 'ABC' });

    const selectCall = mockPool.query.mock.calls[0];
    expect(selectCall[0]).toContain('c.contract_no LIKE ?');
    expect(selectCall[0]).toContain('cu.company_name LIKE ?');
    expect(selectCall[1]).toEqual(expect.arrayContaining(['%ABC%', '%ABC%']));
  });

  it('空结果应返回 { list: [], total: 0 }', async () => {
    mockPool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]]);

    const result = await contractService.listContracts(mockPool, {});
    expect(result).toEqual({ list: [], total: 0 });
  });

  it('payment_status 筛选应拼接对应子查询', async () => {
    mockPool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]]);

    await contractService.listContracts(mockPool, { payment_status: 'overdue' });

    const selectCall = mockPool.query.mock.calls[0];
    expect(selectCall[0]).toContain('crm_payment_plan');
    expect(selectCall[0]).toContain('overdue');
  });

  it('数据权限 clause 应注入查询', async () => {
    mockPool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]]);

    const permission = { clause: 'c.create_by = 5', params: [] };
    await contractService.listContracts(mockPool, {}, permission);

    const selectCall = mockPool.query.mock.calls[0];
    expect(selectCall[0]).toContain('c.create_by = 5');
  });
});

// ---------------------------------------------------------------------------
// createContract
// ---------------------------------------------------------------------------
describe('contractService.createContract', () => {
  it('客户不存在应抛出 404', async () => {
    const conn = createMockConnection();
    mockPool.getConnection.mockResolvedValue(conn);
    conn.query.mockResolvedValueOnce([[]]);  // 客户校验

    await expect(
      contractService.createContract(mockPool, { customer_id: 999, amount: 10000 }, 1)
    ).rejects.toMatchObject({ code: 404 });

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('客户不是正式客户应抛出 400', async () => {
    const conn = createMockConnection();
    mockPool.getConnection.mockResolvedValue(conn);
    conn.query.mockResolvedValueOnce([[{ id: 1, status: 1, company_name: 'A' }]]);

    await expect(
      contractService.createContract(mockPool, { customer_id: 1, amount: 10000 }, 1)
    ).rejects.toMatchObject({ code: 400 });
  });

  it('应自动生成 CON-YYMMDD-NNN 格式的合同编号', async () => {
    const conn = createMockConnection();
    mockPool.getConnection.mockResolvedValue(conn);

    // 客户校验
    conn.query.mockResolvedValueOnce([[{ id: 1, status: 2, company_name: 'A' }]]);
    // COUNT 查询（已有 3 个合同）
    conn.query.mockResolvedValueOnce([[{ cnt: 3 }]]);
    // INSERT
    conn.query.mockResolvedValueOnce([{ insertId: 50 }]);

    const result = await contractService.createContract(
      mockPool,
      { customer_id: 1, amount: 10000, sign_date: '2026-01-01' },
      1
    );

    // 验证编号格式
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    expect(result.contract_no).toBe(`CON-${dateStr}-004`);  // 3+1=4 → 004
    expect(result.id).toBe(50);
  });

  it('有回款计划时应批量插入 payment_plan', async () => {
    const conn = createMockConnection();
    mockPool.getConnection.mockResolvedValue(conn);

    conn.query.mockResolvedValueOnce([[{ id: 1, status: 2, company_name: 'A' }]]);
    conn.query.mockResolvedValueOnce([[{ cnt: 0 }]]);
    conn.query.mockResolvedValueOnce([{ insertId: 51 }]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 2 }]);  // 批量插入 plans

    const plans = [
      { plan_date: '2026-07-01', plan_amount: 5000, remark: '首期' },
      { plan_date: '2026-12-01', plan_amount: 5000, remark: '尾款' }
    ];

    await contractService.createContract(
      mockPool,
      { customer_id: 1, amount: 10000, plans },
      1
    );

    // 第4次调用是批量插入 plans
    const planInsertCall = conn.query.mock.calls[3];
    expect(planInsertCall[0]).toContain('crm_payment_plan');
    expect(planInsertCall[0]).toContain('(?, ?, ?, ?)');
    expect(planInsertCall[1]).toEqual([51, '2026-07-01', 5000, '首期', 51, '2026-12-01', 5000, '尾款']);
  });

  it('成功时应 commit 事务', async () => {
    const conn = createMockConnection();
    mockPool.getConnection.mockResolvedValue(conn);

    conn.query.mockResolvedValueOnce([[{ id: 1, status: 2, company_name: 'A' }]]);
    conn.query.mockResolvedValueOnce([[{ cnt: 0 }]]);
    conn.query.mockResolvedValueOnce([{ insertId: 52 }]);

    await contractService.createContract(
      mockPool,
      { customer_id: 1, amount: 5000 },
      1
    );

    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('异常时应 rollback 事务', async () => {
    const conn = createMockConnection();
    mockPool.getConnection.mockResolvedValue(conn);

    conn.query.mockResolvedValueOnce([[{ id: 1, status: 2, company_name: 'A' }]]);
    conn.query.mockRejectedValueOnce(new Error('DB error'));

    await expect(
      contractService.createContract(mockPool, { customer_id: 1, amount: 5000 }, 1)
    ).rejects.toThrow('DB error');

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateContractStatus
// ---------------------------------------------------------------------------
describe('contractService.updateContractStatus', () => {
  it('合同不存在应抛出 404', async () => {
    mockPool.query.mockResolvedValueOnce([[]]);

    await expect(
      contractService.updateContractStatus(mockPool, 999, 2)
    ).rejects.toMatchObject({ code: 404 });
  });

  it('已完成(status=3)的合同不能变更状态', async () => {
    mockPool.query.mockResolvedValueOnce([[{ id: 1, status: 3 }]]);

    await expect(
      contractService.updateContractStatus(mockPool, 1, 2)
    ).rejects.toMatchObject({ code: 400, message: '已完成的合同不能变更状态' });
  });

  it('正常状态变更应返回 true', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ id: 1, status: 1 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await contractService.updateContractStatus(mockPool, 1, 2);
    expect(result).toBe(true);
  });

  it('已完成→已完成(status=3→3)应允许（幂等）', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ id: 1, status: 3 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await contractService.updateContractStatus(mockPool, 1, 3);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateAmount
// ---------------------------------------------------------------------------
describe('contractService.calculateAmount', () => {
  it('合同不存在应返回 null', async () => {
    mockPool.query.mockResolvedValueOnce([[]]);

    const result = await contractService.calculateAmount(mockPool, 999);
    expect(result).toBeNull();
  });

  it('应正确计算已回金额、计划总额、剩余金额和进度', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ amount: 10000 }]])         // 合同金额
      .mockResolvedValueOnce([[{ total: 6000 }]])           // 已回金额
      .mockResolvedValueOnce([[{ total: 10000 }]]);         // 计划总额

    const result = await contractService.calculateAmount(mockPool, 1);
    expect(result.amount).toBe(10000);
    expect(result.paid_amount).toBe(6000);
    expect(result.plan_total).toBe(10000);
    expect(result.remaining).toBe(4000);
    expect(result.progress).toBe(60);
  });

  it('金额为 0 时进度应为 0', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ amount: 0 }]])
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[{ total: 0 }]]);

    const result = await contractService.calculateAmount(mockPool, 1);
    expect(result.progress).toBe(0);
  });
});
