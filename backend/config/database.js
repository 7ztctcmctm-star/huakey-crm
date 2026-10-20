const mysql = require('mysql2/promise');
const { alertError } = require('../utils/alert');

/**
 * 【步骤 B3 · 时区统一】MySQL 会话时区固定为 +08:00（Asia/Shanghai）
 *
 * 为什么必须显式写：mysql2 的 timezone 默认值是 'local'，即"Node 进程所在机器的本地时区"。
 * 生产容器靠 TZ=Asia/Shanghai 兜底（见 docker-compose*.yml / Dockerfile），但 CI runner 与
 * 开发机未必是 +08:00，一旦漂移：
 *   · 写入侧：Date 对象会被按 Node 本地时区序列化，落库值与业务时间差 8 小时；
 *   · 读取侧：DATETIME/TIMESTAMP 被解析成 Node 本地时区的 Date，前端展示整体偏移。
 * 显式写死 '+08:00' 后，无论进程 TZ 如何，读写口径恒定。
 *
 * dateStrings 评估结论（本次**不开启**，详见 docs/timezone-unification.md）：
 *   · dateStrings: true 会把 DATE/DATETIME/TIMESTAMP 全部返回为字符串，
 *     其中 DATE 列会变成 'YYYY-MM-DD'，`new Date('2026-01-05')` 按 UTC 午夜解析，
 *     与现在（本地午夜）差 8 小时，逾期/到期判断在边界日会整体错一天；
 *   · backend/services、utils、controllers 共 80 处 new Date(...)、4 处 instanceof Date
 *     需要逐处回归，属独立改造批次。
 *   折中建议：若要开启，先只开 `dateStrings: ['DATE']`（mysql2 支持按类型指定），
 *   纯日期列不再经 Date 往返，DATETIME/TIMESTAMP 保持现状，回归通过后再评估第二步。
 */
const DB_TIMEZONE = process.env.DB_TIMEZONE || '+08:00';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'huakey_crm',
  waitForConnections: true,
  connectionLimit: process.env.NODE_ENV === 'production' ? 50 : 20,
  queueLimit: 50,
  // [性能优化] 避免请求在连接池耗尽时无限挂起
  acquireTimeout: 5000,
  connectTimeout: 5000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  multipleStatements: false,
  charset: 'utf8mb4',
  timezone: DB_TIMEZONE
});

pool.on('error', (err) => {
  console.error('数据库连接池错误:', err.message);

  alertError({
    level: 'critical',
    source: 'Database',
    message: err.stack || err.message,
  });
});

const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('数据库连接测试成功');
    connection.release();
  } catch (error) {
    console.error('数据库连接失败:', error.message);
    // 测试环境由测试自行控制连接，避免阻断测试进程
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
};

// 测试环境不强制等待连接测试结果，避免阻断单元/集成测试
if (process.env.NODE_ENV !== 'test') {
  testConnection();
}

/**
 * 带 traceId 的数据库查询包装函数
 * 在 SQL 开头注入 traceId 查询注释，便于链路追踪
 * @param {string} traceId - 请求追踪 ID
 * @param {string} sql - SQL 语句
 * @param {Array} params - SQL 参数
 * @returns {Promise} - pool.query 的结果
 */
async function queryWithTrace(traceId, sql, params) {
  const tracedSql = typeof sql === 'string'
    ? `/* traceId=${traceId} */ ${sql}`
    : sql;
  return pool.query(tracedSql, params);
}

/**
 * 只读连接池（用于报表、AI 查询、搜索等读操作）
 * 未配置 DB_RO_* 时自动降级使用主库连接池
 */
const isReadOnlyPoolAvailable = !!process.env.DB_RO_HOST;
const readOnlyPool = isReadOnlyPoolAvailable
  ? mysql.createPool({
      host: process.env.DB_RO_HOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_RO_PORT || process.env.DB_PORT) || 3306,
      user: process.env.DB_RO_USER || process.env.DB_USER || 'crm_user',
      password: process.env.DB_RO_PASSWORD || process.env.DB_PASSWORD,
      database: process.env.DB_RO_NAME || process.env.DB_NAME || 'huakey_crm',
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      multipleStatements: false,
      charset: 'utf8mb4',
      // 与主池同口径，否则主从/读写分离下同一条记录的日期可能差 8 小时
      timezone: DB_TIMEZONE
    })
  : pool;

module.exports = pool;
module.exports.readOnlyPool = readOnlyPool;
module.exports.isReadOnlyPoolAvailable = isReadOnlyPoolAvailable;
module.exports.queryWithTrace = queryWithTrace;
