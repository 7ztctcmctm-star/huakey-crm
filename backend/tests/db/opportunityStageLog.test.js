/**
 * 商机阶段日志 / 时间轴 / 阶段统计 —— 真实 SQL 可执行性测试
 *
 * ## 为什么必须有这个文件
 *
 * 这三个查询在 `tests/opportunityRoutes.test.js` 与 `tests/opportunityService.test.js` 里
 * 都是**用 mockPool 覆盖**的：SQL 文本从未真正下发到数据库。因此当代码里写成
 * `SELECT l.changed_at`（而权威迁移 `database/migrations/011_opportunity_stage_log.sql`
 * 建表用的是 `create_time`）时，单测全绿、构建全绿，只有真跑接口才炸。
 *
 * 2026-09-11 实测：`GET /api/v1/opportunity/stage-log/:id` 恒定返回 500
 * （`Unknown column 'l.changed_at' in 'field list'`），前端「阶段变更历史」看不到任何数据，
 * E2E `opportunity-stage.spec.js` 的「变更原因落库」断言因此失败。
 *
 * 本文件真连库执行这些查询，锁死「SQL 引用了表里不存在的列」这一类漂移。
 *
 * 环境要求：MySQL 可达（默认 127.0.0.1:3306，库名 huakey_crm_test，与 tests/db 其它用例一致）。
 * 不可达时整组跳过并打印警告——与 migration-roundtrip / readwrite-separation 的做法一致。
 */

const net = require('net');
const mysql = require('mysql2/promise');
const opportunityService = require('../../services/opportunityService');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

const ALLOWED_CUSTOMER_STATUSES = ['following', 'quoted', 'negotiating', 'signed'];

let pool;
let reachable = false;
let skipReason = '';
let customerId = null;
let userId = null;
const createdOpportunityIds = [];

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
    console.warn(`[opportunityStageLog] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过真实 SQL 测试`);
    return;
  }

  pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 2
  });

  try {
    const [customers] = await pool.query(
      `SELECT id FROM crm_customer WHERE deleted_at IS NULL AND status IN (${ALLOWED_CUSTOMER_STATUSES.map(() => '?').join(',')}) LIMIT 1`,
      ALLOWED_CUSTOMER_STATUSES
    );
    customerId = customers.length ? customers[0].id : null;

    const [users] = await pool.query('SELECT id FROM sys_user LIMIT 1');
    userId = users.length ? users[0].id : null;
  } catch (e) {
    reachable = false;
    skipReason = `初始化查询失败：${e.message}`;
    console.warn(`[opportunityStageLog] ${skipReason}，跳过真实 SQL 测试`);
    return;
  }

  if (!customerId) {
    reachable = false;
    skipReason = `测试库 ${DB_NAME} 中没有 status ∈ ${ALLOWED_CUSTOMER_STATUSES.join('/')} 的客户（请先执行 seed-demo）`;
    console.warn(`[opportunityStageLog] ${skipReason}，跳过真实 SQL 测试`);
  }
  if (!userId) {
    reachable = false;
    skipReason = `测试库 ${DB_NAME} 中没有 sys_user 记录`;
    console.warn(`[opportunityStageLog] ${skipReason}，跳过真实 SQL 测试`);
  }
});

afterAll(async () => {
  if (!pool) return;
  // 只清理本测试自己创建的商机（阶段日志随外键 ON DELETE CASCADE 一并删除）
  for (const id of createdOpportunityIds) {
    try {
      await pool.query('DELETE FROM crm_opportunity WHERE id = ?', [id]);
    } catch (e) {
      console.warn(`[opportunityStageLog] 清理商机 ${id} 失败：${e.message}`);
    }
  }
  await pool.end();
});

/** 创建一条一次性商机，登记到待清理列表 */
async function createTestOpportunity(name) {
  const res = await opportunityService.createOpportunity(pool, {
    customer_id: customerId,
    name,
    expected_amount: 1000,
    stage: 1,
    remark: 'opportunityStageLog.test.js 临时数据'
  }, userId);
  createdOpportunityIds.push(res.id);
  return res.id;
}

describe('商机阶段日志真实 SQL（防列名漂移）', () => {
  it('推进阶段后 getStageLog 能返回变更原因，且保留 API 字段名 changed_at', async () => {
    if (!reachable) return; // 库不可用则跳过（已打印原因）

    const reason = `单测原因_${Date.now()}`;
    const oppId = await createTestOpportunity(`单测商机_${Date.now()}`);
    await opportunityService.advanceStage(pool, oppId, 2, userId, { changeReason: reason });

    const logs = await opportunityService.getStageLog(pool, oppId);

    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].change_reason).toBe(reason);
    // 前端（views/opportunity/list.vue、Detail.vue）读的是 changed_at，接口字段名不能变
    expect(logs[0].changed_at).toBeTruthy();
    expect(logs[0].from_stage).toBe(1);
    expect(logs[0].to_stage).toBe(2);
  });

  it('getStageStats 对真实商机可执行（不得抛 Unknown column）', async () => {
    if (!reachable) return;

    const oppId = await createTestOpportunity(`单测商机统计_${Date.now()}`);
    await opportunityService.advanceStage(pool, oppId, 2, userId, { changeReason: '统计用' });

    const stats = await opportunityService.getStageStats(pool, oppId);

    expect(stats).toHaveProperty('stages');
    expect(stats).toHaveProperty('total_hours');
    expect(Array.isArray(stats.stages)).toBe(true);
  });

  it('getTimeline 返回带 event_time 的 stage_change 事件', async () => {
    if (!reachable) return;

    const oppId = await createTestOpportunity(`单测商机时间轴_${Date.now()}`);
    await opportunityService.advanceStage(pool, oppId, 2, userId, { changeReason: '时间轴用' });

    const events = await opportunityService.getTimeline(pool, oppId);

    expect(Array.isArray(events)).toBe(true);
    const stageEvents = events.filter((e) => e.type === 'stage_change');
    expect(stageEvents.length).toBeGreaterThan(0);
    expect(stageEvents[0].event_time).toBeTruthy();
  });

  it('查不到记录时应返回空数组，而不是 SQL 报错', async () => {
    if (!reachable) return;

    await expect(opportunityService.getStageLog(pool, -1)).resolves.toEqual([]);
    await expect(opportunityService.getStageStats(pool, -1)).resolves.toEqual({ stages: [], total_hours: 0 });
  });
});
