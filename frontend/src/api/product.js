import request from '@/utils/request'

// ============ 产品管理 ============
export const getProductList = (params) => request.post('/product/list', params)
export const addProduct = (data) => request.post('/product/add', data)
export const updateProduct = (data) => request.post('/product/update', data)
export const deleteProduct = (id) => request.post('/product/delete', { id })
export const getProductCategories = () => request.get('/product/categories')
export const getProductPrices = (productId) => request.get(`/product/${productId}/prices`)
export const addProductPrice = (productId, data) => request.post(`/product/${productId}/prices`, data)
export const deleteProductPrice = (id) => request.delete(`/product/price/${id}`)

// ============ 库存管理 ============
export const getInventoryList = (params) => request.get('/inventory/list', { params })
export const updateInventory = ({ id, ...data }) => request.put(`/inventory/alert-config/${id}`, data)
export const getInventoryMovements = (params) => request.get('/inventory/movements', { params })
export const addInventoryMovement = (data) => {
  const { movement_type, ...rest } = data
  // 按出入库类型分派到后端实际端点（adjust 需 new_qty 字段）
  if (movement_type === 'adjust') return request.post('/inventory/adjust', rest)
  if (movement_type === 'out') return request.post('/inventory/out', rest)
  return request.post('/inventory/in', rest)
}
export const getInventoryAlerts = () => request.get('/inventory/alerts')
export const getInventoryStats = () => request.get('/inventory/stats')
export const getInventoryCategories = () => request.get('/inventory/categories')

// ============ 供应商管理 ============
export const getSupplierList = (params) => request.post('/supplier/list', params)
export const getSupplierDetail = (id) => request.get(`/supplier/detail/${id}`)
export const addSupplier = (data) => request.post('/supplier/add', data)
export const updateSupplier = (data) => request.post('/supplier/update', data)
export const deleteSupplier = (id) => request.post('/supplier/delete', { id })
export const getSupplierPerformance = (id) => request.get(`/supplier/performance/${id}`)
export const addSupplierContact = (data) => request.post('/supplier/contact/add', data)
export const updateSupplierContact = (data) => request.post('/supplier/contact/update', data)
export const deleteSupplierContact = (id) => request.post('/supplier/contact/delete', { id })
export const addQualification = (data) => request.post('/supplier/qualification/add', data)
export const updateQualification = (data) => request.post('/supplier/qualification/update', data)
export const deleteQualification = (id) => request.post('/supplier/qualification/delete', { id })
export const addSupplierRating = (data) => request.post('/supplier/rating/add', data)
export const getSupplierRanking = () => request.get('/supplier/ranking')
export const getSupplierCompare = (ids) => request.get('/supplier/compare', { params: { ids } })
export const getSupplierOptions = () => request.get('/supplier/options')

// ============ 采购管理 ============
export const getPurchaseList = (params) => request.post('/purchase/list', params)
export const getPurchaseDetail = (id) => request.get(`/purchase/detail/${id}`)
export const addPurchase = (data) => request.post('/purchase/add', data)
export const updatePurchaseStatus = (data) => request.post('/purchase/update-status', data)
export const addReceipt = (data) => request.post('/purchase/receipt/add', data)
export const addPurchasePayment = (data) => request.post('/purchase/payment/add', data)
export const getPurchaseStatistics = () => request.get('/purchase/statistics')

// ============ 采购计划 ============
export const getProcurementPlanList = (params) => request.get('/procurement-plan/list', { params })
export const createProcurementPlan = (data) => request.post('/procurement-plan/create', data)
export const autoGeneratePlan = () => request.post('/procurement-plan/auto-generate')
export const getProcurementStats = () => request.get('/procurement-plan/stats')
export const getProcurementPlanDetail = (id) => request.get(`/procurement-plan/detail/${id}`)
export const submitProcurementPlan = (id) => request.post(`/procurement-plan/${id}/submit`)
export const approveProcurementPlan = (id) => request.post(`/procurement-plan/${id}/approve`)
export const deleteProcurementPlan = (id) => request.delete(`/procurement-plan/${id}`)
export const convertPlanToPurchase = (id) => request.post(`/procurement-plan/${id}/convert-to-purchase`)
