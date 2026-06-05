const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const isProduction = process.env.NODE_ENV === 'production';

const createRateLimiter = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || (isProduction ? 100 : 1000),
    message: {
      code: 429,
      message: '请求过于频繁，请稍后再试',
      data: null
    },
    standardHeaders: true,
    legacyHeaders: false,
    // 修复 Vercel Serverless 环境中的 X-Forwarded-For 问题
    validate: {
      xForwardedForHeader: false,
      forwardedHeader: false,
    },
    keyGenerator: (req, res) => {
      return ipKeyGenerator(req);
    },
    handler: (req, res) => {
      res.status(429).json({
        code: 429,
        message: '请求过于频繁，请稍后再试',
        data: {
          retryAfter: Math.ceil(req.rateLimit.resetTime / 1000) - Date.now() / 1000
        }
      });
    }
  });
};

const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1000
});

// [安全修复] 登录限流收紧：15分钟内最多10次尝试，防止暴力破解
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    code: 429,
    message: '登录尝试次数过多，请15分钟后再试',
    data: null
  }
});

module.exports = {
  createRateLimiter,
  apiLimiter,
  authLimiter
};
