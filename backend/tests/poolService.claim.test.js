/**
 * P0-1 公海认领竞态 —— 永久回归测试
 *
 * 缺陷背景：原实现为「先 SELECT 校验 owner_id，再 UPDATE ... WHERE id = ?」，
 * UPDATE 条件里没有 owner_id IS NULL，两个并发请求都会成功，后者覆盖前者。
 *
 * 本测试锁定修复后的关键性质：
 *   1. UPDATE 必须带 owner_id IS NULL 原子守卫
 *   2. affectedRows !== 1 必须抛错（不得静默成功）
 *   3. 失败时必须回滚并释放连接
 *   4. 批量认领遇抢先应「跳过」而非报错（部分成功语义）
 *
 * 注：真实双并发场景的端到端验证另见提交说明中的实测记录
 *（A 组修复后 1 成功/1 失败；B 组旧写法 2 成功，竞态可复现）。
 */

const { claimCustomer, batchClaimCustomers } = require('../services/poolService');

/** 构造一个 pool 客户行 */
function poolCustomer(overrides = {}) {
  return {
    id: 101,
    pool_status: 'sea',
    pool_type: 'public',
    protect_until: null,
    owner_id: null,
    status: 'sea',
    company_name: 'E2E测试客户',
    ...overrides
  };
}

/**
 * 构造连接 mock
 * @param {number} affectedRows UPDATE 的影响行数（0 = 已被他人抢先认领）
 */
function makeConnection(affectedRows = 1) {
  const conn = {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
    query: jest.fn()
  };
  // 第 1 次：UPDATE；第 2 次：INSERT crm_pool_log
  conn.query.mockResolvedValueOnce([{ affectedRows }]);
  conn.query.mockResolvedValue([{ insertId: 1 }]);
  return conn;
}

function makePool(customerRow, affectedRows = 1) {
  const conn = makeConnection(affectedRows);
  return {
    query: jest.fn().mockResolvedValue([[customerRow]]),
    getConnection: jest.fn().mockResolvedValue(conn),
    __conn: conn
  };
}

const actor = { manageAll: true, roleId: 1 };

describe('P0-1 公海认领原子性', () => {
  describe('claimCustomer', () => {
    test('UPDATE 必须带 owner_id IS NULL 原子守卫', async () => {
      const pool = makePool(poolCustomer());

      await claimCustomer(pool, 101, 46, actor);

      const updateCall = pool.__conn.query.mock.calls.find((c) =>
        String(c[0]).includes('UPDATE crm_customer')
      );
      expect(updateCall).toBeDefined();
      const sql = String(updateCall[0]);

      // 核心断言：原子守卫必须在 SQL 里，否则并发下会覆盖他人认领结果
      expect(sql).toContain('owner_id IS NULL');
      expect(sql).toContain('deleted_at IS NULL');
      expect(sql).toMatch(/WHERE\s+id\s*=\s*\?\s+AND\s+owner_id\s+IS\s+NULL/i);
    });

    test('正常认领：提交事务、写日志、返回保护期', async () => {
      const pool = makePool(poolCustomer());

      const result = await claimCustomer(pool, 101, 46, actor);

      expect(pool.__conn.beginTransaction).toHaveBeenCalledTimes(1);
      expect(pool.__conn.commit).toHaveBeenCalledTimes(1);
      expect(pool.__conn.rollback).not.toHaveBeenCalled();
      expect(pool.__conn.release).toHaveBeenCalledTimes(1);

      // 日志必须写入（原实现为独立语句，现纳入同一事务）
      const logCall = pool.__conn.query.mock.calls.find((c) =>
        String(c[0]).includes('crm_pool_log')
      );
      expect(logCall).toBeDefined();
      expect(logCall[1]).toEqual([101, null, 46]);

      // 公海客户（非 lead）认领后有 7 天保护期
      expect(result.protect_until).toBeInstanceOf(Date);
      expect(result.company_name).toBe('E2E测试客户');
    });

    test('并发被抢先（affectedRows=0）必须抛错，不得静默成功', async () => {
      const pool = makePool(poolCustomer(), 0);

      await expect(claimCustomer(pool, 101, 46, actor)).rejects.toMatchObject({
        code: 400005
      });
      await expect(claimCustomer(pool, 101, 46, actor)).rejects.toThrow(/已被他人认领/);

      // 失败必须回滚并释放连接，且不得提交
      expect(pool.__conn.rollback).toHaveBeenCalled();
      expect(pool.__conn.commit).not.toHaveBeenCalled();
      expect(pool.__conn.release).toHaveBeenCalled();

      // 未成功认领时不得写入 claim 日志
      const logCall = pool.__conn.query.mock.calls.find((c) =>
        String(c[0]).includes('crm_pool_log')
      );
      expect(logCall).toBeUndefined();
    });

    test('客户已有人负责时直接拒绝，且不开启连接', async () => {
      const pool = makePool(poolCustomer({ owner_id: 7 }));

      await expect(claimCustomer(pool, 101, 46, actor)).rejects.toThrow('该客户不在公海中');
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test('客户不存在时抛 CUSTOMER_NOT_FOUND', async () => {
      const pool = {
        query: jest.fn().mockResolvedValue([[]]),
        getConnection: jest.fn()
      };

      await expect(claimCustomer(pool, 999, 46, actor)).rejects.toMatchObject({ code: 404002 });
      expect(pool.getConnection).not.toHaveBeenCalled();
    });
  });

  describe('batchClaimCustomers', () => {
    /**
     * 批量流程的调用顺序：SELECT(公海客户) → UPDATE → INSERT(pool_log)
     * 按 SQL 内容分派返回值，避免依赖调用次序。
     */
    function makeBatchConn(affectedRows) {
      const conn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
        query: jest.fn()
      };
      conn.query.mockImplementation((sql) => {
        if (String(sql).includes('SELECT id, pool_status')) {
          return Promise.resolve([[poolCustomer()]]);
        }
        if (String(sql).includes('UPDATE crm_customer')) {
          return Promise.resolve([{ affectedRows }]);
        }
        return Promise.resolve([{ insertId: 1 }]);
      });
      return conn;
    }

    test('遇他人抢先应跳过（部分成功语义），不计入 claimed', async () => {
      const conn = makeBatchConn(0); // UPDATE 影响 0 行 = 已被抢先
      const pool = {
        query: jest.fn(),
        getConnection: jest.fn().mockResolvedValue(conn)
      };

      const result = await batchClaimCustomers(pool, [101], 46, actor);

      expect(result.claimed).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toMatch(/已被他人认领/);
      expect(conn.commit).toHaveBeenCalled();

      // 未认领成功不得写日志
      const logCall = conn.query.mock.calls.find((c) => String(c[0]).includes('crm_pool_log'));
      expect(logCall).toBeUndefined();
    });

    test('批量 UPDATE 同样必须带原子守卫', async () => {
      const conn = makeBatchConn(1);
      const pool = {
        query: jest.fn(),
        getConnection: jest.fn().mockResolvedValue(conn)
      };

      const result = await batchClaimCustomers(pool, [101], 46, actor);

      expect(result.claimed).toBe(1);
      const updateCall = conn.query.mock.calls.find((c) =>
        String(c[0]).includes('UPDATE crm_customer')
      );
      expect(String(updateCall[0])).toContain('owner_id IS NULL');
    });
  });
});
