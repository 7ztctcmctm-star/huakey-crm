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
const { readOnlyPool } = require('./database');
const logger = require('./logger');
const { maskPIIString, maskSqlParams, maskSqlText } = require('../utils/mask');

const SLOW_QUERY_THRESHOLD = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS, 10) || 1000;

/**
 * 安全截断日志值
 * ⚠️ JSON.stringify(undefined) 返回 undefined（而非字符串），直接 .slice(0, 200) 会抛
 * TypeError —— 无参查询（如 `pool.query('SELECT 1')`）一旦超过慢查询阈值，
 * 日志代码本身就会把查询搞挂：成功路径顶替正常结果，失败路径顶替原始 DB 错误。
 * （2026-10-14 上线前审计实测发现，transaction.integration 3 例失败即此根因）
 * @param {*} value - 任意待日志值（string / array / object / undefined）
 * @returns {string} 截断至 200 字符的字符串
 */
function safeSlice(value) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return (s === undefined ? '' : s).slice(0, 200);
}

/**
 * 替换目标连接池的 query 方法，自动记录耗时并标记慢查询
 * @param {object} targetPool - mysql2/promise 连接池实例
 * @param {string} poolName - 连接池名称，用于日志区分
 */
function interceptSlowQuery(targetPool, poolName) {
  // 保存原始 query 方法（bind 到 pool 上保持 this 正确）
  const _originalQuery = targetPool.query.bind(targetPool);

  /**
   * 替换 targetPool.query，自动记录耗时并标记慢查询
   * @param {string|object} sql - SQL 语句
   * @param {Array} [params] - SQL 参数
   * @returns {Promise} 与原始 query 一致
   */
  targetPool.query = async function (sql, params) {
    const start = Date.now();
    try {
      const result = await _originalQuery(sql, params);
      const duration = Date.now() - start;
      if (duration >= SLOW_QUERY_THRESHOLD) {
        // [P1-20] 位置参数没有字段名，按可识别模式（手机/邮箱/证件/银行卡/
        // JWT/bcrypt/长 hex）兜底脱敏；SQL 文本也过一遍，防止内联字面量泄露。
        logger.warn('Slow query detected', {
          pool: poolName,
          sql: safeSlice(maskSqlText(sql)),
          params: safeSlice(maskSqlParams(params)),
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
          pool: poolName,
          sql: safeSlice(maskSqlText(sql)),
          params: safeSlice(maskSqlParams(params)),
          durationMs: duration,
          // MySQL 错误可能回显重复值（如 Duplicate entry 'a@b.com'），同样脱敏
          error: maskPIIString(err.message)
        });
      }
      throw err;
    }
  };
}

interceptSlowQuery(pool, 'pool');
if (readOnlyPool && readOnlyPool !== pool) {
  interceptSlowQuery(readOnlyPool, 'readOnlyPool');
}

module.exports = {
  enableSlowQueryLog: () => {}, // 无操作占位，保持接口一致
  interceptSlowQuery // 导出供单测注入假连接池，不影响模块加载时的真实拦截
};