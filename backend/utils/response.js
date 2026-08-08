/**
 * @module utils/response
 * @description 统一响应工具函数
 *
 * 规范化 API 响应格式，所有函数返回 { code, message, data } 三元组。
 * 与 responseFormat 中间件配合使用，确保响应格式一致性。
 */

/**
 * 成功响应
 * @param {import('express').Response} res - Express 响应对象
 * @param {*} [data=null] - 响应数据
 * @param {string} [message='success'] - 响应消息
 * @returns {import('express').Response}
 */
const success = (res, data = null, message = 'success') => {
  return res.json({ code: 200, message, data });
};

/**
 * 失败响应
 * @param {import('express').Response} res - Express 响应对象
 * @param {string} [message='请求失败'] - 错误消息
 * @param {number} [code=400] - HTTP 状态码
 * @returns {import('express').Response}
 */
const fail = (res, message = '请求失败', code = 400) => {
  return res.status(code).json({ code, message, data: null });
};

/**
 * 服务器错误响应
 * @param {import('express').Response} res - Express 响应对象
 * @param {string} [message='服务器内部错误'] - 错误消息
 * @returns {import('express').Response}
 */
const serverError = (res, message = '服务器内部错误') => {
  return res.status(500).json({ code: 500, message, data: null });
};

/**
 * 资源不存在响应
 * @param {import('express').Response} res - Express 响应对象
 * @param {string} [message='资源不存在'] - 错误消息
 * @returns {import('express').Response}
 */
const notFound = (res, message = '资源不存在') => {
  return res.status(404).json({ code: 404, message, data: null });
};

/**
 * 无权限响应
 * @param {import('express').Response} res - Express 响应对象
 * @param {string} [message='没有操作权限'] - 错误消息
 * @returns {import('express').Response}
 */
const forbidden = (res, message = '没有操作权限') => {
  return res.status(403).json({ code: 403, message, data: null });
};

module.exports = { success, fail, serverError, notFound, forbidden };
