/**
 * 统一业务错误码枚举
 * 格式：HTTP_STATUS * 1000 + 自增序号
 */
const ErrorCodes = {
  // 认证 401xxx
  TOKEN_EXPIRED:        { code: 401001, httpStatus: 401, message: 'Token 已过期' },
  TOKEN_INVALID:        { code: 401002, httpStatus: 401, message: '无效的 Token' },
  TOKEN_BLACKLISTED:    { code: 401003, httpStatus: 401, message: 'Token 已失效' },
  LOGIN_FAILED:         { code: 401004, httpStatus: 401, message: '用户名或密码错误' },
  // 权限 403xxx
  PERMISSION_DENIED:    { code: 403001, httpStatus: 403, message: '无操作权限' },
  // 资源 404xxx
  USER_NOT_FOUND:       { code: 404001, httpStatus: 404, message: '用户不存在' },
  CUSTOMER_NOT_FOUND:   { code: 404002, httpStatus: 404, message: '客户不存在' },
  OPPORTUNITY_NOT_FOUND:{ code: 404003, httpStatus: 404, message: '商机不存在' },
  CONTRACT_NOT_FOUND:   { code: 404004, httpStatus: 404, message: '合同不存在' },
  QUOTE_NOT_FOUND:      { code: 404005, httpStatus: 404, message: '报价不存在' },
  RECORD_NOT_FOUND:     { code: 404006, httpStatus: 404, message: '记录不存在' },
  // 业务校验 400xxx
  VALIDATION_ERROR:     { code: 400001, httpStatus: 400, message: '参数校验失败' },
  DUPLICATE_USERNAME:   { code: 400002, httpStatus: 400, message: '用户名已存在' },
  CAPTCHA_EXPIRED:      { code: 400003, httpStatus: 400, message: '验证码已过期' },
  CAPTCHA_WRONG:        { code: 400004, httpStatus: 400, message: '验证码错误' },
  BUSINESS_VALIDATION:  { code: 400005, httpStatus: 400, message: '业务校验失败' },
  // 服务器 500xxx
  INTERNAL_ERROR:       { code: 500001, httpStatus: 500, message: '服务器内部错误' },
  DB_ERROR:             { code: 500002, httpStatus: 500, message: '数据库错误' },
  FILE_UPLOAD_FAILED:   { code: 500003, httpStatus: 500, message: '文件上传失败' },
};

module.exports = ErrorCodes;
