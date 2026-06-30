const express = require('express');
const router = express.Router();

// 子模块挂载
// [认证说明] 本文件为聚合路由，认证由各子路由自行处理（crud/payment/export/approval 均使用 authenticateToken）
router.use('/', require('./crud'));
router.use('/', require('./payment'));
router.use('/', require('./export'));
router.use('/', require('./approval'));

module.exports = router;
