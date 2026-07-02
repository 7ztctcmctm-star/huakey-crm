/**
 * 统一错误处理中间件
 *
 * - appErrorHandler: 处理 AppError 业务异常与 Joi 校验错误
 * - globalErrorHandler: 兜底错误处理（日志、告警、统一响应）
 */

const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');
const logger = require('../config/logger');
const { alertError, record500Error } = require('../utils/alert');

/**
 * 处理 AppError 与 Joi 校验错误
 * 未知错误通过 next(err) 透传给 globalErrorHandler
 */
// eslint-disable-next-line no-unused-vars
function appErrorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.httpStatus).json(err.toJSON());
  }

  if (err.isJoi) {
    return res.status(ErrorCodes.VALIDATION_ERROR.httpStatus).json({
      code: ErrorCodes.VALIDATION_ERROR.code,
      message: ErrorCodes.VALIDATION_ERROR.message,
      data: err.details.map(d => ({ field: d.path.join('.'), message: d.message }))
    });
  }

  _next(err);
}

/**
 * 全局兜底错误处理
 * 同时处理 AppError / Joi / 未捕获异常
 */
// eslint-disable-next-line no-unused-vars
function globalErrorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.httpStatus).json(err.toJSON());
  }

  if (err.isJoi) {
    return res.status(ErrorCodes.VALIDATION_ERROR.httpStatus).json({
      code: ErrorCodes.VALIDATION_ERROR.code,
      message: ErrorCodes.VALIDATION_ERROR.message,
      data: err.details.map(d => ({ field: d.path.join('.'), message: d.message }))
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const ctx = {
    userId: req.user?.userId || 'anonymous',
    method: req.method,
    path: req.originalUrl,
    ip: req.ip
  };
  logger.error('[AppErrorHandler]', { ...ctx, error: err.stack || err.message, traceId: req.traceId });

  if (statusCode >= 500) {
    record500Error();
  }

  alertError({
    level: statusCode >= 500 ? 'critical' : 'error',
    source: 'AppErrorHandler',
    message: err.stack || err.message,
    traceId: req.traceId
  });

  res.status(statusCode).json({
    code: statusCode,
    message: statusCode === 500 ? '服务器内部错误，请稍后重试' : (err.message || '操作失败'),
    data: null
  });
}

module.exports = { appErrorHandler, globalErrorHandler };
