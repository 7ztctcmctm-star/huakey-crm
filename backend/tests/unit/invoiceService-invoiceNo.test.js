/**
 * 发票编号生成（迁移 123 uk_invoice_no 的配套修复）
 *
 * 原实现用 COUNT(*)+1：中间编号被删除/作废后会重新撞上仍然存在的编号（001/002/003 删掉 002
 * → COUNT=2 → 生成 003）。改为「当日已用最大序号 + 1」，并对残留并发冲突做有限重试。
 */

jest.mock('../../middleware/logger', () => ({ createRouteLogger: () => jest.fn().mockResolvedValue() }));
jest.mock('../../middleware/permission', () => ({ buildDataPermissionWhere: jest.fn() }));
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

const dateStr = () => new Date().toISOString().slice(2, 10).replace(/-/g, '');
const dupErr = () => Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });

describe('invoiceService.createInvoice 编号生成', () => {
  beforeEach(() => jest.clearAllMocks());

  it('当日无发票时应生成 001', async () => {
    const conn = createMockConn();
    const pool = { getConnection: jest.fn().mockResolvedValue(conn) };
    conn.query
      .mockResolvedValueOnce([[]])                 // SELECT 当日编号
      .mockResolvedValueOnce([{ insertId: 7 }]);   // INSERT

    const result = await invoiceService.createInvoice(pool, { contract_id: 1, customer_id: 1, type: 1, amount: 100 }, 1);

    expect(result.invoice_no).toBe(`INV-${dateStr()}-001`);
    expect(result.id).toBe(7);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('中间编号被删除后应按最大序号递增，而非 COUNT+1（避免撞已存在的编号）', async () => {
    const conn = createMockConn();
    const pool = { getConnection: jest.fn().mockResolvedValue(conn) };
    // 库里只剩 001 和 003（002 已被删除/作废）：COUNT+1 会得到 003（撞号），MAX+1 应为 004
    conn.query
      .mockResolvedValueOnce([[{ invoice_no: `INV-${dateStr()}-001` }, { invoice_no: `INV-${dateStr()}-003` }]])
      .mockResolvedValueOnce([{ insertId: 8 }]);

    const result = await invoiceService.createInvoice(pool, { contract_id: 1, customer_id: 1, type: 1, amount: 100 }, 1);

    expect(result.invoice_no).toBe(`INV-${dateStr()}-004`);
  });

  it('编号冲突时应重算序号重试，成功后只提交一次', async () => {
    const conn = createMockConn();
    const pool = { getConnection: jest.fn().mockResolvedValue(conn) };
    conn.query
      .mockResolvedValueOnce([[{ invoice_no: `INV-${dateStr()}-001` }]])  // 第 1 次：算得 002
      .mockRejectedValueOnce(dupErr())                                    // 撞 002
      .mockResolvedValueOnce([[{ invoice_no: `INV-${dateStr()}-002` }]])  // 第 2 次：重算得 003
      .mockResolvedValueOnce([{ insertId: 9 }]);                          // 成功

    const result = await invoiceService.createInvoice(pool, { contract_id: 1, customer_id: 1, type: 1, amount: 100 }, 1);

    expect(result.invoice_no).toBe(`INV-${dateStr()}-003`);
    expect(pool.getConnection).toHaveBeenCalledTimes(2);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.release).toHaveBeenCalledTimes(2);
  });

  it('重试耗尽后应冒泡 ER_DUP_ENTRY（由 errorHandler 统一映射为 409）', async () => {
    const conn = createMockConn();
    const pool = { getConnection: jest.fn().mockResolvedValue(conn) };
    conn.query.mockImplementation(async (sql) => {
      if (String(sql).includes('SELECT invoice_no')) return [[]];
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
    const pool = { getConnection: jest.fn().mockResolvedValue(conn) };
    const fkErr = Object.assign(new Error('fk fail'), { code: 'ER_NO_REFERENCED_ROW_2' });
    conn.query
      .mockResolvedValueOnce([[]])
      .mockRejectedValueOnce(fkErr);

    await expect(
      invoiceService.createInvoice(pool, { contract_id: 999, customer_id: 1, type: 1, amount: 100 }, 1)
    ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });

    expect(pool.getConnection).toHaveBeenCalledTimes(1);
    expect(conn.rollback).toHaveBeenCalledTimes(1);
  });
});
