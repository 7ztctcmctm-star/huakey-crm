const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const { validate, Joi } = require('../../middleware/validate');
const contractController = require('../../controllers/contractController');

// 审批合同 schema
const approveSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  approval_status: Joi.number().integer().valid(2, 3).required(),
  approval_remark: Joi.string().max(500).allow('', null)
});

// 审批合同（仅管理员）
// [权限说明] 使用自定义 roleId 校验（ADMIN/MANAGER），无需 checkPermission
router.post('/approve', authenticateToken, validate(approveSchema), contractController.approveContract);

module.exports = router;
