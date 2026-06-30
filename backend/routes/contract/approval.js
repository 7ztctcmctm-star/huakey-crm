const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const ROLES = require('../../config/roles');
const { simpleApproveContract } = require('../../services/approvalService');
const logger = require('../../config/logger');

// 审批合同（仅管理员）
// [权限说明] 使用自定义 roleId 校验（ADMIN/MANAGER），无需 checkPermission
router.post('/approve', authenticateToken, async (req, res) => {
  try {
    const { id, approval_status, approval_remark } = req.body;
    if (!req.user.manageAll && ![ROLES.ADMIN, ROLES.MANAGER].includes(req.user.roleId)) {
      return res.status(403).json({ code: 403, message: '无审批权限', data: null });
    }
    if (!id || ![2, 3].includes(approval_status)) {
      return res.status(400).json({ code: 400, message: '参数错误: id必填, approval_status为2(通过)或3(拒绝)', data: null });
    }

    await simpleApproveContract(pool, id, approval_status, approval_remark, req.user.userId);

    res.json({ code: 200, message: approval_status === 2 ? '审批通过' : '已拒绝', data: null });
  } catch (error) {
    const status = error.statusCode || 500;
    logger.error('[合同] 审批合同错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(status).json({ code: status, message: error.message || '审批失败', data: null });
  }
});

module.exports = router;
