const crypto = require('crypto');

/**
 * Trace ID 中间件
 * 为每个请求生成唯一追踪 ID，注入 req.traceId 并写入响应头 X-Trace-Id
 * @param {object} req - Express 请求对象
 * @param {object} res - Express 响应对象
 * @param {function} next - Express next 函数
 */
function traceIdMiddleware(req, res, next) {
  const traceId = crypto.randomUUID();
  req.traceId = traceId;
  res.setHeader('X-Trace-Id', traceId);
  next();
}

module.exports = traceIdMiddleware;
