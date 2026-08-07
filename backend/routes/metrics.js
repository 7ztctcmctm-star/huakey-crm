const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
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

// POST /api/metrics/client — 需认证，前端上报性能指标
router.post('/client', authenticateToken, validate(clientMetricSchema), async (req, res, next) => {
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

module.exports = router;
