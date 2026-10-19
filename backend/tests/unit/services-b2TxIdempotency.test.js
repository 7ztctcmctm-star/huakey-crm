/**
 * 步骤 B2 · 事务与幂等（服务层单测）
 *
 * 覆盖：
 *   · opportunityService.advanceStage：三步写在事务内；失败回滚；传连接时并入外层事务
 *   · quoteService.approveQuote：三步写同事务；非关键的商机推进失败只回滚子步骤、主流程仍提交
 *   · runIdempotent 接入：convertToContract / createInvoice / transfer / submitRequest
 *     同 key 重放返回首次结果且不再执行业务（不产生重复行）
 */

jest.mock('../../middleware/logger', () => ({
  createRouteLogger: () => jest.fn().mockResolvedValue(),
  logAction: jest.fn().mockResolvedValue(),
  logFieldChanges: jest.fn().mockResolvedValue(),
  getIpAddress: () => '127.0.0.1'
}));
jest.mock('../../middleware/permission', () => ({ buildDataPermissionWhere: jest.fn() }));
jest.mock('../../utils/fieldLog', () => ({ logFieldChanges: jest.fn() }));
jest.mock('../../utils/notification', () => ({ sendMarkdown: jest.fn() }));
jest.mock('../../utils/sseManager', () => ({ send: jest.fn() }));
jest.mock('../../config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../services/notificationService', () => ({
  dismissByBusiness: jest.fn().mockResolvedValue({ affectedRows: 1 }),
  createNotification: jest.fn().mockResolvedValue({})
}));

const opportunityService = require('../../services/opportunityService');
const quoteService = require('../../services/quoteService');
const invoiceService = require('../../services/invoiceService');
const transferService = require('../../services/transferService');
const purchaseRequestService = require('../../services/purchaseRequestService');

const makeConn = () => ({
  query: jest.fn(),
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  release: jest.fn()
});

const makePool = (conn, extra = {}) => ({
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue(conn),
  ...extra
});

beforeEach(() => jest.clearAllMocks());

