import request from '@/utils/request'

export const getInventoryList = (params) => request.get('/inventory/list', { params })
export const addInventory = (data) => request.post('/inventory/add', data)
export const updateInventory = (data) => request.post('/inventory/update', data)
export const deleteInventory = (id) => request.post('/inventory/delete', { id })
export const getInventoryMovements = (params) => request.get('/inventory/movements', { params })
export const addInventoryMovement = (data) => request.post('/inventory/movement/add', data)
export const getInventoryAlerts = () => request.get('/inventory/alerts')
export const getInventoryStats = () => request.get('/inventory/stats')
export const getInventoryCategories = () => request.get('/inventory/categories')
