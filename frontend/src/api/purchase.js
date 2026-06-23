import request from '@/utils/request'

export function getPurchaseList(params) {
  return request.post('/purchase/list', params)
}
export function getPurchaseDetail(id) {
  return request.get(`/purchase/detail/${id}`)
}
export function addPurchase(data) {
  return request.post('/purchase/add', data)
}
export function updatePurchaseStatus(data) {
  return request.post('/purchase/update-status', data)
}
export function addReceipt(data) {
  return request.post('/purchase/receipt/add', data)
}
export function addPurchasePayment(data) {
  return request.post('/purchase/payment/add', data)
}
export function getPurchaseStatistics() {
  return request.get('/purchase/statistics')
}