// ============================================================================
// advanceStage：三步写必须同事务
// ============================================================================
describe('opportunityService.advanceStage 事务边界', () => {
  it('传 pool 时自己开事务：UPDATE stage + INSERT stage_log 在同一事务内提交', async () => {
    const conn = makeConn();
    const pool = makePool(conn);
    conn.query
      .mockResolvedValueOnce([[{ id: 5, stage: 2 }]])  // SELECT opportunity
      .mockResolvedValueOnce([{ affectedRows: 1 }])    // UPDATE stage + win_rate
      .mockResolvedValueOnce([{ insertId: 11 }]);      // INSERT stage_log

    const out = await opportunityService.advanceStage(pool, 5, 3, 1, { changeReason: '测试' });

    expect(out).toEqual({ oldStage: 2, newStage: 3, stageName: '方案报价' });
    expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.release).toHaveBeenCalledTimes(1);

    // 三条 SQL 必须全在连接上，不能有任何一条跑到 pool
    expect(conn.query.mock.calls).toHaveLength(3);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('stage_log 写入失败必须回滚，不得留下「stage 已改但日志缺失」', async () => {
    const conn = makeConn();
    const pool = makePool(conn);
    conn.query
      .mockResolvedValueOnce([[{ id: 5, stage: 2 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockRejectedValueOnce(new Error('stage_log 写入失败'));

    await expect(opportunityService.advanceStage(pool, 5, 3, 1)).rejects.toThrow('stage_log 写入失败');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('传入已进入事务的连接时并入该事务（不自行 begin/commit）', async () => {
    const conn = makeConn();
    conn.query
      .mockResolvedValueOnce([[{ id: 5, stage: 2 }]])
      .mockResolvedValue([{ affectedRows: 1 }]);

    await opportunityService.advanceStage(conn, 5, 3, 1);

    expect(conn.beginTransaction).not.toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).not.toHaveBeenCalled();
  });

  it('裸 mock pool（无 getConnection）降级为直接执行，行为与改造前一致', async () => {
    const bare = { query: jest.fn() };
    bare.query
      .mockResolvedValueOnce([[{ id: 5, stage: 2 }]])
      .mockResolvedValue([{ affectedRows: 1 }]);

    const out = await opportunityService.advanceStage(bare, 5, 4, 1);
    expect(out.newStage).toBe(4);
    expect(bare.query).toHaveBeenCalledTimes(3);
  });
});

// ============================================================================
// approveQuote：审批落库 + 消除通知 + 商机推进，同事务；非关键步骤走 SAVEPOINT
// ============================================================================
describe('quoteService.approveQuote 事务与 SAVEPOINT', () => {
  it('审批通过：主流程与商机推进在同一事务提交', async () => {
    const conn = makeConn();
    const pool = makePool(conn);
    conn.query.mockImplementation((sql) => {
      const s = String(sql);
      if (s.includes('FROM crm_quote')) return Promise.resolve([[{ id: 300, opportunity_id: 77 }]]);
      if (s.includes('FROM crm_opportunity')) return Promise.resolve([[{ stage: 2 }]]);
      return Promise.resolve([{ affectedRows: 1 }]);
    });

    const out = await quoteService.approveQuote(pool, 300, 2, 'ok', 9);

    expect(out).toEqual({ success: true });
    expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    // 商机推进必须并入同一连接，而不是另开连接
    const oppSql = conn.query.mock.calls.find((c) => String(c[0]).includes('FROM crm_opportunity'));
    expect(oppSql).toBeDefined();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('非关键的商机推进失败：SAVEPOINT 回滚子步骤，审批仍提交', async () => {
    const conn = makeConn();
    const pool = makePool(conn);
    conn.query.mockImplementation((sql) => {
      const s = String(sql);
      if (s.includes('FROM crm_quote')) return Promise.resolve([[{ id: 300, opportunity_id: 77 }]]);
      if (s.includes('FROM crm_opportunity')) return Promise.resolve([[{ stage: 2 }]]);
      if (s.includes('UPDATE crm_opportunity')) return Promise.reject(new Error('商机推进失败'));
      return Promise.resolve([{ affectedRows: 1 }]);
    });

    const out = await quoteService.approveQuote(pool, 300, 2, 'ok', 9);

    expect(out).toEqual({ success: true });
    const sqls = conn.query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('ROLLBACK TO SAVEPOINT'))).toBe(true);
    // 关键：主事务仍提交 —— 审批成立，不受子步骤失败影响
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).not.toHaveBeenCalled();
  });

  it('关键步骤失败（UPDATE quote 报错）必须整体回滚', async () => {
    const conn = makeConn();
    const pool = makePool(conn);
    conn.query.mockImplementation((sql) => {
      const s = String(sql);
      if (s.includes('FROM crm_quote')) return Promise.resolve([[{ id: 300, opportunity_id: null }]]);
      if (s.includes('UPDATE crm_quote')) return Promise.reject(new Error('审批写库失败'));
      return Promise.resolve([{ affectedRows: 1 }]);
    });

    await expect(quoteService.approveQuote(pool, 300, 2, 'ok', 9)).rejects.toThrow('审批写库失败');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('报价不存在时抛 QUOTE_NOT_FOUND 且不留半成品', async () => {
    const conn = makeConn();
    const pool = makePool(conn);
    conn.query.mockResolvedValue([[]]);

    await expect(quoteService.approveQuote(pool, 999, 2, 'ok', 9)).rejects.toMatchObject({ code: 404005 });
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 幂等接入
// ============================================================================
describe('runIdempotent 接入点', () => {
  const KEY = 'b2-test-key';

  it('convertToContract：同 key 重放返回首次合同，且不再执行业务', async () => {
    const conn = makeConn();
    const pool = makePool(conn);
    conn.query.mockImplementation((sql) => {
      const s = String(sql);
      if (s.includes('FROM crm_quote')) {
        return Promise.resolve([[{ id: 1, quote_no: 'Q1', customer_id: 8, amount: 100, final_amount: 90, status: 2, approval_status: 2, opportunity_id: null }]]);
      }
      if (s.includes('FROM crm_contract WHERE quote_id')) return Promise.resolve([[]]);
      if (s.includes('COUNT(*) as cnt FROM crm_contract')) return Promise.resolve([[{ cnt: 0 }]]);
      return Promise.resolve([{ affectedRows: 1, insertId: 77 }]);
    });
    // 幂等表：首次查不到 → 之后能查到
    pool.query.mockImplementation((sql, params) => {
      const s = String(sql);
      if (s.includes('SELECT result_json FROM crm_idempotency')) {
        return Promise.resolve(pool.__seen ? [[{ result_json: pool.__cache }]] : [[]]);
      }
      if (s.includes('INSERT INTO crm_idempotency')) { pool.__seen = true; pool.__cache = params[2]; return Promise.resolve([{ affectedRows: 1 }]); }
      return Promise.resolve([{}]);
    });

    const first = await quoteService.convertToContract(pool, 1, 5, KEY);
    expect(first.contract_id).toBe(77);

    const insertBefore = conn.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO crm_contract (')).length;
    const second = await quoteService.convertToContract(pool, 1, 5, KEY);
    expect(second).toEqual(first);
    const insertAfter = conn.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO crm_contract (')).length;
    expect(insertAfter).toBe(insertBefore); // 重放未再插入合同
  });

  it('createInvoice：同 key 重放不产生第二张发票', async () => {
    const conn = makeConn();
    const pool = makePool(conn);
    conn.query
      .mockResolvedValueOnce([[]])               // SELECT 当日编号
      .mockResolvedValueOnce([{ insertId: 12 }]); // INSERT
    pool.query.mockImplementation((sql, params) => {
      const s = String(sql);
      if (s.includes('SELECT result_json FROM crm_idempotency')) {
        return Promise.resolve(pool.__seen ? [[{ result_json: pool.__cache }]] : [[]]);
      }
      if (s.includes('INSERT INTO crm_idempotency')) { pool.__seen = true; pool.__cache = params[2]; return Promise.resolve([{ affectedRows: 1 }]); }
      return Promise.resolve([{}]);
    });

    const a = await invoiceService.createInvoice(pool, { contract_id: 1, customer_id: 1, type: 1, amount: 100 }, 1, KEY);
    expect(a.id).toBe(12);
    const inserts = conn.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO crm_invoice')).length;

    const b = await invoiceService.createInvoice(pool, { contract_id: 1, customer_id: 1, type: 1, amount: 100 }, 1, KEY);
    expect(b).toEqual(a);
    expect(conn.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO crm_invoice')).length).toBe(inserts);
  });

  it('transferService：同 key 重放不重复发起申请', async () => {
    const conn = makeConn();
    const pool = makePool(conn);
    conn.query.mockImplementation((sql) => {
      const s = String(sql);
      // ⚠️ 顺序敏感：crm_customer_transfer 必须先判，否则被 'FROM crm_customer' 前缀误命中
      if (s.includes('FROM crm_customer_transfer')) return Promise.resolve([[]]);
      if (s.includes('FROM crm_customer')) return Promise.resolve([[{ id: 11, company_name: 'C', owner_id: 2 }]]);
      if (s.includes('JOIN sys_role')) return Promise.resolve([[{ id: 3, real_name: '接' }]]);
      return Promise.resolve([{ affectedRows: 1, insertId: 55 }]);
    });
    pool.query.mockImplementation((sql, params) => {
      const s = String(sql);
      if (s.includes('SELECT result_json FROM crm_idempotency')) {
        return Promise.resolve(pool.__seen ? [[{ result_json: pool.__cache }]] : [[]]);
      }
      if (s.includes('INSERT INTO crm_idempotency')) { pool.__seen = true; pool.__cache = params[2]; return Promise.resolve([{ affectedRows: 1 }]); }
      return Promise.resolve([{}]);
    });

    const a = await transferService.createTransfer(pool, { customer_id: 11, to_user_id: 3 }, 2, KEY);
    expect(a.id).toBe(55);
    const inserts = conn.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO crm_customer_transfer')).length;

    const b = await transferService.createTransfer(pool, { customer_id: 11, to_user_id: 3 }, 2, KEY);
    expect(b).toEqual(a);
    expect(conn.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO crm_customer_transfer')).length).toBe(inserts);
  });

  it('submitRequest：同 key 重放不重复 UPDATE，且 UPDATE 带 status=draft 守卫', async () => {
    const conn = makeConn();
    const pool = makePool(conn);
    conn.query
      .mockResolvedValueOnce([[{ id: 9, applicant_id: 4, status: 'draft' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    pool.query.mockImplementation((sql, params) => {
      const s = String(sql);
      if (s.includes('SELECT result_json FROM crm_idempotency')) {
        return Promise.resolve(pool.__seen ? [[{ result_json: pool.__cache }]] : [[]]);
      }
      if (s.includes('INSERT INTO crm_idempotency')) { pool.__seen = true; pool.__cache = params[2]; return Promise.resolve([{ affectedRows: 1 }]); }
      return Promise.resolve([{}]);
    });

    const a = await purchaseRequestService.submitRequest(pool, 9, { userId: 4 }, KEY);
    expect(a).toBe(true);

    const updateSql = String(conn.query.mock.calls[1][0]);
    expect(updateSql).toMatch(/AND\s+status\s*=\s*'draft'/i);

    const b = await purchaseRequestService.submitRequest(pool, 9, { userId: 4 }, KEY);
    expect(b).toBe(true);
    const updates = conn.query.mock.calls.filter((c) => String(c[0]).startsWith('UPDATE')).length;
    expect(updates).toBe(1); // 重放未再 UPDATE
  });
});
