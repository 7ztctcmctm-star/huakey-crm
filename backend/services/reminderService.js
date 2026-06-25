/**
 * 提醒中心服务层
 * 从 routes/reminder.js 提取的业务逻辑，供路由层复用
 */

/**
 * 获取当前用户的提醒数据（跟进提醒 + 通知 + 超时工单）
 * @param {object} pool
 * @param {number} userId
 * @param {number} roleId
 * @param {object} opts - { overdueDays, viewAll, isBoss }
 */
async function getMyReminders(pool, userId, roleId, opts = {}) {
  const { overdueDays = 30, viewAll = false, isBoss = false } = opts;
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
    [roleId, userId, userId, roleId, userId]
  );

  const pendingApprovals = allNotifications.filter(n => n.to_role_id === roleId).slice(0, 20);
  const urgeNotifications = allNotifications.filter(n => n.to_user_id === userId && n.type !== 'service_assigned').slice(0, 20);
  const newServiceNotifications = allNotifications.filter(n => n.type === 'service_assigned' && n.to_user_id === userId).slice(0, 20);
  const approval_unread_count = allNotifications.length > 0 ? parseInt(allNotifications[0].approval_unread || 0) : 0;
  const urge_unread_count = allNotifications.length > 0 ? parseInt(allNotifications[0].urge_unread || 0) : 0;
  const service_unread_count = allNotifications.length > 0 ? parseInt(allNotifications[0].service_unread || 0) : 0;

  // 超时工单
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

  return {
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
    approval_unread_count,
    urge_notifications: urgeNotifications,
    urge_unread_count,
    new_services: newServiceNotifications,
    new_service_count: service_unread_count,
    overdue_services: overdueServices,
    overdue_service_count: overdueServices.length
  };
}

/**
 * 获取所有逾期客户列表（分页）
 * @param {object} pool
 * @param {object} params - { page, pageSize, overdueDays }
 * @param {object} [permission] - { isBoss, userId }
 */
async function getOverdueList(pool, params = {}, permission = null) {
  const { page = 1, pageSize = 20, overdueDays = 30 } = params;
  const { isBoss = false, userId } = permission || {};
  const offset = (page - 1) * pageSize;

  let userFilter = '';
  const queryParams = [overdueDays];

  if (!isBoss) {
    userFilter = ' AND c.owner_id = ?';
    queryParams.push(userId);
  }

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM crm_customer c
     WHERE c.status NOT IN (2, 3) AND c.status != 0
       AND (c.last_follow_time IS NULL
         OR c.last_follow_time < NOW() - INTERVAL ? DAY)
       ${userFilter}`,
    queryParams
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
    [...queryParams, overdueDays, parseInt(pageSize), parseInt(offset)]
  );

  return { list, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

/**
 * 标记单条提醒为已读
 * @param {object} pool
 * @param {number} id - reminder_id
 * @param {number} userId
 */
async function markAsRead(pool, id, userId) {
  await pool.query(
    'UPDATE crm_follow_up_reminder SET is_read = 1 WHERE id = ? AND owner_id = ?',
    [id, userId]
  );
}

/**
 * 一键标记全部已读（跟进提醒 + 通知）
 * @param {object} pool
 * @param {number} userId
 * @param {number} roleId
 */
async function markAllAsRead(pool, userId, roleId) {
  await pool.query(
    'UPDATE crm_follow_up_reminder SET is_read = 1 WHERE owner_id = ? AND is_read = 0',
    [userId]
  );
  await pool.query(
    'UPDATE crm_notification SET is_read = 1 WHERE (to_role_id = ? OR to_user_id = ?) AND is_read = 0',
    [roleId, userId]
  );
}

/**
 * 解除提醒（跟进后自动调用或手动解除）
 * @param {object} pool
 * @param {number} customerId
 * @param {number} userId
 */
async function dismissReminder(pool, customerId, userId) {
  await pool.query(
    'UPDATE crm_follow_up_reminder SET is_dismissed = 1 WHERE customer_id = ? AND owner_id = ? AND is_dismissed = 0',
    [customerId, userId]
  );
}

/**
 * 获取逾期回款计划
 * @param {object} pool
 * @param {number} userId
 * @param {object} [permission] - { isBoss }
 */
async function getPaymentOverdue(pool, userId, permission = null) {
  const { isBoss = false } = permission || {};

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
            DATEDIFF(CURDATE(), pp.plan_date) as overdue_days
     FROM crm_payment_plan pp
     JOIN crm_contract ct ON pp.contract_id = ct.id AND ct.deleted_at IS NULL
     JOIN crm_customer cu ON ct.customer_id = cu.id
     LEFT JOIN crm_payment p ON pp.id = p.plan_id AND p.deleted_at IS NULL
     WHERE pp.plan_date < CURDATE()
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
            DATEDIFF(pp.plan_date, CURDATE()) as days_left
     FROM crm_payment_plan pp
     JOIN crm_contract ct ON pp.contract_id = ct.id AND ct.deleted_at IS NULL
     JOIN crm_customer cu ON ct.customer_id = cu.id
     LEFT JOIN crm_payment p ON pp.id = p.plan_id AND p.deleted_at IS NULL
     WHERE pp.plan_date >= CURDATE()
       AND pp.plan_date <= CURDATE() + INTERVAL 3 DAY
       ${ownerFilter}
     GROUP BY pp.id
     HAVING paid_amount < pp.plan_amount
     ORDER BY pp.plan_date ASC
     LIMIT 20`,
    upcomingParams
  );

  return { list: rows, total: rows.length, upcoming: upcomingRows, upcoming_total: upcomingRows.length };
}

/**
 * 获取通知列表（分页）
 * @param {object} pool
 * @param {number} userId
 * @param {number} roleId
 * @param {object} params - { page, pageSize }
 */
