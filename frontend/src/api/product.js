import request from '@/utils/request'

export function getProductList(params) {
  return request.post('/product/list', params)
}
export function addProduct(data) {
  return request.post('/product/add', data)
}
export function updateProduct(data) {
  return request.post('/product/update', data)
}
export function deleteProduct(id) {
  return request.post('/product/delete', { id })
}
export function getProductCategories() {
  return request.get('/product/categories')
}
export function getProductPrices(productId) {
  return request.get(`/product/${productId}/prices`)
}
export function addProductPrice(productId, data) {
  return request.post(`/product/${productId}/prices`, data)
}
export function deleteProductPrice(id) {
  return request.delete(`/product/price/${id}`)
}
