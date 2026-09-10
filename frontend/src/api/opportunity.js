import request from '@/utils/request'

// 商机列表
export const getOpportunityList = (params) => request.post('/opportunity/list', params)

// 新增商机
export const addOpportunity = (data) => request.post('/opportunity/add', data)

// 编辑商机
export const updateOpportunity = (data) => request.post('/opportunity/update', data)

// 删除商机
export const deleteOpportunity = (id) => request.post('/opportunity/delete', { id })

// 推进商机阶段
export const updateOpportunityStage = (id, stage, changeReason = '') => request.post('/opportunity/update-stage', { id, stage, change_reason: changeReason })

// 销售漏斗
export const getSalesFunnel = (params) => request.get('/opportunity/funnel', { params })

// 商机详情
export const getOpportunityDetail = (id) => request.get(`/opportunity/detail/${id}`)

// 商机阶段日志
export const getOpportunityStageLog = (id) => request.get(`/opportunity/stage-log/${id}`)

// 商机时间轴
export const getOpportunityTimeline = (id) => request.get(`/opportunity/timeline/${id}`)

// 商机阶段停留统计
export const getOpportunityStageStats = (id) => request.get(`/opportunity/stage-stats/${id}`)
