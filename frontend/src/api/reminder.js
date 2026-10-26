/** @file 提醒 API */
import request from '@/utils/request'

// ============ 提醒/通知 ============
/** 标记单条通知已读（后端字段名为 notification_id） */
export const markNotificationRead = (id) => request.post('/reminder/notification-read', { notification_id: id })
export const markAllRead = () => request.post('/reminder/mark-all-read')
export const getReminderCenter = () => request.get('/reminder/center')
export const getPaymentOverdue = () => request.get('/reminder/payment-overdue')
export const getMyReminders = () => request.get('/reminder/my-reminders')
