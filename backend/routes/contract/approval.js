const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const { requireManager } = require('../../middleware/admin');
const { validate, Joi } = require('../../middleware/validate');
const contractController = require('../../controllers/contractController');

// 审批合同 schema
const approveSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  approval_status: Joi.number().integer().valid(2, 3).required(),
  approval_remark: Joi.string().max(500).allow('', null)
});

// 审批合同（管理员/经理，纵深防御：路由层 requireManager + 控制器层 roleId 校验）
// requireManager 允许 manageAll=true 或 roleId=ADMIN(1) 的用户通过
// 控制器层进一步校验: manageAll || roleId IN (1, 2)
router.post('/approve', authenticateToken, requireManager, validate(approveSchema), contractController.approveContract);

module.exports = router;
