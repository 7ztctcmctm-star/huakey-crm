import request from '@/utils/request'

export function getSupplierList(params) {
  return request.post('/supplier/list', params)
}
export function getSupplierDetail(id) {
  return request.get(`/supplier/detail/${id}`)
}
export function addSupplier(data) {
  return request.post('/supplier/add', data)
}
export function updateSupplier(data) {
  return request.post('/supplier/update', data)
}
export function deleteSupplier(id) {
  return request.post('/supplier/delete', { id })
}
export function getSupplierPerformance(id) {
  return request.get(`/supplier/performance/${id}`)
}
export function addSupplierContact(data) {
  return request.post('/supplier/contact/add', data)
}
export function updateSupplierContact(data) {
  return request.post('/supplier/contact/update', data)
}
export function deleteSupplierContact(id) {
  return request.post('/supplier/contact/delete', { id })
}
export function addQualification(data) {
  return request.post('/supplier/qualification/add', data)
}
export function updateQualification(data) {
  return request.post('/supplier/qualification/update', data)
}
export function deleteQualification(id) {
  return request.post('/supplier/qualification/delete', { id })
}
export function addSupplierRating(data) {
  return request.post('/supplier/rating/add', data)
}
export function getSupplierRanking() {
  return request.get('/supplier/ranking')
}
export function getSupplierCompare(ids) {
  return request.get('/supplier/compare', { params: { ids } })
}
export function getSupplierOptions() {
  return request.get('/supplier/options')
}
