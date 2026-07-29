const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const { requireAdmin } = require('../../middleware/admin');
const { validate, Joi } = require('../../middleware/validate');
const contractController = require('../../controllers/contractController');

// 审批合同 schema
const approveSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  approval_status: Joi.number().integer().valid(2, 3).required(),
  approval_remark: Joi.string().max(500).allow('', null)
});

// 审批合同（管理员/经理，纵深防御：路由层 requireAdmin + 控制器层 roleId 校验）
router.post('/approve', authenticateToken, requireAdmin, validate(approveSchema), contractController.approveContract);

module.exports = router;
