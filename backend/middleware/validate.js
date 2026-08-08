/**
 * @module middleware/validate
 * @description Joi 参数校验中间件
 *
 * 提供 validate / queryValidate 两个中间件工厂函数，
 * 以及公共分页字段片段 paginationFields 供各路由复用。
 *
 * 特性：abortEarly=false（全量报错）、stripUnknown=true（移除未知字段）、convert=true（自动类型转换）
 */

const Joi = require('joi');

/**
 * 创建参数校验中间件
 * @param {Joi.Schema} schema - Joi 校验 schema
 * @param {'body'|'params'|'query'} [source='body'] - 校验来源
 * @returns {import('express').RequestHandler} Express 中间件
 */
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

/**
 * 查询参数专用校验中间件（等同于 validate(schema, 'query')）
 * @param {Joi.Schema} schema - Joi 校验 schema
 * @returns {import('express').RequestHandler} Express 中间件
 */
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

/**
 * 公共分页/关键词字段片段，减少各路由 listSchema 重复定义
 * @type {Joi.Schema}
 */
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
