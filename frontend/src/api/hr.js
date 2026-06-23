import request from '@/utils/request'

export function getEmployees(params) { return request.get('/hr/employees', { params }) }
export function getEmployeeStats() { return request.get('/hr/employees/stats') }
export function getOrgTree() { return request.get('/hr/org-tree') }
export function getCommissionRules() { return request.get('/hr/commission/rules') }
export function saveCommissionRule(data, id) { return id ? request.put(`/hr/commission/rules/${id}`, data) : request.post('/hr/commission/rules', data) }
export function getCommissionRecords(params) { return request.get('/hr/commission/records', { params }) }
export function getCommissionStats() { return request.get('/hr/commission/stats') }
export function calculateCommission(data) { return request.post('/hr/commission/calculate', data) }
export function batchConfirmCommission(ids) { return request.post('/hr/commission/records/batch-confirm', { ids }) }
export function batchPayCommission(ids) { return request.post('/hr/commission/records/batch-pay', { ids }) }
export function getEmployeeDetail(id) { return request.get(`/hr/employees/${id}`) }
export function updateEmployeeProfile(id, data) { return request.post(`/hr/employees/${id}/profile`, data) }
export function getOrgTreeEmployees(nodeId) { return request.get(`/hr/org-tree/${nodeId}/employees`) }
export function deleteCommissionRule(id) { return request.delete(`/hr/commission/rules/${id}`) }
