import request from '@/utils/request'

// 商机列表
export function getOpportunityList(params) {
  return request.post('/opportunity/list', params)
}

// 创建商机
export function addOpportunity(data) {
  return request.post('/opportunity/add', data)
}

// 编辑商机
export function updateOpportunity(data) {
  return request.post('/opportunity/update', data)
}

// 删除商机
export function deleteOpportunity(id) {
  return request.post('/opportunity/delete', { id })
}

// 推进阶段
export function updateOpportunityStage(id, stage) {
  return request.post('/opportunity/update-stage', { id, stage })
}

// 销售漏斗
export function getSalesFunnel(params) {
  return request.get('/opportunity/funnel', { params })
}

// 商机详情
export function getOpportunityDetail(id) {
  return request.get(`/opportunity/detail/${id}`)
}

// 商机阶段日志
export function getOpportunityStageLog(id) {
  return request.get(`/opportunity/stage-log/${id}`)
}
