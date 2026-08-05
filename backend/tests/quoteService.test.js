/**
 * Quote Service 领域边界测试
 * 验证 FIX-2：报价创建流程不再跨模块写 crm_customer
 * 对应约束：docs/customer-center-freeze-v1.md §「领域边界」DB-1
 */

const quoteService = require('../services/quoteService');
const opportunityService = require('../services/opportunityService');

// Mock 依赖
jest.mock('../config/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));
jest.mock('../utils/pagination', () => ({ paginatedQuery: jest.fn() }));
jest.mock('../config/roles', () => ({ ADMIN_ROLE_CODES: new Set(['super_admin', 'admin']) }));

// 监视 opportunityService（quoteService 内部 require 它）
// 注意：不应 mock opportunityService，因为我们要观察 createQuote 是否触发了客户状态推进
// 但 createQuote 本身不调用 opportunityService.advanceStage（FIX-2 只针对 customerService.forwardStatus）
// 我们用 spyOn 来额外验证不会调用 advanceStage 推进客户相关逻辑
const advanceStageSpy = jest.spyOn(opportunityService, 'advanceStage').mockImplementation(() => Promise.resolve());

// 构造 mock connection（事务）
const buildConnection = () => ({
  beginTransaction: jest.fn().mockResolvedValue(),
  commit: jest.fn().mockResolvedValue(),
  rollback: jest.fn().mockResolvedValue(),
  release: jest.fn(),
  query: jest.fn()
});

// 构造 mock pool
const buildPool = (connection) => ({
  getConnection: jest.fn().mockResolvedValue(connection),
  query: jest.fn()
});

describe('quoteService - 领域边界约束（FIX-2）', () => {
  beforeEach(() => {
    advanceStageSpy.mockClear();
  });

  it('createQuote 不应 import customerService 模块', () => {
    // 读取 quoteService.js 源码验证：FIX-2 已清理 customerService require
    // 注意：注释中可能保留对原逻辑的说明文本，所以只检测可执行代码形式
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../services/quoteService.js'),
      'utf-8'
    );
    // 1. 不应 require customerService 模块
    expect(source).not.toMatch(/require\(['"].*customerService['"]\)/);
    // 2. 不应出现 customerService.forwardStatus( 调用形式（注释里只是文本不带括号）
    expect(source).not.toMatch(/customerService\.forwardStatus\s*\(/);
    // 3. 不应出现 UPDATE crm_customer SET 实际 SQL（注释中不带 SET 关键字）
    expect(source).not.toMatch(/UPDATE\s+crm_customer\s+SET/i);
  });

  it('createQuote 成功时所有 SQL 不应包含 UPDATE crm_customer', async () => {
    const conn = buildConnection();
    // mock createQuote 内部 connection.query 调用顺序：
    // 1. SELECT customer
    // 2. (无 opportunity_id，跳过商机校验)
    // 3. SELECT product (每个 item 一次)
    // 4. generateQuoteNo 内 SELECT COUNT
    // 5. INSERT quote
    // 6. INSERT quote_item
    conn.query
      .mockResolvedValueOnce([[{ id: 1 }]])                 // customer
      .mockResolvedValueOnce([[{ id: 1, name: '产品A', code: 'P001', price: 100 }]]) // product
      .mockResolvedValueOnce([[{ cnt: 0 }]])                 // generateQuoteNo COUNT
      .mockResolvedValueOnce([{ insertId: 100 }])            // INSERT quote
      .mockResolvedValueOnce([{ affectedRows: 1 }]);         // INSERT quote_item

    // pool.query 用于通知创建（在 try/catch 内不阻塞）
    const pool = buildPool(conn);
    pool.query.mockResolvedValue([[{ company_name: '客户A' }]]);

    const result = await quoteService.createQuote(pool, {
      customer_id: 1,
      items: [{ product_id: 1, quantity: 2, unit_price: 100 }],
      discount: 0,
      valid_days: 30,
      remark: '测试报价'
    }, 1);

    expect(result).toHaveProperty('id', 100);
    expect(result).toHaveProperty('quote_no');

    // 验证事务内所有 SQL 均不修改 crm_customer
    const connSqls = conn.query.mock.calls.map(c => c[0]);
    const poolSqls = pool.query.mock.calls.map(c => c[0]);
    const allSqls = [...connSqls, ...poolSqls];

    const updateCustomerSqls = allSqls.filter(sql =>
      /UPDATE\s+crm_customer/i.test(sql)
    );
    expect(updateCustomerSqls).toHaveLength(0);

    // 验证未调用 opportunityService.advanceStage（不应通过推进商机间接影响客户）
    expect(advanceStageSpy).not.toHaveBeenCalled();
  });

  it('createQuote 失败时应回滚事务且不修改客户状态', async () => {
    const conn = buildConnection();
    conn.query
      .mockResolvedValueOnce([[{ id: 1 }]])  // customer 存在
      .mockRejectedValueOnce(new Error('产品不存在')); // product 查询失败

    const pool = buildPool(conn);

    await expect(
      quoteService.createQuote(pool, {
        customer_id: 1,
        items: [{ product_id: 999, quantity: 1, unit_price: 100 }]
      }, 1)
    ).rejects.toThrow();

    expect(conn.rollback).toHaveBeenCalled();
    expect(advanceStageSpy).not.toHaveBeenCalled();
  });

  it('quoteService 模块导出不应包含 forwardStatus 或 customerService 相关方法', () => {
    expect(quoteService.forwardStatus).toBeUndefined();
    expect(quoteService.customerService).toBeUndefined();
  });
});
