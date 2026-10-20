/**
 * 步骤 B3 · 时区统一 —— 真实 MySQL 端到端校验
 *
 * ## 为什么必须用真实库
 * 单测只能证明「Node 侧 dateCode 取的是北京时间」，证明不了
 * 「MySQL 的 NOW()/DATE(create_time) 与 Node 判定的是同一天」。
 * 三层时区只要有一层没对齐（MySQL 容器仍是 UTC、或连接池没带 timezone），
 * 编号日期与 create_time 就会在每天 00:00–08:00 差一天 —— 这正是本用例要抓的。
 *
 * ## 环境
 * MySQL 可达则执行，不可达整组跳过（与 tests/db 其它用例同策略）。
 */

const net = require('net');
const mysql = require('mysql2/promise');
const { shortDateCode, fullDateCode, dateKey } = require('../../utils/dateCode');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'crm_test';
const DB_PASSWORD = process.env.DB_PASSWORD || 'test_pass';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

let pool;
let reachable = false;
const createdContractIds = [];

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

beforeAll(async () => {
  reachable = await checkDbReachable();
  if (!reachable) {
    console.warn(`[contractNoTimezone] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过时区端到端用例`);
    return;
  }
  // timezone 与 backend/config/database.js 保持一致（'+08:00'）
  pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 3,
    timezone: '+08:00'
  });
});

afterEach(async () => {
  if (!reachable || !pool) return;
  for (const id of createdContractIds) {
    try { await pool.query('DELETE FROM crm_contract WHERE id = ?', [id]); } catch { /* 清理失败不掩盖用例结论 */ }
  }
  createdContractIds.length = 0;
});

afterAll(async () => { if (pool) await pool.end(); });

describe('B3 · 编号日期与 create_time 同日（真实 MySQL）', () => {
  it('MySQL 服务端相对 UTC 必须是 +08:00（NOW()/CURDATE() 的口径）', async () => {
    if (!reachable) return;
    // 注意：mysql2 的 timezone 选项只影响 JS Date 的序列化/解析，
    // 不会执行 SET time_zone。服务端 NOW()/FROM_UNIXTIME() 的口径由
    // 容器 --default-time-zone=+08:00（见 docker-compose*.yml）决定，这里直接量它。
    const [[row]] = await pool.query("SELECT TIME_FORMAT(TIMEDIFF(NOW(), UTC_TIMESTAMP()), '%H:%i') as off");
    expect(row.off).toBe('08:00');
  });

  it('北京时间早 8 点前：MySQL 与 Node 对同一时刻必须判为同一天', async () => {
    if (!reachable) return;
    // 固定时刻：UTC 2026-01-14 23:30 == 北京时间 2026-01-15 07:30（早 8 点前）
    const ts = Math.floor(new Date('2026-01-14T23:30:00Z').getTime() / 1000);

    const [[row]] = await pool.query('SELECT DATE(FROM_UNIXTIME(?)) as d', [ts]);

    // MySQL 侧（按其会话时区换算）必须给出北京当天；若库是 UTC 会得到 2026-01-14 → 立刻变红
    expect(fullDateCode(row.d)).toBe('20260115');
    // Node 侧同口径
    expect(shortDateCode(new Date(ts * 1000))).toBe('260115');
  });

  it('新建合同的编号日期段应与 DATE(create_time) 同日', async () => {
    if (!reachable) return;

    const [[cust]] = await pool.query(
      'SELECT id FROM crm_customer WHERE deleted_at IS NULL ORDER BY id LIMIT 1'
    );
    if (!cust) {
      console.warn('[contractNoTimezone] 无可用客户，跳过端到端编号用例');
      return;
    }

    const code = shortDateCode();
    const contractNo = `TZ-${code}-${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const [res] = await pool.query(
      'INSERT INTO crm_contract (contract_no, customer_id, amount, sign_date) VALUES (?, ?, ?, ?)',
      [contractNo, cust.id, 1, dateKey()]
    );
    createdContractIds.push(res.insertId);

    const [[row]] = await pool.query(
      'SELECT contract_no, DATE(create_time) as d FROM crm_contract WHERE id = ?',
      [res.insertId]
    );

    // 编号里的日期段 = 北京时间当天；create_time 落库后取日期也必须同一天
    expect(row.contract_no.slice(3, 9)).toBe(code);
    expect(fullDateCode(row.d).slice(2)).toBe(code);
  });

  it('当前时刻：Node 的今天与 MySQL 的今天必须是同一天', async () => {
    if (!reachable) return;
    const [[row]] = await pool.query('SELECT DATE(NOW()) as d');
    expect(fullDateCode(row.d)).toBe(fullDateCode());
  });
});
