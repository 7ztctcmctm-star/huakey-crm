const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const ROLES = require('../config/roles');
const { getOverdueDays } = require('../utils/config');
const { validate, Joi } = require('../middleware/validate');
const reminderService = require('../services/reminderService');

// Validation schemas
const markReadSchema = Joi.object({
  reminder_id: Joi.number().integer().positive().required()
});

const dismissSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required()
});

const notificationReadSchema = Joi.object({
  notification_id: Joi.number().integer().positive().required()
});

const notificationDismissSchema = Joi.object({
  notification_id: Joi.number().integer().positive().required()
});

const notificationDismissByBusinessSchema = Joi.object({
  business_type: Joi.string().max(50).required(),
  business_id: Joi.number().integer().positive().required()
});

// ============ 跟进提醒 API ============

// 1. 获取当前用户的未读提醒列表
router.get('/my-reminders', authenticateToken, checkPermission('reminder'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const overdueDays = await getOverdueDays();
    const isBoss = req.user.viewAll || ADMIN_ROLE_CODES.has(req.user.roleCode);

    const data = await reminderService.getMyReminders(pool, userId, req.user.roleId, {
      overdueDays, viewAll: req.user.viewAll, isBoss
    });

    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('获取提醒错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 2. 获取所有逾期客户列表（老板看全局）
router.post('/overdue-list', authenticateToken, checkPermission('reminder'), async (req, res) => {
  try {
    const isBoss = req.user.viewAll || req.user.roleId === ROLES.ADMIN || req.user.roleId === ROLES.MANAGER;
    const userId = req.user.userId;
    const { page = 1, pageSize = 20 } = req.body;
    const overdueDays = await getOverdueDays();

    const data = await reminderService.getOverdueList(pool, { page, pageSize, overdueDays }, { isBoss, userId });

    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('逾期列表错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 3. 标记提醒为已读
router.post('/mark-read', authenticateToken, checkPermission('reminder'), validate(markReadSchema), async (req, res) => {
  try {
    const { reminder_id } = req.body;
    await reminderService.markAsRead(pool, reminder_id, req.user.userId);
    res.json({ code: 200, message: '已标记为已读', data: null });
  } catch (error) {
    console.error('标记已读错误:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 4. 一键标记全部已读
router.post('/mark-all-read', authenticateToken, checkPermission('reminder'), async (req, res) => {
  try {
    await reminderService.markAllAsRead(pool, req.user.userId, req.user.roleId);
    res.json({ code: 200, message: '全部已读', data: null });
  } catch (error) {
    console.error('全部已读错误:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 5. 解除提醒（跟进后自动调用或手动解除）
router.post('/dismiss', authenticateToken, checkPermission('reminder'), validate(dismissSchema), async (req, res) => {
  try {
    const { customer_id } = req.body;
    await reminderService.dismissReminder(pool, customer_id, req.user.userId);
    res.json({ code: 200, message: '提醒已解除', data: null });
  } catch (error) {
    console.error('解除提醒错误:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 6. 获取逾期回款计划
router.get('/payment-overdue', authenticateToken, checkPermission('reminder'), async (req, res) => {
  try {
    const isBoss = req.user.viewAll || req.user.roleId === ROLES.ADMIN || req.user.roleId === ROLES.MANAGER;
    const userId = req.user.userId;

    const data = await reminderService.getPaymentOverdue(pool, userId, { isBoss });

    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('逾期回款查询错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 7. 标记通知已读（支持角色级和用户级通知）
router.post('/notification-read', authenticateToken, checkPermission('reminder'), validate(notificationReadSchema), async (req, res) => {
  try {
    const { notification_id } = req.body;
    await reminderService.markNotificationRead(pool, notification_id, req.user.userId, req.user.roleId);
    res.json({ code: 200, message: '已标记为已读', data: null });
  } catch (error) {
    console.error('[提醒] 标记已读失败:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 8. 处理通知（标记为已处理，跳转后调用）
router.post('/notification-dismiss', authenticateToken, checkPermission('reminder'), validate(notificationDismissSchema), async (req, res) => {
  try {
    const { notification_id } = req.body;
    await reminderService.dismissNotification(pool, notification_id, req.user.roleId);
    res.json({ code: 200, message: '已处理', data: null });
  } catch (error) {
    console.error('[提醒] 处理通知失败:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 9. 按业务ID批量解除通知（审批通过/拒绝时调用）
router.post('/notification-dismiss-by-business', authenticateToken, checkPermission('reminder'), validate(notificationDismissByBusinessSchema), async (req, res) => {
  try {
    const { business_type, business_id } = req.body;
    await reminderService.dismissNotificationByBusiness(pool, business_type, business_id);
    res.json({ code: 200, message: '通知已解除', data: null });
  } catch (error) {
    console.error('[提醒] 批量解除通知失败:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 通知列表（分页）
router.get('/notification-list', authenticateToken, checkPermission('reminder'), async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;

    const data = await reminderService.getNotificationList(pool, req.user.userId, req.user.roleId, { page, pageSize });

    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('[提醒] 通知列表查询失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// ============ 通知中心下拉面板 ============

router.get('/center', authenticateToken, checkPermission('reminder'), async (req, res) => {
  try {
    const userId = req.user.userId;

    const { approvals, followups, stockAlerts, paymentOverdue, systemNotifications, unread } =
      await reminderService.getReminderCenter(pool, userId, req.user.roleId);

    // 相对时间辅助
    const relativeTime = (dt) => {
      if (!dt) return '';
      const diff = Date.now() - new Date(dt).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return '刚刚';
      if (mins < 60) return `${mins}分钟前`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}小时前`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}天前`;
      return new Date(dt).toLocaleDateString('zh-CN');
    };

    const formatItems = (items) => items.map(i => ({
      id: i.id, title: i.title, time: relativeTime(i.create_time), link: i.link
    }));

    res.json({
      code: 200, message: '查询成功',
      data: {
        todo: {
          approvals: formatItems(approvals),
          followups: formatItems(followups),
          stock_alerts: formatItems(stockAlerts),
          payment_overdue: formatItems(paymentOverdue)
        },
        system: systemNotifications.map(n => ({
          id: n.id, title: n.title, content: n.content, type: n.type,
          time: relativeTime(n.create_time), is_read: n.is_read, link: n.link
        })),
        unread_count: unread + approvals.length + followups.length + stockAlerts.length + paymentOverdue.length
      }
    });
  } catch (error) {
    console.error('[提醒] 通知中心查询失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 标记所有系统通知已读
router.post('/center/mark-all-read', authenticateToken, checkPermission('reminder'), async (req, res) => {
  try {
    await reminderService.markCenterAllRead(pool, req.user.userId);
    res.json({ code: 200, message: '已全部标记为已读', data: null });
  } catch (error) {
    console.error('[提醒] 标记已读失败:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

module.exports = router;
