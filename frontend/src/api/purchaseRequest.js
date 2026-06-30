import request from '@/utils/request'

// 采购申请列表
export const getPurchaseRequestList = (params) => request.post('/purchase/request/list', params)

// 创建采购申请
export const createPurchaseRequest = (data) => request.post('/purchase/request/create', data)

// 提交采购申请
export const submitPurchaseRequest = (id) => request.post(`/purchase/request/submit/${id}`)

// 审批通过
export const approvePurchaseRequest = (id) => request.post(`/purchase/request/approve/${id}`)

// 审批驳回
export const rejectPurchaseRequest = (id, reason) => request.post(`/purchase/request/reject/${id}`, { reason })

// 撤销采购申请
export const cancelPurchaseRequest = (id, reason) => request.post(`/purchase/request/cancel/${id}`, { reason })
