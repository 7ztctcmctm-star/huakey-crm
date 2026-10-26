/**
 * [P1-26] 报价编辑币种/汇率/商机 —— 服务层行为测试
 *
 * 缺陷回顾：`updateQuoteSchema` 未声明 currency/exchange_rate/opportunity_id，
 * `validate.js` 的 stripUnknown=true 会在进入 service 前静默删除；
 * `updateQuote` 也未解构/写回。前端提交后看到“修改成功”，但外币报价的币种、汇率、
 * 商机关联全部丢失。
 */

const quoteService = require('../../services/quoteService');

jest.mock('../../config/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));
jest.mock('../../utils/pagination', () => ({ paginatedQuery: jest.fn() }));
jest.mock('../../utils/dateCode', () => ({ shortDateCode: () => '261026' }));

function createMockPool(conn) {
  return { getConnection: jest.fn().mockResolvedValue(conn), query: jest.fn().mockResolvedValue([[]]) };
}

function createMockConn() {
  return {
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
    query: jest.fn()
  };
}

const existingQuote = (overrides = {}) => ([{
  id: 1,
  quote_no: 'QUO-261026-001',
  customer_id: 2,
  amount: 100,
  discount: 0,
  final_amount: 100,
  valid_days: 30,
  remark: '',
  status: 1,
  approval_status: 0,
  opportunity_id: null,
  currency: 'CNY',
  exchange_rate: '1.0000',
  create_by: 1,
  create_time: '2026-10-01 00:00:00',
  deleted_at: null,
  ...overrides
}]);

function updateStatement(conn) {
  const call = conn.query.mock.calls.find((c) => String(c[0]).startsWith('UPDATE crm_quote SET'));
  return call ? { sql: call[0], params: call[1] } : null;
}

describe('[P1-26] updateQuote 币种/汇率/商机', () => {
  it('提交外币币种+汇率+商机时应全部写回（不再静默丢弃）', async () => {
    const conn = createMockConn();
    conn.query
      .mockResolvedValueOnce([existingQuote({ opportunity_id: 5, currency: 'USD', exchange_rate: '7.2500' })])
      .mockResolvedValueOnce([[{ id: 5, customer_id: 2 }]])       // 商机归属校验
      .mockResolvedValueOnce([[{ code: 'EUR', exchange_rate: '7.8500' }]]) // 币种字典
      .mockResolvedValueOnce([{ affectedRows: 1 }]);              // UPDATE
    const pool = createMockPool(conn);

    await quoteService.updateQuote(pool, {
      id: 1,
      opportunity_id: 5,
      currency: 'EUR',
      exchange_rate: 7.9
    });

    const stmt = updateStatement(conn);
    expect(stmt).not.toBeNull();
    expect(stmt.sql).toContain('opportunity_id = ?');
    expect(stmt.sql).toContain('currency = ?');
    expect(stmt.sql).toContain('exchange_rate = ?');
    expect(stmt.params).toEqual([5, 'EUR', 7.9, 1]);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('外币未显式给汇率时应取币种字典当前汇率（而非 1.0）', async () => {
    const conn = createMockConn();
    conn.query
      .mockResolvedValueOnce([existingQuote()])
      .mockResolvedValueOnce([[{ code: 'USD', exchange_rate: '7.2500' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const pool = createMockPool(conn);

    await quoteService.updateQuote(pool, { id: 1, currency: 'USD' });

    expect(updateStatement(conn).params).toEqual(['USD', 7.25, 1]);
  });

  it('未换币种且未给汇率时应沿用原汇率（冻结报价时的汇率）', async () => {
    const conn = createMockConn();
    conn.query
      .mockResolvedValueOnce([existingQuote({ currency: 'USD', exchange_rate: '7.1000' })])
      .mockResolvedValueOnce([[{ code: 'USD', exchange_rate: '7.8500' }]]) // 字典现值已变
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const pool = createMockPool(conn);

    await quoteService.updateQuote(pool, { id: 1, exchange_rate: 7.1 });

    // 即便字典现值是 7.85，也保留报价冻结的 7.1
    expect(updateStatement(conn).params).toEqual(['USD', 7.1, 1]);
  });

  it('CNY 汇率恒为 1，忽略伪造的汇率', async () => {
    const conn = createMockConn();
    conn.query
      .mockResolvedValueOnce([existingQuote()])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const pool = createMockPool(conn);

    await quoteService.updateQuote(pool, { id: 1, currency: 'CNY', exchange_rate: 9.9 });

    expect(updateStatement(conn).params).toEqual(['CNY', 1, 1]);
    expect(conn.query.mock.calls.filter((c) => String(c[0]).includes('FROM crm_currency'))).toHaveLength(0);
  });

  it('未登记的币种应抛 400005 并回滚，不得写入', async () => {
    const conn = createMockConn();
    conn.query
      .mockResolvedValueOnce([existingQuote()])
      .mockResolvedValueOnce([[]]); // 字典查不到
    const pool = createMockPool(conn);

    await expect(quoteService.updateQuote(pool, { id: 1, currency: 'XYZ' }))
      .rejects.toMatchObject({ code: 400005, message: '币种 XYZ 不存在或已停用' });

    expect(conn.rollback).toHaveBeenCalled();
    expect(updateStatement(conn)).toBeNull();
  });

  it('商机不属于最终客户时应抛 400005 并回滚', async () => {
    const conn = createMockConn();
    conn.query
      .mockResolvedValueOnce([existingQuote()])
      .mockResolvedValueOnce([[{ id: 99, customer_id: 3 }]]);
    const pool = createMockPool(conn);

    await expect(quoteService.updateQuote(pool, { id: 1, opportunity_id: 99 }))
      .rejects.toMatchObject({ code: 400005, message: '商机与客户不匹配，无法关联' });

    expect(conn.rollback).toHaveBeenCalled();
    expect(updateStatement(conn)).toBeNull();
  });

  it('只改客户时也要复判原商机，避免留下矛盾归属', async () => {
    const conn = createMockConn();
    conn.query
      .mockResolvedValueOnce([existingQuote({ opportunity_id: 5 })])
      .mockResolvedValueOnce([[{ id: 3 }]])                    // 新客户存在
      .mockResolvedValueOnce([[{ id: 5, customer_id: 2 }]]);   // 原商机仍属旧客户
    const pool = createMockPool(conn);

    await expect(quoteService.updateQuote(pool, { id: 1, customer_id: 3 }))
      .rejects.toMatchObject({ code: 400005, message: '商机与客户不匹配，无法关联' });

    expect(conn.rollback).toHaveBeenCalled();
  });

  it('未提交三个字段时不应额外查询或写回（保持既有更新语义）', async () => {
    const conn = createMockConn();
    conn.query
      .mockResolvedValueOnce([existingQuote()])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const pool = createMockPool(conn);

    await quoteService.updateQuote(pool, { id: 1, remark: '改备注' });

    const stmt = updateStatement(conn);
    expect(stmt.sql).not.toContain('currency');
    expect(stmt.sql).not.toContain('exchange_rate');
    expect(stmt.sql).not.toContain('opportunity_id');
    expect(stmt.params).toEqual(['改备注', 1]);
  });
});

describe('[P1-26] createQuote 币种校验', () => {
  it('外币未给汇率时取字典汇率', async () => {
    const conn = createMockConn();
    conn.query
      .mockResolvedValueOnce([[{ id: 2 }]])                                   // customer
      .mockResolvedValueOnce([[{ id: 1, name: '产品A', code: 'P001', price: 100 }]]) // product
      .mockResolvedValueOnce([[{ cnt: 0 }]])                                  // quote_no COUNT
      .mockResolvedValueOnce([[{ code: 'USD', exchange_rate: '7.2500' }]])    // currency
      .mockResolvedValueOnce([{ insertId: 100 }])                             // INSERT quote
      .mockResolvedValueOnce([{ affectedRows: 1 }]);                          // INSERT item
    const pool = createMockPool(conn);

    await quoteService.createQuote(pool, {
      customer_id: 2,
      currency: 'USD',
      items: [{ product_id: 1, quantity: 1, unit_price: 100 }]
    }, 1);

    const insert = conn.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO crm_quote'));
    expect(insert[1]).toEqual(expect.arrayContaining(['USD', 7.25]));
  });
});
