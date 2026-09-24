const express = require('express');
const registry = require('../../core/ModuleRegistry');
const router = express.Router();

// 子模块挂载
// [认证说明] 本文件为聚合路由，认证由各子路由自行处理（crud/payment/export/approval 均使用 authenticateToken）
router.use('/', require('./crud'));
router.use('/', require('./payment'));
router.use('/', require('./export'));
router.use('/', require('./approval'));

registry.register('contract', {
  routes: router,
  permissions: ['contract', 'contract:add', 'contract:edit', 'contract:delete', 'contract:view']
});

module.exports = router;
