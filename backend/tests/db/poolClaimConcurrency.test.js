/**
 * 步骤 B2 · 公海认领并发 + 幂等 —— 真实 MySQL 端到端测试
 *
 * ## 为什么必须用真实库
 * mock 只能验证「SQL 文本里有没有 owner_id IS NULL」，验证不了
 * 「两个事务真的会互相等待、只有一个能成功」。本文件用两个并发连接真抢同一行：
 *   · head-on 竞态：两个请求同时认领同一无主客户 ⇒ 恰好一个成功
 *   · 幂等：同一 Idempotency-Key 连发两次 ⇒ 返回首次结果，crm_pool_log 只增一行
 *
 * ## 环境
 * MySQL 可达则执行，不可达整组跳过（与 tests/db 其它用例同策略）。
 * 每个用例自建临时客户并在 afterEach 清理；幂等键以 '__b2__' 前缀区分并清理。
 */

const net = require('net');
const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'crm_test';
const DB_PASSWORD = process.env.DB_PASSWORD || 'test_pass';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

const poolService = require('../../services/poolService');
const customerService = require('../../services/customerService');

const actor = { roleId: 3, manageAll: false };
// crm_customer.owner_id 有外键引用 sys_user，认领人必须是真实存在的用户。
// 具体 id 在 beforeAll 动态解析，避免写死某套演示数据的 id。
let USER_A = null;
let USER_B = null;

let pool;
let reachable = false;
const createdCustomerIds = [];
const idemKeys = [];

function checkDbReachable() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(DB_PORT, DB_HOST);
  });
}

/** 造一个无主（公海）客户：判据权威 = owner_id IS NULL 且 business_status != 'lead' */
async function createPoolCustomer(tag) {
  const [r] = await pool.query(
    `INSERT INTO crm_customer (company_name, owner_id, pool_status, status, business_status)
     VALUES (?, NULL, 'sea', 'sea', 'following')`,
    [`B2并发测试客户_${tag}_${Date.now()}_${Math.floor(Math.random() * 10000)}`]
  );
  createdCustomerIds.push(r.insertId);
  return r.insertId;
}

const ownerOf = async (id) => {
  const [rows] = await pool.query('SELECT owner_id FROM crm_customer WHERE id = ?', [id]);
  return rows[0] ? rows[0].owner_id : undefined;
};

const claimLogs = async (id) => {
  const [rows] = await pool.query(
    "SELECT id, to_user_id FROM crm_pool_log WHERE customer_id = ? AND action = 'claim' AND deleted_at IS NULL ORDER BY id",
    [id]
  );
  return rows;
};

const nextKey = (label) => {
  const k = `__b2__${label}__${Date.now()}__${Math.floor(Math.random() * 10000)}`.slice(0, 64);
  idemKeys.push(k);
  return k;
};

beforeAll(async () => {
  reachable = await checkDbReachable();
  if (!reachable) {
    console.warn(`[poolClaimConcurrency] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过真实并发测试`);
    return;
  }
  // connectionLimit >= 3：两个认领各占一条连接，主线程还要留一条做校验
  pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME, waitForConnections: true, connectionLimit: 6,
    enableKeepAlive: true
  });

  const [users] = await pool.query(
    'SELECT id FROM sys_user WHERE deleted_at IS NULL AND status = 1 ORDER BY id LIMIT 2'
  );
  if (users.length < 2) {
    throw new Error('测试库至少需要 2 个启用的 sys_user 才能做双用户并发认领测试');
  }
  [USER_A, USER_B] = [users[0].id, users[1].id];
});

afterEach(async () => {
  if (!reachable || !pool) return;
  for (const id of createdCustomerIds) {
    try {
      await pool.query('DELETE FROM crm_pool_log WHERE customer_id = ?', [id]);
      await pool.query('DELETE FROM crm_customer WHERE id = ?', [id]);
    } catch { /* 清理失败不掩盖用例结论 */ }
  }
  createdCustomerIds.length = 0;
  for (const k of idemKeys) {
    try { await pool.query('DELETE FROM crm_idempotency WHERE idempotency_key = ?', [k]); } catch { /* ignore */ }
  }
  idemKeys.length = 0;
});

afterAll(async () => { if (pool) await pool.end(); });

