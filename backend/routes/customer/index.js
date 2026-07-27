const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const customerController = require('../../controllers/customerController');

// [认证说明] 本文件为聚合路由，认证由各子路由自行处理
// [安全清理] 已废弃的 pool.js 不再挂载，其 claim/release 等功能已迁移到 assign.js
const detailRoutes = require('./detail');
const contactRoutes = require('./contact');
const assignRoutes = require('./assign');
const importRoutes = require('./import');
const leadsRoutes = require('./leads');
const qualityRoutes = require('./quality');

router.use('/', detailRoutes);
router.use('/contact', contactRoutes);
router.use('/', assignRoutes);
router.use('/', importRoutes);
router.use('/leads', leadsRoutes);
router.use('/', qualityRoutes);

// 潜客转化为正式客户（Prompt 4-1）
const convertToCustomerSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});
router.post('/convert-to-customer', authenticateToken, checkPermission('customer:edit'), validate(convertToCustomerSchema), customerController.convertToCustomer);

module.exports = router;
