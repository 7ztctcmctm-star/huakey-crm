// Vercel Serverless Function 入口
// 从 frontend/ 目录运行时，后端在 ../backend/
const path = require('path');
const backendApp = require(path.join(__dirname, '../../backend/app'));
module.exports = backendApp;
