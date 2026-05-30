const express = require('express');
const app = express();

// 先只加最基础的路由，验证模块加载
app.get('/api', (req, res) => {
  res.json({ code: 200, message: 'CRM API v2', env: !!process.env.DATABASE_URL });
});

// 下一步：尝试加载数据库
app.get('/api/db-test', async (req, res) => {
  try {
    const pool = require('./config/database');
    const result = await pool.query('SELECT 1 as ok');
    res.json({ code: 200, db: 'connected', result: result.rows });
  } catch(e) {
    res.json({ code: 500, error: e.message });
  }
});

module.exports = app;
