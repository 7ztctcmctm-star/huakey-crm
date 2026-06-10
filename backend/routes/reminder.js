const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { getOverdueDays } = require('../utils/config');

// ============ 跟进提醒 API ============

// 1. 获取当前用户的未读提醒列表
router.get('/my-reminders', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const overdueDays = await getOverdueDays();
    const preWarningDays = Math.max(overdueDays - 3, 3);

    // 查询1：合并逾期+今日+明日提醒
    const [allReminders] = await pool.query(
      `SELECT r.id, r.customer_id, r.reminder_type, r.reminder_date, r.is_read,
              r.follow_plan_id, c.company_name, c.contact_name, c.phone, c.last_follow_time,
              DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) as overdue_days,
              fp.plan_content, fp.plan_time
       FROM crm_follow_up_reminder r
       JOIN crm_customer c ON r.customer_id = c.id AND c.status != 0
       LEFT JOIN crm_follow_plan fp ON r.follow_plan_id = fp.id
       WHERE r.owner_id = ? AND r.is_dismissed = 0
         AND r.reminder_type IN ('overdue', 'today', 'upcoming')
       ORDER BY r.reminder_type, r.create_time DESC`,
      [userId]
    );

    const list = allReminders.filter(r => r.reminder_type === 'overdue').slice(0, 20);
    const todayList = allReminders.filter(r => r.reminder_type === 'today').slice(0, 20);
    const upcomingList = allReminders.filter(r => r.reminder_type === 'upcoming').slice(0, 20);
    const unread_count = allReminders.filter(r => r.is_read === 0).length;

    // 接近逾期预警
    const [preWarningList] = await pool.query(
      `SELECT c.id as customer_id, c.company_name, c.contact_name, c.phone, c.last_follow_time,
              DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) as overdue_days
       FROM crm_customer c
       WHERE c.owner_id = ? AND c.status NOT IN (0, 2, 3)
         AND DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) >= ?
         AND DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) < ?
         AND c.id NOT IN (
           SELECT customer_id FROM crm_follow_up_reminder WHERE owner_id = ? AND is_dismissed = 0
         )
       ORDER BY overdue_days DESC
       LIMIT 10`,
      [userId, preWarningDays, overdueDays, userId]
    );

    // 查询2：合并所有通知 + 未读数（按角色 + 按用户）
    const [allNotifications] = await pool.query(
      `SELECT n.id, n.type, n.title, n.content, n.business_type, n.business_id,
              n.from_user_id, n.to_role_id, n.to_user_id, n.is_read, n.create_time,
              u.real_name as from_user_name,
              SUM(CASE WHEN n.is_read = 0 AND n.to_role_id = ? THEN 1 ELSE 0 END) OVER () as approval_unread,
              SUM(CASE WHEN n.is_read = 0 AND n.to_user_id = ? AND n.type != 'service_assigned' THEN 1 ELSE 0 END) OVER () as urge_unread,
              SUM(CASE WHEN n.is_read = 0 AND n.to_user_id = ? AND n.type = 'service_assigned' THEN 1 ELSE 0 END) OVER () as service_unread
       FROM crm_notification n
       LEFT JOIN sys_user u ON n.from_user_id = u.id
       WHERE n.is_dismissed = 0
         AND (n.to_role_id = ? OR n.to_user_id = ?)
       ORDER BY n.create_time DESC
       LIMIT 60`,
      [req.user.roleId, userId, userId, req.user.roleId, userId]
    );

    const pendingApprovals = allNotifications.filter(n => n.to_role_id === req.user.roleId).slice(0, 20);
    const urgeNotifications = allNotifications.filter(n => n.to_user_id === userId && n.type !== 'service_assigned').slice(0, 20);
    const newServiceNotifications = allNotifications.filter(n => n.type === 'service_assigned' && n.to_user_id === userId).slice(0, 20);
    const approval_unread_count = allNotifications.length > 0 ? parseInt(allNotifications[0].approval_unread || 0) : 0;
    const urge_unread_count = allNotifications.length > 0 ? parseInt(allNotifications[0].urge_unread || 0) : 0;
    const service_unread_count = allNotifications.length > 0 ? parseInt(allNotifications[0].service_unread || 0) : 0;

    // 超时工单：紧急(priority=1)创建超2小时未处理，高(priority=2)超4小时未处理
    const isBoss = req.user.viewAll || req.user.roleId === 1 || req.user.roleId === 2;
    let overdueServiceFilter = 'so.status IN (1, 2) AND so.deleted_at IS NULL';
    const overdueServiceParams = [];
    if (!isBoss) {
      overdueServiceFilter += ' AND so.assignee_id = ?';
      overdueServiceParams.push(userId);
    }

    const [overdueServices] = await pool.query(
      `SELECT so.id, so.order_no, so.title, so.priority, so.status, so.create_time,
              cu.company_name as customer_name,
              TIMESTAMPDIFF(HOUR, so.create_time, NOW()) as overdue_hours
       FROM crm_service_order so
       LEFT JOIN crm_customer cu ON so.customer_id = cu.id
       WHERE ${overdueServiceFilter}
         AND (
           (so.priority = 1 AND so.create_time < NOW() - INTERVAL 2 HOUR)
           OR (so.priority = 2 AND so.create_time < NOW() - INTERVAL 4 HOUR)
         )
       ORDER BY so.priority ASC, so.create_time ASC
       LIMIT 20`,
      overdueServiceParams
    );

    res.json({
      code: 200, message: '查询成功',
      data: {
        list,
        today_list: todayList,
        today_count: todayList.length,
        upcoming_list: upcomingList,
        upcoming_count: upcomingList.length,
        unread_count,
        pre_warning_list: preWarningList,
        pre_warning_count: preWarningList.length,
        overdue_days: overdueDays,
        pending_approvals: pendingApprovals,
        approval_unread_count: approval_unread_count,
        urge_notifications: urgeNotifications,
        urge_unread_count: urge_unread_count,
        new_services: newServiceNotifications,
        new_service_count: service_unread_count,
        overdue_services: overdueServices,
        overdue_service_count: overdueServices.length
      }
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
    const overdueDays = await getOverdueDays();

    let userFilter = '';
    const params = [overdueDays];

    if (!isBoss) {
      userFilter = ' AND c.owner_id = ?';
      params.push(userId);
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_customer c
       WHERE c.status NOT IN (2, 3) AND c.status != 0
         AND (c.last_follow_time IS NULL
           OR c.last_follow_time < NOW() - INTERVAL ? DAY)
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
           OR c.last_follow_time < NOW() - INTERVAL ? DAY)
         ${userFilter}
       ORDER BY overdue_days DESC
       LIMIT ? OFFSET ?`,
      [...params, overdueDays, parseInt(pageSize), parseInt(offset)]
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
    // 标记跟进提醒全部已读
    await pool.query(
      'UPDATE crm_follow_up_reminder SET is_read = 1 WHERE owner_id = ? AND is_read = 0',
      [req.user.userId]
    );
    // 标记通知全部已读（角色级 + 用户级）
    await pool.query(
      'UPDATE crm_notification SET is_read = 1 WHERE (to_role_id = ? OR to_user_id = ?) AND is_read = 0',
      [req.user.roleId, req.user.userId]
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

// 6. 获取逾期回款计划
router.get('/payment-overdue', authenticateToken, async (req, res) => {
  try {
    const isBoss = req.user.viewAll || req.user.roleId === 1 || req.user.roleId === 2;
    const userId = req.user.userId;

    let ownerFilter = '';
    const params = [];
    if (!isBoss) {
      ownerFilter = ' AND ct.create_by = ?';
      params.push(userId);
    }

    // 已逾期
    const [rows] = await pool.query(
      `SELECT pp.id, pp.plan_date, pp.plan_amount,
              COALESCE(SUM(p.pay_amount), 0) as paid_amount,
              ct.id as contract_id, ct.contract_no,
              cu.company_name as customer_name,
              (CURRENT_DATE - pp.plan_date) as overdue_days
       FROM crm_payment_plan pp
       JOIN crm_contract ct ON pp.contract_id = ct.id AND ct.deleted_at IS NULL
       JOIN crm_customer cu ON ct.customer_id = cu.id
       LEFT JOIN crm_payment p ON pp.id = p.plan_id AND p.deleted_at IS NULL
       WHERE pp.plan_date < CURRENT_DATE
         ${ownerFilter}
       GROUP BY pp.id
       HAVING paid_amount < pp.plan_amount
       ORDER BY pp.plan_date ASC
       LIMIT 20`,
      params
    );

    // 即将到期（未来3天内）
    const upcomingParams = [...params];
    const [upcomingRows] = await pool.query(
      `SELECT pp.id, pp.plan_date, pp.plan_amount,
              COALESCE(SUM(p.pay_amount), 0) as paid_amount,
              ct.id as contract_id, ct.contract_no,
              cu.company_name as customer_name,
              (pp.plan_date - CURRENT_DATE) as days_left
       FROM crm_payment_plan pp
       JOIN crm_contract ct ON pp.contract_id = ct.id AND ct.deleted_at IS NULL
       JOIN crm_customer cu ON ct.customer_id = cu.id
       LEFT JOIN crm_payment p ON pp.id = p.plan_id AND p.deleted_at IS NULL
       WHERE pp.plan_date >= CURRENT_DATE
         AND pp.plan_date <= CURRENT_DATE + INTERVAL 3 DAY
         ${ownerFilter}
       GROUP BY pp.id
       HAVING paid_amount < pp.plan_amount
       ORDER BY pp.plan_date ASC
       LIMIT 20`,
      upcomingParams
    );

    res.json({
      code: 200, message: '查询成功',
      data: { list: rows, total: rows.length, upcoming: upcomingRows, upcoming_total: upcomingRows.length }
    });
  } catch (error) {
    console.error('逾期回款查询错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 7. 标记通知已读（支持角色级和用户级通知）
router.post('/notification-read', authenticateToken, async (req, res) => {
  try {
    const { notification_id } = req.body;
    await pool.query(
      'UPDATE crm_notification SET is_read = 1 WHERE id = ? AND (to_role_id = ? OR to_user_id = ?)',
      [notification_id, req.user.roleId, req.user.userId]
    );
    res.json({ code: 200, message: '已标记为已读', data: null });
  } catch (error) {
    console.error('[提醒] 标记已读失败:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 8. 处理通知（标记为已处理，跳转后调用）
router.post('/notification-dismiss', authenticateToken, async (req, res) => {
  try {
    const { notification_id } = req.body;
    await pool.query(
      'UPDATE crm_notification SET is_dismissed = 1, is_read = 1 WHERE id = ? AND to_role_id = ?',
      [notification_id, req.user.roleId]
    );
    res.json({ code: 200, message: '已处理', data: null });
  } catch (error) {
    console.error('[提醒] 处理通知失败:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 9. 按业务ID批量解除通知（审批通过/拒绝时调用）
router.post('/notification-dismiss-by-business', authenticateToken, async (req, res) => {
  try {
    const { business_type, business_id } = req.body;
    await pool.query(
      'UPDATE crm_notification SET is_dismissed = 1, is_read = 1 WHERE business_type = ? AND business_id = ? AND is_dismissed = 0',
      [business_type, business_id]
    );
    res.json({ code: 200, message: '通知已解除', data: null });
  } catch (error) {
    console.error('[提醒] 批量解除通知失败:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

module.exports = router;
