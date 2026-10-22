
const mockPool = { query: jest.fn() };
jest.mock('../config/database', () => mockPool);
jest.mock('../services/paymentService', () => ({
  recordPayment: jest.fn().mockResolvedValue({ id: 1 }),
  updatePayment: jest.fn().mockResolvedValue(true),
  deletePayment: jest.fn().mockResolvedValue(true),
  getOverduePayments: jest.fn().mockResolvedValue({ list: [{ id: 1 }], total: 1 }),
  getMergedPayments: jest.fn().mockResolvedValue({ list: [], total: 0 }),
  getMonthlySummary: jest.fn().mockResolvedValue({ month_plan_total: 100, month_paid_total: 50, month_rate: 50 })
}));

const svc = require('../services/contractPaymentService');
const paymentService = require('../services/paymentService');

const SALES = { manageAll: false, roleId: 3, userId: 7 };
const BOSS = { manageAll: true, roleId: 1, userId: 1 };

beforeEach(() => {
  mockPool.query.mockReset();
  Object.values(paymentService).forEach(fn => fn.mockClear && fn.mockClear());
});

describe('contractPaymentService · 权限闸门 checkContractPermission', () => {
  it('合同不存在抛 CONTRACT_NOT_FOUND(404)', async () => {
    mockPool.query.mockResolvedValueOnce([[]]);
    await expect(svc.addPayment(mockPool, { contract_id: 99, pay_amount: 1 }, SALES))
      .rejects.toMatchObject({ httpStatus: 404 });
  });

  it('他人合同 + 非管理角色抛 PERMISSION_DENIED(403)', async () => {
    mockPool.query.mockResolvedValueOnce([[{ create_by: 999 }]]);
    await expect(svc.addPayment(mockPool, { contract_id: 1, pay_amount: 1 }, SALES))
      .rejects.toMatchObject({ httpStatus: 403 });
    expect(paymentService.recordPayment).not.toHaveBeenCalled();
  });

  it('本人创建人可直接登记', async () => {
    mockPool.query.mockResolvedValueOnce([[{ create_by: 7 }]]);
    await svc.addPayment(mockPool, { contract_id: 1, plan_id: 2, pay_date: '2026-01-01', pay_amount: 100, pay_method: '银行', remark: 'r', idempotency_key: 'k1' }, SALES);
    expect(paymentService.recordPayment).toHaveBeenCalledWith(
      mockPool,
      { contract_id: 1, plan_id: 2, pay_date: '2026-01-01', pay_amount: 100, pay_method: '银行', remark: 'r' },
      'k1'
    );
  });

  it('manageAll 用户可操作他人合同', async () => {
    mockPool.query.mockResolvedValueOnce([[{ create_by: 999 }]]);
    await svc.addPayment(mockPool, { contract_id: 1, pay_amount: 1 }, BOSS);
    expect(paymentService.recordPayment).toHaveBeenCalledTimes(1);
  });
});

describe('contractPaymentService · 修改 / 删除回款', () => {
  it('updatePayment：先查老记录归属再过权限闸', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ plan_id: 2, contract_id: 1 }]]) // 老记录
      .mockResolvedValueOnce([[{ create_by: 999 }]]);            // 他人合同

    await expect(svc.updatePayment(mockPool, { id: 5, pay_amount: 200 }, SALES))
      .rejects.toMatchObject({ httpStatus: 403 });
    expect(paymentService.updatePayment).not.toHaveBeenCalled();
  });

  it('updatePayment：权限通过后透传字段', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ plan_id: 2, contract_id: 1 }]])
      .mockResolvedValueOnce([[{ create_by: 7 }]]);

    await svc.updatePayment(mockPool, { id: 5, pay_date: '2026-02-01', pay_amount: 200, pay_method: '现金', remark: '改' }, SALES);
    expect(paymentService.updatePayment).toHaveBeenCalledWith(mockPool, {
      id: 5, pay_date: '2026-02-01', pay_amount: 200, pay_method: '现金', remark: '改'
    });
  });

  it('deletePayment：记录不存在抛业务校验(400)', async () => {
    mockPool.query.mockResolvedValueOnce([[]]);
    await expect(svc.deletePayment(mockPool, 5, SALES))
      .rejects.toMatchObject({ httpStatus: 400 });
  });

  it('deletePayment：他人记录 + 非管理角色抛 403', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ contract_id: 1, plan_id: null }]])
      .mockResolvedValueOnce([[{ create_by: 999 }]]);

    await expect(svc.deletePayment(mockPool, 5, SALES))
      .rejects.toMatchObject({ httpStatus: 403 });
    expect(paymentService.deletePayment).not.toHaveBeenCalled();
  });

  it('deletePayment：权限通过后执行软删', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ contract_id: 1, plan_id: null }]])
      .mockResolvedValueOnce([[{ create_by: 7 }]]);

    await svc.deletePayment(mockPool, 5, SALES);
    expect(paymentService.deletePayment).toHaveBeenCalledWith(mockPool, 5);
  });
});

