import request from '@/utils/request'

// ============ 自动化 ============
export const getWorkflows = () => request.get('/automation/workflows')
export const saveWorkflow = (data) => request.post('/automation/workflows', data)
export const executeWorkflow = (id) => request.post('/automation/workflows/execute', { id })
export const getWorkflowLogs = (id) => request.get('/automation/workflows/logs', { params: { id } })
export const toggleWorkflow = (id) => request.post(`/automation/workflows/${id}/toggle`)
export const deleteWorkflow = (id) => request.delete(`/automation/workflows/${id}`)
export const getSmartReminders = () => request.get('/automation/smart-reminders')
export const saveSmartReminder = (data) => request.post('/automation/smart-reminders', data)
export const runSmartReminder = (id) => request.post('/automation/smart-reminders/run', { id })
export const getPendingReminders = () => request.get('/automation/smart-reminders/pending')
export const deleteSmartReminder = (id) => request.delete(`/automation/smart-reminders/${id}`)
export const markReminderSeen = (id) => request.put(`/automation/smart-reminders/log/${id}/seen`)
export const getAutomationAssignRules = () => request.get('/automation/assign-rules')
export const saveAutomationAssignRule = (data) => request.post('/automation/assign-rules', data)
export const applyAutomationAssignRule = (id) => request.post('/automation/assign-rules/apply', { id })
export const deleteAutomationAssignRule = (id) => request.delete(`/automation/assign-rules/${id}`)
