import request from '@/utils/request'

export function getQuoteList(params) {
  return request.post('/quote/list', params)
}
export function addQuote(data) {
  return request.post('/quote/add', data)
}
export function updateQuote(data) {
  return request.post('/quote/update', data)
}
export function deleteQuote(id) {
  return request.post('/quote/delete', { id })
}
export function approveQuote(data) {
  return request.post('/quote/approve', data)
}
export function quoteToContract(id) {
  return request.post('/quote/to-contract', { id })
}
export function getQuoteDetail(id) {
  return request.get(`/quote/detail/${id}`)
}
