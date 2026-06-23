import request from '@/utils/request'

export function getWorkflows() { return request.get('/automation/workflows') }
export function saveWorkflow(data) { return request.post('/automation/workflows', data) }
export function executeWorkflow(id) { return request.post('/automation/workflows/execute', { id }) }
export function getWorkflowLogs(id) { return request.get('/automation/workflows/logs', { params: { id } }) }
export function getSmartReminders() { return request.get('/automation/smart-reminders') }
export function saveSmartReminder(data) { return request.post('/automation/smart-reminders', data) }
export function runSmartReminder(id) { return request.post('/automation/smart-reminders/run', { id }) }
export function getPendingReminders() { return request.get('/automation/smart-reminders/pending') }
export function getAssignRules() { return request.get('/automation/assign-rules') }
export function saveAssignRule(data) { return request.post('/automation/assign-rules', data) }
export function applyAssignRule(id) { return request.post('/automation/assign-rules/apply', { id }) }
export function deleteAssignRule(id) { return request.delete(`/automation/assign-rules/${id}`) }
export function deleteSmartReminder(id) { return request.delete(`/automation/smart-reminders/${id}`) }
export function markReminderSeen(id) { return request.put(`/automation/smart-reminders/log/${id}/seen`) }
export function toggleWorkflow(id) { return request.post(`/automation/workflows/${id}/toggle`) }
export function deleteWorkflow(id) { return request.delete(`/automation/workflows/${id}`) }