describe('contractPaymentService · 列表（分页 / tab 分流 / 权限子句）', () => {
  it('tab=all：count 与 list 两条 SQL 共享同一 WHERE，LIMIT/OFFSET 由分页参数推导', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 57 }]])
      .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]);

    const result = await svc.listPayments(mockPool, { page: 3, pageSize: 20 }, null);

    expect(result).toEqual({ list: [{ id: 1 }, { id: 2 }], total: 57, page: 3, pageSize: 20 });
    expect(mockPool.query).toHaveBeenCalledTimes(2);
    const [countSql] = mockPool.query.mock.calls[0];
    const [listSql, listParams] = mockPool.query.mock.calls[1];
    expect(countSql).toContain('p.deleted_at IS NULL');
    expect(listSql).toContain('LIMIT ? OFFSET ?');
    expect(listParams).toEqual([20, 40]); // pageSize=20, offset=(3-1)*20
  });

  it('tab=all：权限子句与 keyword/日期区间拼接，参数顺序 = 权限→过滤→分页', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[]]);

    await svc.listPayments(
      mockPool,
      { page: 1, pageSize: 10, keyword: '华科', start_date: '2026-01-01', end_date: '2026-06-30' },
      { clause: 'c.owner_id = ?', params: [7] }
    );

    const [, listParams] = mockPool.query.mock.calls[1];
    expect(listParams).toEqual([7, '%华科%', '%华科%', '2026-01-01', '2026-06-30', 10, 0]);
  });

  it('tab=all：permission.clause=1=1 时不拼权限子句（全量短路）', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    await svc.listPayments(mockPool, { page: 1, pageSize: 10 }, { clause: '1=1', params: [] });
    const [listSql, listParams] = mockPool.query.mock.calls[1];
    expect(listSql).not.toContain('1=1');
    expect(listParams).toEqual([10, 0]);
  });

  it('tab=overdue：转发 paymentService.getOverduePayments', async () => {
    const result = await svc.listPayments(mockPool, { tab: 'overdue', page: 2, pageSize: 5, keyword: 'x' }, null);
    expect(paymentService.getOverduePayments).toHaveBeenCalledWith(
      mockPool, { page: 2, pageSize: 5, keyword: 'x' }, null
    );
    expect(result).toEqual({ list: [{ id: 1 }], total: 1, page: 2, pageSize: 5 });
  });

  it('tab=summary：返回本月汇总、list 为空', async () => {
    const result = await svc.listPayments(mockPool, { tab: 'summary' }, null);
    expect(result.summary).toEqual({ month_plan_total: 100, month_paid_total: 50, month_rate: 50 });
    expect(result.list).toEqual([]);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
});

describe('contractPaymentService · 导出与对账单', () => {
  it('exportPayments：权限子句 + 过滤条件进 SQL', async () => {
    mockPool.query.mockResolvedValueOnce([[]]);
    await svc.exportPayments(mockPool, { keyword: '华科', start_date: '2026-01-01' }, { clause: 'c.owner_id = ?', params: [7] });

    const [sql, params] = mockPool.query.mock.calls[0];
    expect(sql).toContain('c.owner_id = ?');
    expect(sql).toContain('p.pay_date >= ?');
    expect(params).toEqual([7, '%华科%', '%华科%', '2026-01-01']);
  });

  it('getStatementExport：客户汇总 + 回款明细双 sheet，回款率按金额占比', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{
        company_name: 'A公司', contact_name: '张三', phone: '138',
        contract_count: 2, total_amount: '1000', paid_amount: '250', outstanding_amount: '750'
      }]])
      .mockResolvedValueOnce([[{
        company_name: 'A公司', contract_no: 'HT-1', contract_amount: '1000',
        plan_date: '2026-01-01', plan_amount: '500',
        pay_date: '2026-01-05', pay_amount: '250', pay_method: '银行', remark: null
      }]]);

    const result = await svc.getStatementExport(mockPool, {}, { clause: '1=1', params: [] });

    expect(result).toMatchObject({ summaryCount: 1, detailCount: 1 });
    const XLSX = require('xlsx');
    const wb = XLSX.read(result.buffer, { type: 'buffer' });
    expect(wb.SheetNames).toEqual(['客户汇总', '回款明细']);
    const summary = XLSX.utils.sheet_to_json(wb.Sheets['客户汇总']);
    expect(summary[0]['回款率']).toBe('25%');
    expect(summary[0]['未回款']).toBe(750);
  });

  it('getStatementExport：零金额客户不回款率 100%（round2 判 0）', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{
        company_name: 'B公司', contact_name: null, phone: null,
        contract_count: 1, total_amount: '0', paid_amount: '0', outstanding_amount: '0'
      }]])
      .mockResolvedValueOnce([[]]);

    const result = await svc.getStatementExport(mockPool, {}, null);
    const XLSX = require('xlsx');
    const wb = XLSX.read(result.buffer, { type: 'buffer' });
    const summary = XLSX.utils.sheet_to_json(wb.Sheets['客户汇总']);
    expect(summary[0]['回款率']).toBe('100%');
    expect(summary[0]['联系人']).toBe('');
  });

  it('getStatementExport：明细为空时只出汇总 sheet', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{
        company_name: 'A公司', contact_name: '张三', phone: '138',
        contract_count: 1, total_amount: '100', paid_amount: '0', outstanding_amount: '100'
      }]])
      .mockResolvedValueOnce([[]]);

    const result = await svc.getStatementExport(mockPool, {}, null);
    const XLSX = require('xlsx');
    const wb = XLSX.read(result.buffer, { type: 'buffer' });
    expect(wb.SheetNames).toEqual(['客户汇总']);
    expect(result.detailCount).toBe(0);
  });

  it('getSummary / getMergedPayments：透传 paymentService', async () => {
    await svc.getSummary(mockPool, { clause: 'x', params: [] });
    expect(paymentService.getMonthlySummary).toHaveBeenCalledWith(mockPool, { clause: 'x', params: [] });

    await svc.getMergedPayments(mockPool, { page: 1 }, { clause: 'y' });
    expect(paymentService.getMergedPayments).toHaveBeenCalledWith(mockPool, { page: 1 }, { clause: 'y' });
  });
});
