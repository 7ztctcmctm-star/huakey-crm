import request from '@/utils/request'

// ============ 提醒/通知 ============
export const markNotificationRead = (id) => request.post('/reminder/notification-read', { id })
export const markAllRead = () => request.post('/reminder/mark-all-read')
export const getReminderCenter = () => request.get('/reminder/center')
export const getPaymentOverdue = () => request.get('/reminder/payment-overdue')
export const getMyReminders = () => request.get('/reminder/my-reminders')
