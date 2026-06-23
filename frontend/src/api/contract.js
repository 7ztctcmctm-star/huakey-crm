import request from '@/utils/request'

// 合同列表
export function getContractList(params) {
  return request.post('/contract/list', params)
}

// 合同详情
export function getContractDetail(id) {
  return request.get(`/contract/detail/${id}`)
}

// 创建合同
export function addContract(data) {
  return request.post('/contract/add', data)
}

// 编辑合同
export function updateContract(data) {
  return request.post('/contract/update', data)
}

// 删除合同
export function deleteContract(id) {
  return request.post('/contract/delete', { id })
}

// 审批合同
export function approveContract(data) {
  return request.post('/contract/approve', data)
}

// 导出合同
export function exportContracts(params) {
  return request.post('/contract/export', params, { responseType: 'blob' })
}

// 合同关联商机列表
export function getContractOpportunityList(customerId) {
  return request.get('/contract/opportunity-list', { params: { customer_id: customerId } })
}

// 合同模板
export function getContractTemplates() {
  return request.get('/contract-template/list')
}

// 回款计划
export function getPaymentList(params) {
  return request.post('/contract/payment/list', params)
}
export function addPayment(data) {
  return request.post('/contract/payment/add', data)
}
export function deletePayment(id) {
  return request.post('/contract/payment/delete', { id })
}

// 回款汇总与导出
export function getPaymentSummary() {
  return request.post('/contract/payment/summary')
}
export function getMergedPayments(params) {
  return request.post('/contract/payment/merged', params)
}
export function exportPayments(params) {
  return request.post('/contract/payment/export', params, { responseType: 'blob' })
}
export function exportPaymentStatement(params) {
  return request.post('/contract/payment/statement-export', params, { responseType: 'blob' })
}
export function searchContract(keyword) {
  return request.get('/contract/search', { params: { keyword } })
}
