import request from '@/utils/request'

// 商机时间轴（Prompt 4-3-9）
export const getOpportunityTimeline = (id) => request.get(`/opportunity/timeline/${id}`)
