const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const ROLES = require('../../config/roles');

// 审批合同（仅管理员）
router.post('/approve', authenticateToken, async (req, res) => {
  try {
    const { id, approval_status, approval_remark } = req.body;
    if (!req.user.manageAll && ![ROLES.ADMIN, ROLES.MANAGER].includes(req.user.roleId)) {
      return res.status(403).json({ code: 403, message: '无审批权限', data: null });
    }
    if (!id || ![2, 3].includes(approval_status)) {
      return res.status(400).json({ code: 400, message: '参数错误: id必填, approval_status为2(通过)或3(拒绝)', data: null });
    }

    const [rows] = await pool.query('SELECT id FROM crm_contract WHERE id = ? AND deleted_at IS NULL', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '合同不存在', data: null });
    }

    await pool.query(
      'UPDATE crm_contract SET approval_status = ?, approver_id = ?, approval_remark = ? WHERE id = ?',
      [approval_status, req.user.userId, approval_remark || null, id]
    );

    await pool.query(
      'UPDATE crm_notification SET is_dismissed = 1, is_read = 1 WHERE business_type = ? AND business_id = ? AND is_dismissed = 0',
      ['contract', id]
    );

    res.json({ code: 200, message: approval_status === 2 ? '审批通过' : '已拒绝', data: null });
  } catch (error) {
    console.error('[合同] 审批合同错误:', error);
    res.status(500).json({ code: 500, message: '审批失败', data: null });
  }
});

module.exports = router;
