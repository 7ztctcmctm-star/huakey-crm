/** @file 采购申请 API */
import request from '@/utils/request'
import { withIdempotencyKey } from '@/utils/idempotency'

// 采购申请列表
export const getPurchaseRequestList = (params) => request.post('/purchase/request/list', params)

// 创建采购申请
export const createPurchaseRequest = (data) => request.post('/purchase/request/create', data)

// 提交采购申请
// 【幂等】本端点无 body schema，幂等键只能走 Idempotency-Key 请求头（后端 purchase/request.js 注释已说明）
export const submitPurchaseRequest = (id) =>
  request.post(`/purchase/request/submit/${id}`, null, withIdempotencyKey({}, 'pr-submit'))

// 审批通过
export const approvePurchaseRequest = (id) => request.post(`/purchase/request/approve/${id}`)

// 审批驳回
export const rejectPurchaseRequest = (id, reason) => request.post(`/purchase/request/reject/${id}`, { reason })

// 撤销采购申请
export const cancelPurchaseRequest = (id, reason) => request.post(`/purchase/request/cancel/${id}`, { reason })
