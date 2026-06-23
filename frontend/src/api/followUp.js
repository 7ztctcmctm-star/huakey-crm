import request from '@/utils/request'

// 跟进记录列表
export function getFollowUpList(customerId, params = {}) {
  return request.post('/follow-up/list', { customer_id: customerId, ...params })
}

// 添加跟进
export function addFollowUp(data) {
  return request.post('/follow-up/add', data)
}

// 编辑跟进
export function updateFollowUp(data) {
  return request.post('/follow-up/update', data)
}

// 删除跟进
export function deleteFollowUp(id) {
  return request.post('/follow-up/delete', { id })
}

// 跟进计划列表
export function getFollowPlanList(customerId) {
  return request.post('/follow-plan/list', { customer_id: customerId })
}

// 添加跟进计划
export function addFollowPlan(data) {
  return request.post('/follow-plan/add', data)
}

// 完成跟进计划
export function completeFollowPlan(id) {
  return request.post('/follow-plan/complete', { id })
}

// 跟进模板
export const getFollowupTemplates = () => request.get('/followup-templates')
export const saveFollowupTemplate = (data) => request.post('/followup-templates', data)

// 跟进日历
export const getFollowUpCalendar = (params) => request.post('/follow-up/calendar', params)

// 提醒
export const getTodayReminders = () => request.get('/follow-up/remind')
export const getTomorrowTasks = () => request.get('/follow-up/tomorrow')
export const getFollowUpPlans = () => request.get('/follow-up/plans')

// 批量跟进
export const batchAddFollowUp = (items) => request.post('/follow-up/batch-add', { items })

// 跟进统计
export const getFollowUpTaskStats = () => request.get('/follow-up/task-stats')

// 取消跟进计划
export const cancelFollowPlan = (data) => request.post('/follow-plan/cancel', data)

// 删除跟进模板
export const deleteFollowupTemplate = (id) => request.delete(`/followup-templates/${id}`)
