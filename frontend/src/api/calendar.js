import request from '@/utils/request'

export const getCalendarEvents = (params) => request.get('/calendar/events', { params })
export const addCalendarEvent = (data) => request.post('/calendar/add', data)
export const updateCalendarEvent = (data) => request.post('/calendar/update', data)
export const deleteCalendarEvent = (id) => request.post('/calendar/delete', { id })
