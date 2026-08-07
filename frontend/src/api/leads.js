/**
 * 潜客池 API 模块（Phase 5：切换到独立 /leads 端点）
 *
 * 新端点：
 *   POST /api/v1/leads          潜客池列表（status='lead'）  [leads:view]
 *   POST /api/v1/leads/convert  潜客转正式客户               [leads:convert]
 *
 * 旧端点 /customer/leads-pool、/customer/convert-lead 保留为兼容层。
 */
import request from '@/utils/request'

// 潜客池列表（status='lead'）
export const getLeadsPool = (params) => request.post('/leads', params)

// 潜客转正式客户（lead → following）
export const convertLeadToFormal = (id) => request.post('/leads/convert', { id })
