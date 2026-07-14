const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * @deprecated 跟进计划模块已废弃（Prompt 4-2）
 * 跟进计划已合并进跟进记录表 crm_follow_up（通过 is_plan=1 区分）。
 * 统一入口（均已迁移至 /follow-up 路由）：
 *   - 创建计划：POST /api/follow-up/plan/add
 *   - 计划列表：POST /api/follow-up/plan/list
 *   - 完成计划：POST /api/follow-up/plan/complete
 *   - 取消计划：POST /api/follow-up/plan/cancel
 * 原 /follow-plan/* 全部返回 410 Gone。
 */

function deprecated(res) {
  res.status(410).json({
    code: 410,
    message: '跟进计划模块已废弃：跟进计划已合并至跟进记录（is_plan=1）。请使用 POST /api/follow-up/plan/add、/plan/list、/plan/complete、/plan/cancel',
    data: null
  });
}

router.post('/add', authenticateToken, (req, res) => deprecated(res));
router.post('/list', authenticateToken, (req, res) => deprecated(res));
router.post('/complete', authenticateToken, (req, res) => deprecated(res));
router.post('/cancel', authenticateToken, (req, res) => deprecated(res));

module.exports = router;
