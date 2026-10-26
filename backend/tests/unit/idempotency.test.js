/**
 * runIdempotent 幂等执行工具单元测试
 *
 * [P0-07 2026-10-23] 覆盖「占位 → 执行 → 回填」协议：
 *   · 并发同 key 只允许一个执行者，后来者等待并复用结果；
 *   · 首次请求未完成时后来者拿到 409002，而不是重复执行；
 *   · 业务失败释放占位，允许安全重试；
 *   · 存储键按 biz_type + user 命名空间隔离；
 *   · 超过 STALE_SECONDS 的残留占位可被接管。
 */

// 必须在 require 之前设置，工具在模块加载时读取这些值
process.env.IDEMPOTENCY_PENDING_WAIT_MS = '150';
process.env.IDEMPOTENCY_POLL_MS = '5';
process.env.IDEMPOTENCY_STALE_SECONDS = '300';

const { runIdempotent, buildStorageKey } = require('../../utils/idempotency');

const dupError = () => Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });

/**
 * 有状态的内存幂等表，模拟真实 SQL 语义
 * @param {{allowStaleDelete?: boolean}} [opts]
 */
function createIdemPool(opts = {}) {
  const store = new Map();
  const query = jest.fn(async (sql, params = []) => {
    const s = String(sql).replace(/\s+/g, ' ');

    if (s.startsWith('INSERT INTO crm_idempotency')) {
      const key = params[0];
      if (store.has(key)) throw dupError();
      store.set(key, null);
      return [{ affectedRows: 1 }];
    }

    if (s.includes('SELECT result_json FROM crm_idempotency')) {
      const key = params[0];
      if (!store.has(key)) return [[]];
      return [[{ result_json: store.get(key) }]];
    }

    if (s.startsWith('UPDATE crm_idempotency')) {
      store.set(params[1], params[0]);
      return [{ affectedRows: 1 }];
    }

    if (s.startsWith('DELETE FROM crm_idempotency')) {
      const key = params[0];
      // 失败释放：DELETE ... AND result_json IS NULL（不带时间条件）
      if (!s.includes('create_time <')) {
        const existed = store.has(key) && store.get(key) === null;
        if (existed) store.delete(key);
        return [{ affectedRows: existed ? 1 : 0 }];
      }
      // 残留占位接管：DELETE ... AND create_time < ...
      if (opts.allowStaleDelete && store.has(key) && store.get(key) === null) {
        store.delete(key);
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }

    return [{}];
  });

  return { pool: { query }, store };
}

describe('runIdempotent（幂等执行工具）', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('无 key 时直接执行业务函数（渐进增强，不破坏未传 key 的调用方）', async () => {
    const pool = { query: jest.fn() };
    const fn = jest.fn().mockResolvedValue({ id: 1 });

    const { result, fromCache } = await runIdempotent(pool, null, 'payment', fn);

    expect(result).toEqual({ id: 1 });
    expect(fromCache).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(pool.query).not.toHaveBeenCalled(); // 不碰幂等表
  });

  it('首次调用先占位、再执行、最后回填结果', async () => {
    const { pool } = createIdemPool();
    const fn = jest.fn().mockResolvedValue({ id: 77 });

    const { result, fromCache } = await runIdempotent(pool, 'key-abc', 'payment', fn, 10);

    expect(result).toEqual({ id: 77 });
    expect(fromCache).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);

    const sqls = pool.query.mock.calls.map(c => String(c[0]));
    const insertIdx = sqls.findIndex(s => s.includes('INSERT INTO crm_idempotency'));
    const updateIdx = sqls.findIndex(s => s.includes('UPDATE crm_idempotency'));
    expect(insertIdx).toBe(0);       // 必须先占位
    expect(updateIdx).toBeGreaterThan(insertIdx); // 业务完成后回填
  });

  it('同 key 二次调用返回缓存结果且不重复执行业务', async () => {
    const { pool, store } = createIdemPool();
    const fn = jest.fn().mockResolvedValue({ id: 77 });

    await runIdempotent(pool, 'key-abc', 'payment', fn, 10);
    expect(store.size).toBe(1);

    const second = await runIdempotent(pool, 'key-abc', 'payment', fn, 10);

    expect(second).toEqual({ result: { id: 77 }, fromCache: true });
    expect(fn).toHaveBeenCalledTimes(1); // 未再执行业务
  });

  it('业务失败时释放占位行（客户端可安全重试，且不会读到失败缓存）', async () => {
    const { pool, store } = createIdemPool();
    const fn = jest.fn().mockRejectedValue(new Error('合同不存在'));

    await expect(runIdempotent(pool, 'key-fail', 'payment', fn, 10)).rejects.toThrow('合同不存在');
    expect(store.size).toBe(0);

    // 同 key 重试允许重新执行
    fn.mockResolvedValue({ id: 5 });
    const retry = await runIdempotent(pool, 'key-fail', 'payment', fn, 10);
    expect(retry).toEqual({ result: { id: 5 }, fromCache: false });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('并发同 key：后到者等待并复用先到者结果，业务只执行一次', async () => {
    const { pool } = createIdemPool();
    let resolveFirst;
    const firstDone = new Promise((resolve) => { resolveFirst = resolve; });
    const fn = jest.fn().mockImplementation(async () => {
      await firstDone;
      return { id: 99 };
    });

    const firstPromise = runIdempotent(pool, 'key-race', 'contract', fn, 10);
    // 等首次请求完成占位
    await new Promise((r) => setTimeout(r, 20));
    const secondPromise = runIdempotent(pool, 'key-race', 'contract', fn, 10);
    // 让首次请求在轮询窗口内完成
    await new Promise((r) => setTimeout(r, 20));
    resolveFirst();

    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(first).toEqual({ result: { id: 99 }, fromCache: false });
    expect(second).toEqual({ result: { id: 99 }, fromCache: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('并发同 key 且首次迟迟未完成：后来者返回 409002，绝不重复执行', async () => {
    const { pool, store } = createIdemPool();
    const storageKey = buildStorageKey('payment', 10, 'key-busy');
    store.set(storageKey, null); // 已有一个进行中的占位

    const fn = jest.fn().mockResolvedValue({ id: 1 });

    await expect(
      runIdempotent(pool, 'key-busy', 'payment', fn, 10)
    ).rejects.toMatchObject({ code: 409002, httpStatus: 409 });

    expect(fn).not.toHaveBeenCalled();
  });

  it('残留过期占位可被后来者接管执行', async () => {
    const { pool, store } = createIdemPool({ allowStaleDelete: true });
    store.set(buildStorageKey('payment', 10, 'key-stale'), null);

    const fn = jest.fn().mockResolvedValue({ id: 42 });
    const out = await runIdempotent(pool, 'key-stale', 'payment', fn, 10);

    expect(out).toEqual({ result: { id: 42 }, fromCache: false });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(store.get(buildStorageKey('payment', 10, 'key-stale')))).toEqual({ id: 42 });
  });

  it('存储键按业务与用户命名空间隔离：同 key 不同用户互不干扰', async () => {
    const { pool } = createIdemPool();
    const fn = jest.fn()
      .mockResolvedValueOnce({ owner: 'A' })
      .mockResolvedValueOnce({ owner: 'B' });

    const a = await runIdempotent(pool, 'shared-key', 'payment', fn, 10);
    const b = await runIdempotent(pool, 'shared-key', 'payment', fn, 11);

    expect(a.result).toEqual({ owner: 'A' });
    expect(b.result).toEqual({ owner: 'B' });
    expect(b.fromCache).toBe(false); // 未误读 A 的结果
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('存储键按业务类型隔离：同 key 不同 bizType 互不干扰', async () => {
    const { pool } = createIdemPool();
    const fn = jest.fn()
      .mockResolvedValueOnce({ biz: 'payment' })
      .mockResolvedValueOnce({ biz: 'invoice' });

    const a = await runIdempotent(pool, 'shared-key', 'payment', fn, 10);
    const b = await runIdempotent(pool, 'shared-key', 'invoice', fn, 10);

    expect(a.result).toEqual({ biz: 'payment' });
    expect(b.result).toEqual({ biz: 'invoice' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('buildStorageKey 固定输出 64 位十六进制摘要', () => {
    const k1 = buildStorageKey('payment', 10, 'raw-key');
    const k2 = buildStorageKey('payment', 10, 'raw-key');
    const k3 = buildStorageKey('payment', 11, 'raw-key');

    expect(k1).toMatch(/^[a-f0-9]{64}$/);
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
    expect(buildStorageKey('invoice', 10, 'raw-key')).not.toBe(k1);
  });
});
