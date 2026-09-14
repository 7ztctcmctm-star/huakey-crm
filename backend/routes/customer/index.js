const express = require('express');
const router = express.Router();

// [认证说明] 本文件为聚合路由，认证由各子路由自行处理
// [历史下线]
//   - pool.js / leads.js / quality.js：已废弃不再挂载，功能迁移至 /api/v1/pool、/api/v1/leads
//   - center.js（2026-09-14 阶段2 移除）：池化视图旧端点 leads-pool / formal / pool-list /
//     convert-lead / release-to-pool / claim-pool，替代端口为 /api/v1/customers、/api/v1/leads、/api/v1/pool
//   - convert-to-customer（2026-09-14 阶段2 移除）：替代端口为 POST /api/v1/leads/convert
const detailRoutes = require('./detail');
const contactRoutes = require('./contact');
const assignRoutes = require('./assign');
const importRoutes = require('./import');

router.use('/', detailRoutes);
router.use('/contact', contactRoutes);
router.use('/', assignRoutes);
router.use('/', importRoutes);

module.exports = router;
