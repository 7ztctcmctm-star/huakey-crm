/**
 * errorHandler.enhanced.js —— 增强版统一错误处理
 *
 * 重构要点（对照评审报告 M2、M3）：
 * 1. appErrorHandler 与 globalErrorHandler 职责互斥，不再重复处理 AppError/Joi
 *    - appErrorHandler：只处理“已知错误”（AppError + Joi），快速响应后终止
 *    - globalErrorHandler：只兜底“未知错误”，记录 + 告警 + 500 响应
 * 2. 告警只在 statusCode >= 500 时触发（4xx 是客户端问题，告警会淹没真实故障）
 * 3. 兜底映射常见 DB 错误（ER_DUP_ENTRY → 409），避免 controller 到处 catch
 *
 * 使用：直接覆盖 backend/middleware/errorHandler.js
 */

const AppError = require('../errors/AppError')
const ErrorCodes = require('../errors/codes')
const logger = require('../config/logger')
const { alertError, record500Error } = require('../utils/alert')

// 已知的 DB/基础设施错误 → 业务错误码映射（集中处理，controller 不必各自 catch）
const DB_ERROR_MAP = {
  ER_DUP_ENTRY: { code: ErrorCodes.BUSINESS_VALIDATION, httpStatus: 409, message: '数据重复，请核对后重试' }
}

/**
 * 处理已知错误：AppError + Joi 校验错误
 * 命中即响应并终止链路；未知错误透传给 globalErrorHandler
 */
function appErrorHandler(err, req, res, next) {
  // 1. AppError：业务层主动抛出的领域错误
  if (err instanceof AppError) {
    return res.status(err.httpStatus).json(err.toJSON())
  }

  // 2. Joi 校验错误
  if (err.isJoi) {
    return res.status(ErrorCodes.VALIDATION_ERROR.httpStatus).json({
      code: ErrorCodes.VALIDATION_ERROR.code,
      message: ErrorCodes.VALIDATION_ERROR.message,
      data: err.details.map(d => ({ field: d.path.join('.'), message: d.message }))
    })
  }

  // 3. 透传给兜底处理
  next(err)
}

/**
 * 兜底：未知错误（DB 异常、未捕获异常、基础设施错误）
 * - 映射已知 DB 错误
 * - 记录结构化日志 + 仅 5xx 告警
 * - 不向客户端泄露堆栈
 */
// eslint-disable-next-line no-unused-vars
function globalErrorHandler(err, req, res, _next) {
  // 已知 DB 错误映射（controller 没拦到的兜底）
  const mapped = err.code && DB_ERROR_MAP[err.code]
  if (mapped) {
    logger.warn('[DB-Mapped]', { dbCode: err.code, path: req.originalUrl, traceId: req.traceId })
    return res.status(mapped.httpStatus).json({
      code: mapped.code.code,
      message: mapped.message,
      data: null
    })
  }

  const statusCode = err.statusCode || err.status || 500
  const ctx = {
    userId: req.user?.userId || 'anonymous',
    method: req.method,
    path: req.originalUrl,
    ip: req.ip
  }

  // 未知错误一律记 error 级日志（含完整堆栈）
  logger.error('[Unhandled]', { ...ctx, error: err.stack || err.message, traceId: req.traceId })

  // 仅 5xx 计数 + 告警（4xx 是客户端问题，不告警，避免噪音淹没真实故障）
  if (statusCode >= 500) {
    record500Error()
    alertError({
      level: 'critical',
      source: 'globalErrorHandler',
      message: err.stack || err.message,
      traceId: req.traceId
    })
  }

  res.status(statusCode).json({
    code: statusCode,
    message: statusCode >= 500 ? '服务器内部错误，请稍后重试' : (err.message || '操作失败'),
    data: null
  })
}

module.exports = { appErrorHandler, globalErrorHandler }
