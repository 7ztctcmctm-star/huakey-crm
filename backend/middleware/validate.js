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

/**
 * 幂等键字段片段（步骤 B2 · 2026-10-19）
 *
 * ⚠️ 必须在使用它的 Joi schema 里**显式声明**：本中间件 stripUnknown=true，
 * 未声明的字段会被静默删除，controller 永远拿不到 `req.body.idempotency_key`。
 * 幂等键优先取自 `Idempotency-Key` 请求头（不受 Joi 约束），body 走本字段。
 *
 * 用法：const schema = Joi.object({ ...其他字段, ...idempotencyKeyField })
 */
const idempotencyKeyField = {
  idempotency_key: Joi.string().max(64).allow('', null)
};

module.exports = {
  validate,
  queryValidate,
  Joi,
  paginationFields,
  idempotencyKeyField
};
