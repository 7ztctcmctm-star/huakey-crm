import request from '@/utils/request'

export function getProcurementPlanList(params) { return request.get('/procurement-plan/list', { params }) }
export function createProcurementPlan(data) { return request.post('/procurement-plan/create', data) }
export function autoGeneratePlan() { return request.post('/procurement-plan/auto-generate') }
export function getProcurementStats() { return request.get('/procurement-plan/stats') }
export function getProcurementPlanDetail(id) { return request.get(`/procurement-plan/detail/${id}`) }
export function submitProcurementPlan(id) { return request.post(`/procurement-plan/${id}/submit`) }
export function approveProcurementPlan(id) { return request.post(`/procurement-plan/${id}/approve`) }
export function deleteProcurementPlan(id) { return request.delete(`/procurement-plan/${id}`) }
export function convertPlanToPurchase(id) { return request.post(`/procurement-plan/${id}/convert-to-purchase`) }
