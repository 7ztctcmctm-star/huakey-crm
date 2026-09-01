import request from '@/utils/request'

// ============ 日程管理 ============
export const getCalendarEvents = (params) => request.get('/calendar/events', { params })
export const addCalendarEvent = (data) => request.post('/calendar/events', data)
export const updateCalendarEvent = ({ id, ...data }) => request.put(`/calendar/events/${id}`, data)
export const deleteCalendarEvent = (id) => request.delete(`/calendar/events/${id}`)
