/**
 * transferService 单元测试 —— 客户转移（双方同意制）
 *
 * 规则来源：委托人 2026-09-10 确认
 *   · 需接收人同意才生效 · 不可撤回 · 超 3 天自动回流
 *
 * 重点锁定：
 *   - 越权（非接收人处理、非负责人发起）
 *   - 重复处理 / 状态机约束
 *   - 并发保护：客户归属变更以「期望的原负责人」为条件
 */

jest.mock('../services/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue({ id: 1 })
}));

const notificationService = require('../services/notificationService');
const transferService = require('../services/transferService');

/**
 * 构造连接 mock：按 SQL 片段分派返回，避免依赖调用次序。
 *
 * ⚠️ 注意 mysql2 的两种返回形态（这是易错点）：
 *   · SELECT → 首元素是【行数组】，故 handlers 值传 [{ id: 1 }]
 *   · UPDATE/INSERT → 首元素是【ResultSetHeader 对象】，故 handlers 值传 { affectedRows: 1 }
 *   本函数统一再包一层 [x]，以匹配服务端 `const [x] = await query()` 的解构写法。
 *
 * 模式需足够具体：`'SET owner_id = ?'` 用于客户归属更新，
 * `'UPDATE crm_customer_transfer'` 用于转移单更新，避免二者互相误匹配。
 */
function makeConn(handlers = {}) {
  return {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
    query: jest.fn().mockImplementation((sql) => {
      const s = String(sql);
      for (const [pattern, result] of Object.entries(handlers)) {
        if (s.includes(pattern)) return Promise.resolve([typeof result === 'function' ? result(s) : result]);
      }
      // 默认：视为 UPDATE/INSERT 成功（ResultSetHeader 形态）
      return Promise.resolve([{ affectedRows: 1, insertId: 1 }]);
    })
  };
}

function makePool(conn) {
  return {
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn().mockResolvedValue(conn),
    __conn: conn
  };
}

const CUSTOMER_ROW = [{ id: 10, company_name: 'A公司', owner_id: 5 }];
const USER_ROW = [{ id: 7, real_name: '销售B' }];
const PENDING_ROW = [
  {
    id: 100,
    customer_id: 10,
    from_user_id: 5,
    to_user_id: 7,
    status: 'pending',
    expire_at: new Date(Date.now() + 86400000)
  }
];

/** 常用 handlers 组合 */
const baseHandlers = () => ({
  'FROM crm_customer WHERE id': CUSTOMER_ROW,
  'FROM sys_user': USER_ROW,
  'FROM crm_customer_transfer': []
});

beforeEach(() => {
  notificationService.createNotification.mockClear();
});

