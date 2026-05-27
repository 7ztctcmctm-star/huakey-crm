const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// ============ 跟进提醒 API ============

// 1. 获取当前用户的未读提醒列表
router.get('/my-reminders', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [list] = await pool.query(
      `SELECT r.id, r.customer_id, r.reminder_type, r.reminder_date, r.is_read,
              c.company_name, c.contact_name, c.phone, c.last_follow_time,
              DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) as overdue_days
       FROM crm_follow_up_reminder r
       JOIN crm_customer c ON r.customer_id = c.id AND c.status != 0
       WHERE r.owner_id = ? AND r.is_dismissed = 0
       ORDER BY r.create_time DESC
       LIMIT 20`,
      [userId]
    );

    const [unreadCount] = await pool.query(
      `SELECT COUNT(*) as count FROM crm_follow_up_reminder
       WHERE owner_id = ? AND is_read = 0 AND is_dismissed = 0`,
      [userId]
    );

    res.json({
      code: 200, message: '查询成功',
      data: { list, unread_count: unreadCount[0].count }
    });
  } catch (error) {
    console.error('获取提醒错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 2. 获取所有逾期客户列表（老板看全局）
router.post('/overdue-list', authenticateToken, async (req, res) => {
  try {
    const isBoss = req.user.viewAll || req.user.roleId === 1 || req.user.roleId === 2;
    const userId = req.user.userId;
    const { page = 1, pageSize = 20 } = req.body;
    const offset = (page - 1) * pageSize;

    let userFilter = '';
    const params = [];

    if (!isBoss) {
      userFilter = ' AND c.owner_id = ?';
      params.push(userId);
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_customer c
       WHERE c.status NOT IN (2, 3) AND c.status != 0
         AND (c.last_follow_time IS NULL
           OR c.last_follow_time < DATE_SUB(NOW(), INTERVAL 15 DAY))
         ${userFilter}`,
      params
    );

    const [list] = await pool.query(
      `SELECT c.id, c.company_name, c.contact_name, c.phone, c.level, c.status,
              c.last_follow_time, c.create_time,
              DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) as overdue_days,
              u.real_name as owner_name
       FROM crm_customer c
       LEFT JOIN sys_user u ON c.owner_id = u.id
       WHERE c.status NOT IN (2, 3) AND c.status != 0
         AND (c.last_follow_time IS NULL
           OR c.last_follow_time < DATE_SUB(NOW(), INTERVAL 15 DAY))
         ${userFilter}
       ORDER BY overdue_days DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200, message: '查询成功',
      data: { list, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('逾期列表错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 3. 标记提醒为已读
router.post('/mark-read', authenticateToken, async (req, res) => {
  try {
    const { reminder_id } = req.body;
    await pool.query(
      'UPDATE crm_follow_up_reminder SET is_read = 1 WHERE id = ? AND owner_id = ?',
      [reminder_id, req.user.userId]
    );
    res.json({ code: 200, message: '已标记为已读', data: null });
  } catch (error) {
    console.error('标记已读错误:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 4. 一键标记全部已读
router.post('/mark-all-read', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE crm_follow_up_reminder SET is_read = 1 WHERE owner_id = ? AND is_read = 0',
      [req.user.userId]
    );
    res.json({ code: 200, message: '全部已读', data: null });
  } catch (error) {
    console.error('全部已读错误:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 5. 解除提醒（跟进后自动调用或手动解除）
router.post('/dismiss', authenticateToken, async (req, res) => {
  try {
    const { customer_id } = req.body;
    await pool.query(
      'UPDATE crm_follow_up_reminder SET is_dismissed = 1 WHERE customer_id = ? AND owner_id = ? AND is_dismissed = 0',
      [customer_id, req.user.userId]
    );
    res.json({ code: 200, message: '提醒已解除', data: null });
  } catch (error) {
    console.error('解除提醒错误:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

module.exports = router;
