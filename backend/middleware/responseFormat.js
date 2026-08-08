/**
 * @module middleware/responseFormat
 * @description 统一响应格式中间件
 *
 * 确保所有 API 返回都是 { code, message, data } 三元组。
 * - 已符合格式的 body 直接放行
 * - 非标准格式（裸对象、数组、字符串等）自动包装
 * - null/undefined body 包装为 { code: 200, message: 'success', data: null }
 */

/**
 * 统一响应格式中间件
 * 劫持 res.json，对非标准格式响应自动包装为 { code, message, data } 三元组
 * @param {import('express').Request} req - Express 请求对象
 * @param {import('express').Response} res - Express 响应对象
 * @param {import('express').NextFunction} next - Express next 函数
 * @returns {void}
 */
const responseFormat = (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    // 已经是 { code, message, data } 结构则放行
    if (
      body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      'code' in body &&
      'message' in body &&
      'data' in body
    ) {
      return originalJson(body);
    }
    // 否则自动包装
    return originalJson({ code: 200, message: 'success', data: body ?? null });
  };
  next();
};

module.exports = responseFormat;