async function getNotificationList(pool, userId, roleId, params = {}) {
  const { page = 1, pageSize = 20 } = params;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  const [countResult] = await pool.query(
    'SELECT COUNT(*) as total FROM crm_notification WHERE (to_user_id = ? OR to_role_id = ?) AND is_dismissed = 0',
    [userId, roleId]
  );

  const [rows] = await pool.query(
    `SELECT * FROM crm_notification
     WHERE (to_user_id = ? OR to_role_id = ?) AND is_dismissed = 0
     ORDER BY is_read ASC, create_time DESC
     LIMIT ? OFFSET ?`,
    [userId, roleId, parseInt(pageSize), offset]
  );

  return { list: rows, total: countResult[0].total };
}

/**
 * 标记单条通知已读
 * @param {object} pool
 * @param {number} id - notification_id
 * @param {number} userId
 * @param {number} roleId
 */
async function markNotificationRead(pool, id, userId, roleId) {
  await pool.query(
    'UPDATE crm_notification SET is_read = 1 WHERE id = ? AND (to_role_id = ? OR to_user_id = ?)',
    [id, roleId, userId]
  );
}

/**
 * 处理通知（标记为已处理，跳转后调用）
 * @param {object} pool
 * @param {number} id - notification_id
 * @param {number} roleId
 */
async function dismissNotification(pool, id, roleId) {
  await pool.query(
    'UPDATE crm_notification SET is_dismissed = 1, is_read = 1 WHERE id = ? AND to_role_id = ?',
    [id, roleId]
  );
}

/**
 * 按业务ID批量解除通知（审批通过/拒绝时调用）
 * @param {object} pool
 * @param {string} businessType
 * @param {number} businessId
 */
async function dismissNotificationByBusiness(pool, businessType, businessId) {
  await pool.query(
    'UPDATE crm_notification SET is_dismissed = 1, is_read = 1 WHERE business_type = ? AND business_id = ? AND is_dismissed = 0',
    [businessType, businessId]
  );
}

/**
 * 获取通知中心数据（下拉面板）
 * @param {object} pool
 * @param {number} userId
 * @param {number} roleId
 */
async function getReminderCenter(pool, userId, roleId) {
  // 审批待处理
  const [approvals] = await pool.query(
    `SELECT n.id, n.title, n.create_time, '/approval/pending' as link
     FROM crm_notification n
     WHERE n.to_role_id = ? AND n.is_dismissed = 0 AND n.type LIKE '%approval%'
     ORDER BY n.create_time DESC LIMIT 5`, [roleId]
  );

  // 今日待跟进
  const [followups] = await pool.query(
    `SELECT fp.id, CONCAT('跟进-', c.company_name) as title, fp.plan_time as create_time,
            CONCAT('/customer/detail/', c.id) as link
     FROM crm_follow_plan fp
     JOIN crm_customer c ON fp.customer_id = c.id
     WHERE fp.create_by = ? AND fp.status = 'pending'
       AND DATE(fp.plan_time) = CURDATE()
     ORDER BY fp.plan_time LIMIT 5`, [userId]
  );

  // 库存预警
  const [stockAlerts] = await pool.query(
    `SELECT sa.id, CONCAT(p.name, '库存偏低(', p.stock, p.unit, ')') as title,
            sa.create_time, '/inventory' as link
     FROM crm_stock_alert sa
     JOIN crm_product p ON sa.product_id = p.id
     WHERE sa.alert_enabled = 1 AND p.stock <= sa.min_qty AND p.deleted_at IS NULL
     ORDER BY sa.create_time DESC LIMIT 5`
  );

  // 回款逾期
  const [paymentOverdue] = await pool.query(
    `SELECT pp.id, CONCAT(c.contract_no, '回款逾期', DATEDIFF(NOW(), pp.plan_date), '天') as title,
            pp.plan_date as create_time, '/payment' as link
     FROM crm_payment_plan pp
     JOIN crm_contract c ON pp.contract_id = c.id
     WHERE pp.plan_date < CURDATE() AND pp.status != 'completed' AND c.deleted_at IS NULL
     ORDER BY pp.plan_date LIMIT 5`
  );

  // 系统通知
  const [systemNotifications] = await pool.query(
    `SELECT id, title, content, type, is_read, create_time,
            CASE
              WHEN business_type = 'quote' THEN '/quote'
              WHEN business_type = 'contract' THEN '/contract'
              WHEN business_type = 'customer' THEN CONCAT('/customer/detail/', business_id)
              ELSE NULL
            END as link
     FROM crm_notification
     WHERE (to_user_id = ? OR to_role_id = ?) AND is_dismissed = 0
     ORDER BY is_read ASC, create_time DESC LIMIT 20`, [userId, roleId]
  );

  // 未读数
  const [[{ unread }]] = await pool.query(
    `SELECT COUNT(*) as unread FROM crm_notification
     WHERE (to_user_id = ? OR to_role_id = ?) AND is_read = 0 AND is_dismissed = 0`, [userId, roleId]
  );

  return { approvals, followups, stockAlerts, paymentOverdue, systemNotifications, unread };
}

/**
 * 标记所有系统通知已读
 * @param {object} pool
 * @param {number} userId
 */
async function markCenterAllRead(pool, userId) {
  await pool.query(
    'UPDATE crm_notification SET is_read = 1 WHERE to_user_id = ? AND is_read = 0',
    [userId]
  );
}

module.exports = {
  getMyReminders,
  getOverdueList,
  markAsRead,
  markAllAsRead,
  dismissReminder,
  getPaymentOverdue,
  getNotificationList,
  markNotificationRead,
  dismissNotification,
  dismissNotificationByBusiness,
  getReminderCenter,
  markCenterAllRead
};