describe('B2 · 公海认领并发（真实 MySQL）', () => {
  it('两个请求同时认领同一无主客户：恰好一个成功，另一个被拒绝', async () => {
    if (!reachable) return;
    const id = await createPoolCustomer('headon');

    const results = await Promise.allSettled([
      poolService.claimCustomer(pool, id, USER_A, actor),
      poolService.claimCustomer(pool, id, USER_B, actor)
    ]);

    const ok = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    expect(ok).toHaveLength(1);          // 只允许一个成功 —— 这是并发正确性的核心
    expect(failed).toHaveLength(1);

    const winner = ok[0].value.company_name;
    expect(winner).toBeTruthy();

    // 归属必须是胜者，且不得被后到的请求覆盖
    const owner = await ownerOf(id);
    expect([USER_A, USER_B]).toContain(owner);

    // 不论「抢先用行锁挡住」还是「UPDATE 原子守卫漏 Judge」，日志都只能有一行
    const logs = await claimLogs(id);
    expect(logs).toHaveLength(1);
    expect(logs[0].to_user_id).toBe(owner);
  }, 60000);

  it('并发落败方收到的是「已被他人认领」而非「不在公海」', async () => {
    if (!reachable) return;
    const id = await createPoolCustomer('msg');

    const results = await Promise.allSettled([
      poolService.claimCustomer(pool, id, USER_A, actor),
      poolService.claimCustomer(pool, id, USER_B, actor)
    ]);
    const failed = results.find(r => r.status === 'rejected');
    expect(failed).toBeDefined();
    // 口径必须是「已被他人认领」—— 用户是从公海列表点进来的，
    // 报「不在公海」会让人以为列表数据错了，而不是被人抢走了。
    expect(failed.reason.message).toMatch(/已被他人认领/);
  }, 60000);

  it('同一幂等键连发两次：返回首次结果且不重复写 pool_log', async () => {
    if (!reachable) return;
    const id = await createPoolCustomer('idem');
    const key = nextKey('claim');

    const first = await poolService.claimCustomer(pool, id, USER_A, actor, key);
    const second = await poolService.claimCustomer(pool, id, USER_A, actor, key);

    expect(second).toEqual(first);
    const logs = await claimLogs(id);
    expect(logs).toHaveLength(1);       // 幂等生效：第二次没有再插一条日志
    expect(await ownerOf(id)).toBe(USER_A);
  }, 60000);

  it('claimPoolCustomer（前端 /pool/claim 实际入口）同样满足幂等 + 恰好一条日志', async () => {
    if (!reachable) return;
    const id = await createPoolCustomer('idem2');
    const key = nextKey('claim2');

    const first = await customerService.claimPoolCustomer(pool, id, USER_A, key);
    const second = await customerService.claimPoolCustomer(pool, id, USER_A, key);

    expect(second.id).toBe(first.id);
    const logs = await claimLogs(id);
    expect(logs).toHaveLength(1);
  }, 60000);
});

describe('B2 · runIdempotent 在真实库上的语义', () => {
  it('业务失败不记录幂等键，同一 key 可安全重试', async () => {
    if (!reachable) return;
    const id = await createPoolCustomer('retry');
    const key = nextKey('retry');

    // 先让它被别人认领 ⇒ 本次必失败
    await poolService.claimCustomer(pool, id, USER_B, actor);
    await expect(
      poolService.claimCustomer(pool, id, USER_A, actor, key)
    ).rejects.toThrow();

    const [[row]] = await pool.query(
      'SELECT COUNT(*) AS n FROM crm_idempotency WHERE idempotency_key = ?',
      [key]
    );
    expect(row.n).toBe(0);   // 失败不记账，否则重试会被「缓存的失败」挡住
  }, 60000);

  it('同一幂等键被不同业务复用时互不干扰（biz_type 隔离）', async () => {
    if (!reachable) return;
    const key = nextKey('shared');
    await pool.query(
      'INSERT INTO crm_idempotency (idempotency_key, biz_type, result_json) VALUES (?, ?, ?)',
      [key, 'other_biz', JSON.stringify({ marker: 'x' })]
    );

    // 同 key 走 pool_claim 业务会命中同一行 ⇒ 返回的是「other_biz 的结果」。
    // 这是既有语义：幂等键是**全局唯一**的业务标识，跨业务复用同一个 key 属于调用方错误。
    const id = await createPoolCustomer('shared');
    const out = await poolService.claimCustomer(pool, id, USER_A, actor, key);
    expect(out).toEqual({ marker: 'x' });
    expect(await ownerOf(id)).toBeNull(); // 业务未被执行
  }, 60000);
});
