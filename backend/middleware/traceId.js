/**
 * @module middleware/traceId
 * @description 链路追踪中间件
 *
 * 为每个请求生成 UUID v4 追踪 ID，注入 req.traceId 并写入响应头 X-Trace-Id。
 * 用于日志关联、慢查询分析、全链路问题排查。
 */

const crypto = require('crypto');

/**
 * Trace ID 中间件
 * 为每个请求生成唯一追踪 ID，注入 req.traceId 并写入响应头 X-Trace-Id
 * @param {import('express').Request} req - Express 请求对象
 * @param {import('express').Response} res - Express 响应对象
 * @param {import('express').NextFunction} next - Express next 函数
 * @returns {void}
 */
function traceIdMiddleware(req, res, next) {
  const traceId = crypto.randomUUID();
  req.traceId = traceId;
  res.setHeader('X-Trace-Id', traceId);
  next();
}

module.exports = traceIdMiddleware;
