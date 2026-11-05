/**
 * 发票编号生成（[P2-06] 改用 crm_doc_sequence 原子序列）
 *
 * 历史实现依次为 COUNT(*)+1 → 当日最大号+1（依赖 FOR UPDATE 区间锁）。
 * 两者在迁移 123 的 uk_invoice_no 未执行时都缺少最终防线。现改为与合同号
 * 相同的序列原子自增（key = invoice:YYMMDD），编号正确性不再依赖唯一索引；
 * ER_DUP_ENTRY 重试保留，用于唯一索引存在时的手工写号等残余冲突。
 */

jest.mock('../../middleware/logger', () => ({ createRouteLogger: () => jest.fn().mockResolvedValue() }));
jest.mock('../../middleware/permission', () => ({
  buildDataPermissionWhere: jest.fn(async () => ({ clause: '1=1', params: [] }))
}));
jest.mock('../../utils/fieldLog', () => ({ logFieldChanges: jest.fn() }));

const invoiceService = require('../../services/invoiceService');

function createMockConn() {
  return {
    query: jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn()
  };
}

// [步骤 B3] 预期值必须与服务同口径（北京时间），不能用 toISOString（UTC）
const dateStr = () => require('../../utils/dateCode').shortDateCode();
const dupErr = () => Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });

describe('invoiceService.createInvoice 编号生成', () => {
  beforeEach(() => jest.clearAllMocks());

  it('当日无发票时应生成 001', async () => {
    const conn = createMockConn();
    const pool = {
      getConnection: jest.fn().mockResolvedValue(conn),
      // [P0-09] 开事务前先校验合同存在且客户一致
      query: jest.fn().mockResolvedValue([[{ id: 1, customer_id: 1 }]])
    };
    conn.query
      .mockResolvedValueOnce([{ insertId: 1 }])    // [P2-06] 序列取号
      .mockResolvedValueOnce([{ insertId: 7 }]);   // INSERT

    const result = await invoiceService.createInvoice(pool, { contract_id: 1, customer_id: 1, type: 1, amount: 100 }, 1);

    expect(result.invoice_no).toBe(`INV-${dateStr()}-001`);
    expect(result.id).toBe(7);

    const seqCall = conn.query.mock.calls[0];
    expect(seqCall[0]).toContain('crm_doc_sequence');
    expect(seqCall[0]).toContain('LAST_INSERT_ID(current_value + 1)');
    expect(seqCall[1]).toEqual([`invoice:${dateStr()}`]);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('中间编号被删除后水位不回退，不会复用已存在的编号', async () => {
    const conn = createMockConn();
    const pool = {
      getConnection: jest.fn().mockResolvedValue(conn),
      // [P0-09] 开事务前先校验合同存在且客户一致
      query: jest.fn().mockResolvedValue([[{ id: 1, customer_id: 1 }]])
    };
    // 001/002/003 中 002 已删除，序列水位仍为 3 → 下一号必须是 004
    conn.query
      .mockResolvedValueOnce([{ insertId: 4 }])
      .mockResolvedValueOnce([{ insertId: 8 }]);

    const result = await invoiceService.createInvoice(pool, { contract_id: 1, customer_id: 1, type: 1, amount: 100 }, 1);

    expect(result.invoice_no).toBe(`INV-${dateStr()}-004`);
  });

  it('唯一索引存在且撞号（1062）时取下一个序列值重试，成功后只提交一次', async () => {
    const conn = createMockConn();
    const pool = {
      getConnection: jest.fn().mockResolvedValue(conn),
      // [P0-09] 开事务前先校验合同存在且客户一致
      query: jest.fn().mockResolvedValue([[{ id: 1, customer_id: 1 }]])
    };
    conn.query
      .mockResolvedValueOnce([{ insertId: 2 }])   // 第 1 次：序列 002
      .mockRejectedValueOnce(dupErr())             // 撞手工/历史 002
      .mockResolvedValueOnce([{ insertId: 3 }])   // 第 2 次：序列 003
      .mockResolvedValueOnce([{ insertId: 9 }]);  // 成功

    const result = await invoiceService.createInvoice(pool, { contract_id: 1, customer_id: 1, type: 1, amount: 100 }, 1);

    expect(result.invoice_no).toBe(`INV-${dateStr()}-003`);
    expect(pool.getConnection).toHaveBeenCalledTimes(2);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.release).toHaveBeenCalledTimes(2);
  });

  it('重试耗尽后应冒泡 ER_DUP_ENTRY（由 errorHandler 统一映射为 409）', async () => {
    const conn = createMockConn();
    const pool = {
      getConnection: jest.fn().mockResolvedValue(conn),
      // [P0-09] 开事务前先校验合同存在且客户一致
      query: jest.fn().mockResolvedValue([[{ id: 1, customer_id: 1 }]])
    };
    let seq = 0;
    conn.query.mockImplementation(async (sql) => {
      if (String(sql).includes('crm_doc_sequence')) return [{ insertId: ++seq }];
      throw dupErr();
    });

    await expect(
      invoiceService.createInvoice(pool, { contract_id: 1, customer_id: 1, type: 1, amount: 100 }, 1)
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });

    expect(pool.getConnection).toHaveBeenCalledTimes(3);
    expect(conn.rollback).toHaveBeenCalledTimes(3);
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('非编号冲突的错误应立刻抛出，不重试', async () => {
    const conn = createMockConn();
    const pool = {
      getConnection: jest.fn().mockResolvedValue(conn),
      // [P0-09] 开事务前先校验合同存在且客户一致
      query: jest.fn().mockResolvedValue([[{ id: 1, customer_id: 1 }]])
    };
    const fkErr = Object.assign(new Error('fk fail'), { code: 'ER_NO_REFERENCED_ROW_2' });
    conn.query
      .mockResolvedValueOnce([{ insertId: 1 }])
      .mockRejectedValueOnce(fkErr);

    await expect(
      invoiceService.createInvoice(pool, { contract_id: 999, customer_id: 1, type: 1, amount: 100 }, 1)
    ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });

    expect(pool.getConnection).toHaveBeenCalledTimes(1);
    expect(conn.rollback).toHaveBeenCalledTimes(1);
  });
});
