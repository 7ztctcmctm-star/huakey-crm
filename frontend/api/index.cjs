// Vercel Serverless Function
// 设置 NODE_PATH 使后端代码能找到其依赖
process.env.NODE_PATH = require('path').join(__dirname, '../../backend/node_modules');
require('module').Module._initPaths();

// 加载后端 app
const app = require('../../backend/app');
module.exports = app;
