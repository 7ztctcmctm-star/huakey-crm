const Joi = require('joi');

const validate = (schema, source = 'body') => (req, res, next) => {
  const raw = source === 'params' ? req.params : (source === 'query' ? req.query : req.body);
  const { error, value } = schema.validate(raw, { abortEarly: false, stripUnknown: true, convert: true });
  if (value) {
    if (source === 'params') req.params = value;
    else if (source === 'query') req.query = value;
    else req.body = value;
  }

  if (error) {
    const details = error.details.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }));

    const message = source === 'query' ? '查询参数校验失败' : '请求参数校验失败';
    return res.status(400).json({
      code: 400,
      message,
      data: details
    });
  }

  next();
};

const queryValidate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.query, { abortEarly: false, stripUnknown: true });
  if (value) req.query = value;

  if (error) {
    const details = error.details.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }));

    return res.status(400).json({
      code: 400,
      message: '查询参数校验失败',
      data: details
    });
  }

  next();
};

// 公共分页/关键词字段片段，减少各路由 listSchema 重复定义
const paginationFields = {
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(20),
  keyword: Joi.string().allow('', null).max(200).default('')
};

module.exports = {
  validate,
  queryValidate,
  Joi,
  paginationFields
};
