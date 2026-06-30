const mysql = require('mysql2/promise');
const { alertError } = require('../utils/alert');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'huakey_crm',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 50,
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
    process.exit(1);
  }
};

testConnection();

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

module.exports = pool;
module.exports.queryWithTrace = queryWithTrace;
