import request from '@/utils/request'

// 客户列表
export function getCustomerList(params) {
  return request.post('/customer/list', params)
}

// 客户详情
export function getCustomerDetail(id) {
  return request.get(`/customer/detail/${id}`)
}

// 新建客户
export function addCustomer(data) {
  return request.post('/customer/add', data)
}

// 编辑客户
export function updateCustomer(data) {
  return request.post('/customer/update', data)
}

// 删除客户
export function deleteCustomer(id) {
  return request.post('/customer/delete', { id })
}

// 公海列表
export function getPoolList(params) {
  return request.post('/customer/pool', params)
}

// 领取客户
export function claimCustomer(id) {
  return request.post('/customer/claim', { id })
}

// 分配客户
export function assignCustomer(data) {
  return request.post('/customer/assign', data)
}

// 批量分配
export function batchAssignCustomer(data) {
  return request.post('/customer/batch-assign', data)
}

// 客户转化（潜客⇄正式客户）
export function convertCustomer(data) {
  return request.post('/customer/convert', data)
}

// 导入客户
export function importCustomers(formData) {
  return request.post('/customer/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

// 导出客户
export function exportCustomers(params) {
  return request.post('/customer/export', params, { responseType: 'blob' })
}

// 客户联系人
export function addContact(data) {
  return request.post('/customer/contact/add', data)
}
export function updateContact(data) {
  return request.post('/customer/contact/update', data)
}
export function deleteContact(id) {
  return request.post('/customer/contact/delete', { id })
}

// 销售用户列表（用于分配等下拉）
export function getSalesUsers() {
  return request.get('/customer/sales-users')
}

// 我的下属（经理用）
export function getMySubordinates() {
  return request.get('/customer/my-subordinates')
}

// 客户 360 视图
export function getCustomer360(id) {
  return request.get(`/customer/${id}/360`)
}

// 释放客户到公海
export function releaseCustomer(customerId) {
  return request.post('/customer/release', { customer_id: customerId })
}

// 分配规则
export function getAssignRules() {
  return request.get('/customer/assign-rules')
}
export function createAssignRule(data) {
  return request.post('/customer/assign-rules/create', data)
}
export function updateAssignRule(data) {
  return request.post('/customer/assign-rules/update', data)
}
export function deleteAssignRule(id) {
  return request.post('/customer/assign-rules/delete', { id })
}

// 线索
export function getLeadsList(params) { return request.post('/customer/leads/list', params) }
export function convertLead(id) { return request.post('/customer/leads/convert', { id }) }
export function claimLead(id) { return request.post('/customer/leads/claim', { id }) }
export function markLeadLost(id) { return request.post('/customer/leads/mark-lost', { id }) }
export function getLeadsStats() { return request.get('/customer/leads/stats') }

// 公海批量领取
export function batchClaimCustomer(ids) {
  return request.post('/customer/batch-claim', { ids })
}

// 自动分配
export function autoAssignCustomer(data) {
  return request.post('/customer/auto-assign', data)
}

// 模板与质量检查
export const getCustomerTemplate = () => request.get('/customer/template')
export const qualityCheck = (data) => request.post('/customer/quality-check', data)
export const qualityReport = (data) => request.post('/customer/quality-report', data)
export const importPreview = (data) => request.post('/customer/import-preview', data)
export const importConfirm = (data) => request.post('/customer/import-confirm', data)
export const calculateCustomerScore = (id) => request.post(`/scoring/calculate/${id}`)
