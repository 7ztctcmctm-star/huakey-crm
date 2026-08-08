/**
 * @module errors/AppError
 * @description 统一业务异常类
 *
 * 使用方式：throw new AppError(ErrorCodes.LOGIN_FAILED, '用户名或密码错误');
 * 所有业务层错误均通过 AppError 抛出，由 errorHandler 中间件统一捕获。
 */

/**
 * 统一业务异常类
 */
class AppError extends Error {
  /**
   * @param {object} errorDef - ErrorCodes 中的条目
   * @param {string} [message] - 可覆盖默认 message
   * @param {object} [details] - 附加详情（如校验字段列表）
   */
  constructor(errorDef, message, details) {
    super(message || errorDef.message);
    this.name = 'AppError';
    this.code = errorDef.code;
    this.httpStatus = errorDef.httpStatus;
    this.status = errorDef.httpStatus;
    this.details = details || null;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      data: this.details
    };
  }
}

module.exports = AppError;