describe('transferService 客户转移（双方同意制）', () => {
  describe('createTransfer 发起', () => {
    test('正常发起：写入 pending 并通知接收人', async () => {
      const conn = makeConn(baseHandlers());
      const pool = makePool(conn);

      const r = await transferService.createTransfer(
        pool,
        { customer_id: 10, to_user_id: 7, reason: '交接' },
        5
      );

      expect(r.to_user_id).toBe(7);
      expect(r.expire_days).toBe(3);
      expect(conn.commit).toHaveBeenCalled();
      expect(notificationService.createNotification).toHaveBeenCalledTimes(1);
      expect(notificationService.createNotification.mock.calls[0][1].user_id).toBe(7);
    });

    test('不能转移给自己', async () => {
      const pool = makePool(makeConn());
      await expect(
        transferService.createTransfer(pool, { customer_id: 10, to_user_id: 5 }, 5)
      ).rejects.toThrow(/不能转移给自己/);
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test('不是该客户负责人时拒绝', async () => {
      const conn = makeConn(baseHandlers());
      const pool = makePool(conn);
      // 客户 owner_id = 5，但发起人是 9
      await expect(
        transferService.createTransfer(pool, { customer_id: 10, to_user_id: 7 }, 9)
      ).rejects.toThrow(/只能转移自己负责的客户/);
      expect(conn.rollback).toHaveBeenCalled();
    });

    test('客户无负责人时提示可直接认领', async () => {
      const handlers = baseHandlers();
      handlers['FROM crm_customer WHERE id'] = [{ id: 10, company_name: 'A公司', owner_id: null }];
      const pool = makePool(makeConn(handlers));

      await expect(
        transferService.createTransfer(pool, { customer_id: 10, to_user_id: 7 }, 5)
      ).rejects.toThrow(/无需转移/);
    });

    test('已存在待处理申请时拒绝（避免归属歧义）', async () => {
      const handlers = baseHandlers();
      handlers['FROM crm_customer_transfer'] = [{ id: 99 }];
      const pool = makePool(makeConn(handlers));

      await expect(
        transferService.createTransfer(pool, { customer_id: 10, to_user_id: 7 }, 5)
      ).rejects.toThrow(/已有待处理的转移申请/);
    });

    test('接收人不存在或已停用时拒绝', async () => {
      const handlers = baseHandlers();
      handlers['FROM sys_user'] = [];
      const pool = makePool(makeConn(handlers));

      await expect(
        transferService.createTransfer(pool, { customer_id: 10, to_user_id: 999 }, 5)
      ).rejects.toThrow(/接收人不存在或已停用/);
    });
  });

  describe('acceptTransfer 同意', () => {
    test('正常同意：归属变更为接收人并写 pool_log', async () => {
      const conn = makeConn({
        'FROM crm_customer_transfer': PENDING_ROW,
        'SET owner_id = ?': { affectedRows: 1 },
        'UPDATE crm_customer_transfer': { affectedRows: 1 }
      });
      const pool = makePool(conn);

      const r = await transferService.acceptTransfer(pool, 100, 7);

      expect(r.status).toBe('accepted');
      expect(conn.commit).toHaveBeenCalled();

      // 归属变更条件必须带 owner_id = 期望的原负责人（并发保护）
      const ownerUpdate = conn.query.mock.calls.find((c) => String(c[0]).includes('SET owner_id = ?'));
      expect(String(ownerUpdate[0])).toContain('AND owner_id = ?');
      expect(ownerUpdate[1]).toEqual([7, 10, 5]);

      // 需通知原负责人
      expect(notificationService.createNotification.mock.calls[0][1].user_id).toBe(5);
    });

    test('非接收人处理时拒绝', async () => {
      const pool = makePool(makeConn({ 'FROM crm_customer_transfer': PENDING_ROW }));
      await expect(transferService.acceptTransfer(pool, 100, 999)).rejects.toThrow(/只有接收人本人/);
    });

    test('申请已处理时拒绝（状态机约束）', async () => {
      const pool = makePool(
        makeConn({ 'FROM crm_customer_transfer': [{ ...PENDING_ROW[0], status: 'rejected' }] })
      );
      await expect(transferService.acceptTransfer(pool, 100, 7)).rejects.toThrow(/已处理/);
    });

    test('超过有效期时拒绝', async () => {
      const pool = makePool(
        makeConn({ 'FROM crm_customer_transfer': [{ ...PENDING_ROW[0], expire_at: new Date(Date.now() - 1000) }] })
      );
      await expect(transferService.acceptTransfer(pool, 100, 7)).rejects.toThrow(/超过有效期/);
    });

    test('客户已被他人接手时中止（并发保护，不静默覆盖）', async () => {
      const conn = makeConn({
        'FROM crm_customer_transfer': PENDING_ROW,
        'SET owner_id = ?': { affectedRows: 0 } // 期望原负责人已不匹配
      });
      const pool = makePool(conn);

      await expect(transferService.acceptTransfer(pool, 100, 7)).rejects.toThrow(/负责人已变更/);
      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.commit).not.toHaveBeenCalled();
    });

    test('申请不存在时报 404 而非崩溃', async () => {
      const pool = makePool(makeConn({ 'FROM crm_customer_transfer': [] }));
      await expect(transferService.acceptTransfer(pool, 999, 7)).rejects.toMatchObject({ code: 404006 });
    });
  });

  describe('rejectTransfer 拒绝', () => {
    test('正常拒绝：状态置 rejected、记录备注，且不动客户归属', async () => {
      const conn = makeConn({
        'FROM crm_customer_transfer': PENDING_ROW,
        'UPDATE crm_customer_transfer': { affectedRows: 1 }
      });
      const pool = makePool(conn);

      const r = await transferService.rejectTransfer(pool, 100, 7, '客户不熟');

      expect(r.status).toBe('rejected');
      const updCall = conn.query.mock.calls.find((c) => String(c[0]).includes('UPDATE crm_customer_transfer'));
      expect(updCall[1]).toContain('客户不熟');
      // 关键：拒绝不得改动客户归属
      const ownerUpdate = conn.query.mock.calls.find((c) => String(c[0]).includes('SET owner_id = ?'));
      expect(ownerUpdate).toBeUndefined();
    });

    test('非接收人不能拒绝', async () => {
      const pool = makePool(makeConn({ 'FROM crm_customer_transfer': PENDING_ROW }));
      await expect(transferService.rejectTransfer(pool, 100, 999)).rejects.toThrow(/只有接收人本人/);
    });
  });

  describe('expireTransfers 超时回流', () => {
    test('将超期 pending 置为 expired，且不触碰客户表', async () => {
      const pool = { query: jest.fn().mockResolvedValue([{ affectedRows: 3 }]) };

      const r = await transferService.expireTransfers(pool);

      expect(r.expired).toBe(3);
      const sql = String(pool.query.mock.calls[0][0]);
      expect(sql).toContain('expire_at <= NOW()');
      expect(sql).not.toContain('crm_customer SET');
    });
  });

  describe('listMyPending 待处理列表', () => {
    test('返回分页结构，且只查当前用户的 pending', async () => {
      const pool = {
        query: jest.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]])
      };

      const r = await transferService.listMyPending(pool, 7, { page: 1, pageSize: 20 });

      expect(r).toHaveProperty('list');
      expect(r).toHaveProperty('total');
      expect(String(pool.query.mock.calls[0][0])).toContain('t.status = ?');
      expect(String(pool.query.mock.calls[1][0])).toContain('to_user_id = ?');
    });
  });
});
