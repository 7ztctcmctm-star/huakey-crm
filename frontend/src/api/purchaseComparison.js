import request from '@/utils/request'

// 比价单列表
export const getPurchaseComparisonList = (params) => request.post('/purchase/comparison/list', params)

// 创建比价单
export const createPurchaseComparison = (data) => request.post('/purchase/comparison/create', data)

// 比价单详情
export const getPurchaseComparisonDetail = (id) => request.get(`/purchase/comparison/detail/${id}`)

// 添加供应商报价
export const addPurchaseComparisonQuote = (id, data) => request.post(`/purchase/comparison/${id}/add-quote`, data)

// 选择供应商
export const selectPurchaseComparisonSupplier = (id, supplierId) => request.post(`/purchase/comparison/${id}/select-supplier`, { supplier_id: supplierId })

// 取消比价单
export const cancelPurchaseComparison = (id) => request.post(`/purchase/comparison/${id}/cancel`)
