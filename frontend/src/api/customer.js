import request from '@/utils/request'

// ============ 客户管理（Phase 5 + 阶段3：统一走 /customers 命名空间） ============
// [2026-09-14 阶段3] 全部客户端点——CRUD 与「能力型」端点（分配/批量分配/联系人/360/
// 分配规则/导入模板与预览确认/逾期/临回收/销售用户/下属）——已统一到 /customers/*。
// 旧 /customer/* 仅作后端兼容层保留至 v2（公开 API 契约），前端不再引用。
// 全量客户列表
export const getCustomerList = (params) => request.post('/customers/list', params)
// 正式客户列表（status IN following/quoted/negotiating/signed）
export const getFormalCustomers = (params) => request.post('/customers', params)
export const getCustomerDetail = (id) => request.get(`/customers/detail/${id}`)
export const addCustomer = (data) => request.post('/customers/add', data)
export const updateCustomer = (data) => request.post('/customers/update', data)
export const deleteCustomer = (id) => request.post('/customers/delete', { id })
export const assignCustomer = (data) => request.post('/customers/assign', data)
export const batchAssignCustomer = (data) => request.post('/customers/batch-assign', data)
export const forwardCustomer = (data) => request.post('/customers/forward', data)
export const backwardCustomer = (data) => request.post('/customers/backward', data)
export const exportCustomers = (params) => request.post('/customers/export', params, { responseType: 'blob' })
export const addContact = (data) => request.post('/customers/contact/add', data)
export const updateContact = (data) => request.post('/customers/contact/update', data)
export const deleteContact = (id) => request.post('/customers/contact/delete', { id })
export const getSalesUsers = () => request.get('/customers/sales-users')
export const getMySubordinates = () => request.get('/customers/my-subordinates')
export const getCustomer360 = (id) => request.get(`/customers/${id}/360`)
export const releaseCustomer = (customerId) => request.post('/customers/release', { customer_id: customerId })
export const getAssignRules = () => request.get('/customers/assign-rules')
export const createAssignRule = (data) => request.post('/customers/assign-rules/add', data)
export const updateAssignRule = (data) => request.post('/customers/assign-rules/update', data)
export const deleteAssignRule = (id) => request.post('/customers/assign-rules/delete', { id })
export const getCustomerTemplate = () => request.get('/customers/template')
export const importPreview = (data) => request.post('/customers/import-preview', data)
export const importConfirm = (data) => request.post('/customers/import-confirm', data)
export const calculateCustomerScore = (id) => request.post(`/scoring/calculate/${id}`)

// ============ 跟进记录 ============
export const getFollowUpList = (customerId, params = {}) => request.post('/follow-up/list', { customer_id: customerId, ...params })
export const addFollowUp = (data) => request.post('/follow-up/add', data)
export const updateFollowUp = (data) => request.post('/follow-up/update', data)
export const deleteFollowUp = (id) => request.post('/follow-up/delete', { id })
export const getFollowupTemplates = () => request.get('/followup-templates')
export const saveFollowupTemplate = (data) => request.post('/followup-templates', data)
export const deleteFollowupTemplate = (id) => request.delete(`/followup-templates/${id}`)
export const getFollowUpCalendar = (params) => request.post('/follow-up/calendar', params)
export const getTodayReminders = () => request.get('/follow-up/remind')
export const getTomorrowTasks = () => request.get('/follow-up/tomorrow')
export const getFollowUpPlans = (params = {}) => request.post('/follow-up/plan/list', params)
export const addFollowUpPlan = (data) => request.post('/follow-up/plan/add', data)
export const completeFollowUpPlan = (data) => request.post('/follow-up/plan/complete', data)
export const cancelFollowUpPlan = (data) => request.post('/follow-up/plan/cancel', data)
export const batchAddFollowUp = (items) => request.post('/follow-up/batch-add', { items })
export const getFollowUpTaskStats = () => request.get('/follow-up/task-stats')
export const getOverdueCustomers = (params) => request.get('/customers/overdue', { params })
export const getNearRecycleCustomers = (params) => request.get('/customers/near-recycle', { params })

