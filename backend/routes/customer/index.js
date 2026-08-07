const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const customerController = require('../../controllers/customerController');

// [认证说明] 本文件为聚合路由，认证由各子路由自行处理
// [安全清理] 已废弃的 pool.js / leads.js / quality.js 不再挂载，功能已迁移
const detailRoutes = require('./detail');
const contactRoutes = require('./contact');
const assignRoutes = require('./assign');
const importRoutes = require('./import');
const centerRoutes = require('./center');

router.use('/', detailRoutes);
router.use('/contact', contactRoutes);
router.use('/', assignRoutes);
router.use('/', importRoutes);
router.use('/', centerRoutes);

// 潜客转化为正式客户（Prompt 4-1）
const convertToCustomerSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});
router.post('/convert-to-customer', authenticateToken, checkPermission('customer:edit'), validate(convertToCustomerSchema), customerController.convertToCustomer);

module.exports = router;
