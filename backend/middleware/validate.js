const Joi = require('joi');

const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (value) req.body = value;
  
  if (error) {
    const details = error.details.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }));
    
    return res.status(400).json({
      code: 400,
      message: '请求参数校验失败',
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

module.exports = {
  validate,
  queryValidate,
  Joi
};
