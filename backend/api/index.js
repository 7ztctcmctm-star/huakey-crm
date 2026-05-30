// Vercel Serverless Function 入口
// 将 Express app 导出为 @vercel/node 可用的 handler
const app = require('../app');
module.exports = app;
