// Vercel Serverless — 主入口
// 直接创建 Express 应用，逐步加载后端模块

// 确保可以找到 node_modules
const path = require('path');
module.paths.unshift(path.join(__dirname, '../node_modules'));
module.paths.unshift(path.join(__dirname, '..'));

// 加载 Express + CORS
const express = require('express');
require('dotenv').config();

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// CORS
app.use(require('cors')({
  origin: isProduction ? (process.env.CORS_ORIGIN || '*') : '*',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 响应格式
app.use((req, res, next) => {
  res.success = (data, msg) => res.json({ code: 200, message: msg || '操作成功', data });
  res.error = (msg, code) => res.status(code || 500).json({ code: code || 500, message: msg || '操作失败', data: null });
  next();
});

// ============================================================
// 加载完整后端 (过程要捕获所有错误)
// ============================================================
let fullApp;
try {
  fullApp = require('../app');
  module.exports = fullApp;
} catch (err) {
  console.error('Failed to load app.js, using fallback:', err.message);
  // Fallback: 返回能用的基础 API
  app.get('/api', (req, res) => {
    res.json({ code: 200, message: 'API running (limited mode)', error: err.message });
  });
  module.exports = app;
}
