import request from '@/utils/request'

// 数据质量检查（数据管理域，Prompt 4-5 从客户模块剥离）
export const qualityCheck = (data) => request.post('/data-quality/check', data)
export const qualityReport = (data) => request.post('/data-quality/report', data)
