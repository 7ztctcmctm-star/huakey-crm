/**
 * 公海池 API 模块（Phase 5：切换到独立 /pool 端点）
 *
 * 新端点：
 *   POST /api/v1/pool          公海池列表（status='sea'）           [pool:view]
 *   POST /api/v1/pool/claim    认领公海客户（sea→following, 7天保护期） [pool:claim]
 *   POST /api/v1/pool/release  释放客户到公海（following→sea）        [customer:release]
 *
 * 旧端点 /customer/pool-list、/customer/claim-pool、/customer/release-to-pool 保留为兼容层。
 */
import request from '@/utils/request'

// 公海池列表（status='sea' AND owner_id IS NULL）
export const getPoolList = (params) => request.post('/pool', params)

// 认领公海客户（sea → following, owner_id=当前用户, 7天保护期）
export const claimPoolCustomer = (id) => request.post('/pool/claim', { id })

// 释放客户到公海（following → sea, owner_id=NULL）
export const releaseToPool = (id, reason = '') => request.post('/pool/release', { id, reason })
