/** @file 自动化 API - 工作流/分配规则/智能提醒 */
import request from '@/utils/request'

// ============ 自动化 ============
export const getWorkflows = () => request.get('/automation/workflows')
export const saveWorkflow = (data) => request.post('/automation/workflows', data)
/** 编辑工作流：POST 为新建，编辑必须走 PUT（后端 create schema 会 stripUnknown 丢弃 id，误用会重复创建） */
export const updateWorkflow = (id, data) => request.put(`/automation/workflows/${id}`, data)
/** 手动执行工作流，payload 必须为 { rule_id, target_type, target_id } */
export const executeWorkflow = (payload) => request.post('/automation/workflows/execute', payload)
/** 执行日志；后端读取 rule_id（省略则查全部） */
export const getWorkflowLogs = (ruleId) => request.get('/automation/workflows/logs', { params: { rule_id: ruleId } })
export const toggleWorkflow = (id) => request.post(`/automation/workflows/${id}/toggle`)
export const deleteWorkflow = (id) => request.delete(`/automation/workflows/${id}`)
export const getSmartReminders = () => request.get('/automation/smart-reminders')
export const saveSmartReminder = (data) => request.post('/automation/smart-reminders', data)
/** 编辑智能提醒（必须走 PUT，原因同上） */
export const updateSmartReminder = (id, data) => request.put(`/automation/smart-reminders/${id}`, data)
/** 执行一次智能提醒扫描（后端 run 端点接收空 body） */
export const runSmartReminder = () => request.post('/automation/smart-reminders/run')
export const getPendingReminders = () => request.get('/automation/smart-reminders/pending')
export const deleteSmartReminder = (id) => request.delete(`/automation/smart-reminders/${id}`)
export const markReminderSeen = (id) => request.put(`/automation/smart-reminders/log/${id}/seen`)
export const getAutomationAssignRules = () => request.get('/automation/assign-rules')
export const saveAutomationAssignRule = (data) => request.post('/automation/assign-rules', data)
/** 编辑分配规则（必须走 PUT，原因同上） */
export const updateAutomationAssignRule = (id, data) => request.put(`/automation/assign-rules/${id}`, data)
/** 执行分配规则；后端接受 { customer_ids: number[] } 或 { customer_id: number } */
export const applyAutomationAssignRule = (customerIds) => request.post('/automation/assign-rules/apply', { customer_ids: customerIds })
export const deleteAutomationAssignRule = (id) => request.delete(`/automation/assign-rules/${id}`)
