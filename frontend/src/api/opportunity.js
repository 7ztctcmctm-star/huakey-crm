import request from '@/utils/request'

// 商机时间轴
export const getOpportunityTimeline = (id) => request.get(`/opportunity/timeline/${id}`)

// 商机详情
export const getOpportunityDetail = (id) => request.get(`/opportunity/detail/${id}`)

// 商机阶段日志
export const getOpportunityStageLog = (id) => request.get(`/opportunity/stage-log/${id}`)

// 商机阶段停留统计
export const getOpportunityStageStats = (id) => request.get(`/opportunity/stage-stats/${id}`)
