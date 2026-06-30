/**
 * 慢查询日志拦截器
 * 通过替换 pool.query 方法，在每次查询前后计时。
 * 超过阈值的查询输出到 winston logger。
 *
 * 用法：在 app.js 最顶部（helmet 之后）require 一次即可。
 *   require('./config/slowQuery');
 *
 * 环境变量：
 *   SLOW_QUERY_THRESHOLD_MS — 慢查询阈值(ms)，默认 1000
 */

const pool = require('./database');
const logger = require('./logger');

const SLOW_QUERY_THRESHOLD = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS, 10) || 1000;

// 保存原始 query 方法（bind 到 pool 上保持 this 正确）
const _originalQuery = pool.query.bind(pool);

/**
 * 替换 pool.query，自动记录耗时并标记慢查询
 * @param {string|object} sql - SQL 语句
 * @param {Array} [params] - SQL 参数
 * @returns {Promise} 与原始 pool.query 一致
 */
pool.query = async function (sql, params) {
  const start = Date.now();
  try {
    const result = await _originalQuery(sql, params);
    const duration = Date.now() - start;
    if (duration >= SLOW_QUERY_THRESHOLD) {
      logger.warn('Slow query detected', {
        sql: typeof sql === 'string' ? sql.slice(0, 200) : JSON.stringify(sql).slice(0, 200),
        params: JSON.stringify(params).slice(0, 200),
        durationMs: duration,
        thresholdMs: SLOW_QUERY_THRESHOLD
      });
    }
    return result;
  } catch (err) {
    const duration = Date.now() - start;
    // 失败也记录慢查询（排除快速失败的情况）
    if (duration >= SLOW_QUERY_THRESHOLD) {
      logger.warn('Slow query failed', {
        sql: typeof sql === 'string' ? sql.slice(0, 200) : JSON.stringify(sql).slice(0, 200),
        params: JSON.stringify(params).slice(0, 200),
        durationMs: duration,
        error: err.message
      });
    }
    throw err;
  }
};

module.exports = { enableSlowQueryLog: () => {} }; // 无操作占位，保持接口一致