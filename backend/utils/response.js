/**
 * 统一响应工具函数
 * 用于规范化 API 响应格式
 */

const success = (res, data = null, message = 'success') => {
  return res.json({ code: 200, message, data });
};

const fail = (res, message = '请求失败', code = 400) => {
  return res.status(code).json({ code, message, data: null });
};

const serverError = (res, message = '服务器内部错误') => {
  return res.status(500).json({ code: 500, message, data: null });
};

const notFound = (res, message = '资源不存在') => {
  return res.status(404).json({ code: 404, message, data: null });
};

const forbidden = (res, message = '没有操作权限') => {
  return res.status(403).json({ code: 403, message, data: null });
};

module.exports = { success, fail, serverError, notFound, forbidden };
