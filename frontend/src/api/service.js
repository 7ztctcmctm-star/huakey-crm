import request from '@/utils/request'

export function getServiceList(params) {
  return request.post('/service/list', params)
}
export function getServiceDetail(id) {
  return request.get(`/service/detail/${id}`)
}
export function addService(data) {
  return request.post('/service/add', data)
}
export function updateService(data) {
  return request.post('/service/update', data)
}
export function deleteService(id) {
  return request.post('/service/delete', { id })
}
export function assignService(data) {
  return request.post('/service/assign', data)
}
export function batchAssignService(data) {
  return request.post('/service/batch-assign', data)
}
export function startService(id) {
  return request.post('/service/start', { id })
}
export function finishService(data) {
  return request.post('/service/finish', data)
}
export function confirmService(data) {
  return request.post('/service/confirm', data)
}
export function getServiceTypes() {
  return request.get('/service/types')
}
export function getServiceStatusList() {
  return request.get('/service/status-list')
}
export function getServicePriorityList() {
  return request.get('/service/priority-list')
}
