const express = require('express');
const registry = require('../core/ModuleRegistry');
const pool = require('../config/database');
const { validate, Joi } = require('../middleware/validate');
const router = express.Router();

const clientMetricSchema = Joi.object({
  metric_type: Joi.string().required().max(10),
  value: Joi.number().required(),
  rating: Joi.string().max(30).allow('', null),
  page_url: Joi.string().max(500).allow('', null)
});

// 自动建表
pool.query(`CREATE TABLE IF NOT EXISTS sys_client_perf (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  metric_type VARCHAR(10) NOT NULL,
  value DOUBLE NOT NULL,
  rating VARCHAR(30) DEFAULT NULL,
  page_url VARCHAR(500) DEFAULT NULL,
  user_agent VARCHAR(500) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_type (metric_type),
  INDEX idx_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(() => {});

// POST /api/metrics/client — 无需认证
// 前端 Perfume 在登录前就会通过 navigator.sendBeacon 上报 Web Vitals（sendBeacon 无法携带 cookie/自定义 header），
// 且上报内容仅为客户端性能指标（FCP/LCP/CLS/INP/TTFB 的毫秒值），无安全敏感信息，不做认证校验。
// CSRF 豁免已在 csrf.js SKIP_CSRF_PATHS 中配置。
router.post('/client', validate(clientMetricSchema), async (req, res, next) => {
  const { metric_type, value, rating, page_url } = req.body;
  if (!metric_type || typeof value !== 'number') {
    return res.status(400).json({ code: 400, message: '参数无效' });
  }
  await pool.query(
    `INSERT INTO sys_client_perf (metric_type, value, rating, page_url, user_agent) VALUES (?,?,?,?,?)`,
    [metric_type, value, rating || null, page_url || null, req.headers['user-agent'] || null]
  );
  res.status(204).end();
});

registry.register('metrics', { routes: router, permissions: [] });
module.exports = router;
