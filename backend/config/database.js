const mysql = require('mysql2/promise');
const { alertError } = require('../utils/alert');

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
  charset: 'utf8mb4'
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
const readOnlyPool = process.env.DB_RO_HOST
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
      charset: 'utf8mb4'
    })
  : pool;

module.exports = pool;
module.exports.readOnlyPool = readOnlyPool;
module.exports.queryWithTrace = queryWithTrace;
