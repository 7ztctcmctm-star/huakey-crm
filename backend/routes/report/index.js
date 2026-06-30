const express = require('express');
const router = express.Router();

// 子模块挂载
// [认证说明] 本文件为聚合路由，认证由各子路由自行处理（custom/dashboard/analytics 均使用 authenticateToken）
router.use('/', require('./custom'));
router.use('/', require('./dashboard'));
router.use('/', require('./analytics'));

module.exports = router;
