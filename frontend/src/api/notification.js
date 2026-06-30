import request from '@/utils/request'

// ============ 通知中心 ============
export const getNotifications = (params) => request.get('/notification/list', { params })
export const markNotificationRead = (id) => request.post(`/notification/read/${id}`)
export const markAllRead = () => request.post('/notification/read-all')
export const getUnreadCount = () => request.get('/notification/unread-count')
