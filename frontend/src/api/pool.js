/**
 * 公海池 / 客户总览 API 模块（Phase 5：切换到独立 /pool 端点）
 *
 * 端点：
 *   POST /api/v1/pool                  客户总览列表                      [pool:view]
 *   POST /api/v1/pool/claim            认领无主客户（owner_id → 当前用户）  [pool:claim]
 *   POST /api/v1/pool/release          释放客户回公司池（owner_id=NULL）   [customer:release]
 *   POST /api/v1/pool/transfer/*       客户转移（双方同意制）
 *
 * ⚠️ 2026-09-10 起「7 天保护期」已下线：认领后不再写入 protect_until，
 *    释放后的客户也可被立即认领。详见 docs/crm-customer-overview-design.md。
 *
 * 旧端点 /customer/pool-list、/customer/claim-pool、/customer/release-to-pool 保留为兼容层。
 */
import request from '@/utils/request'

// 客户总览列表（默认 owner_id 为空，即「待认领」视图）
export const getPoolList = (params) => request.post('/pool', params)

// 认领无主客户（owner_id = 当前用户；无保护期）
export const claimPoolCustomer = (id) => request.post('/pool/claim', { id })

// 释放客户到公海（following → sea, owner_id=NULL）
export const releaseToPool = (id, reason = '') => request.post('/pool/release', { id, reason })

// ========== 客户转移（双方同意制，2026-09-10 新增）==========
// 规则：销售发起 → 接收人同意才生效；不可撤回；超 3 天自动回流。

/** 发起转移申请 */
export const createTransfer = (data) => request.post('/pool/transfer', data)

/** 接收人同意 */
export const acceptTransfer = (id) => request.post('/pool/transfer/accept', { id })

/** 接收人拒绝 */
export const rejectTransfer = (id, remark = '') => request.post('/pool/transfer/reject', { id, remark })

/** 我收到的待处理申请 */
export const getMyPendingTransfers = (params = {}) => request.post('/pool/transfer/my-pending', params)

/** 可转移的接收人候选（销售也有权限，区别于需 system:user 的 /user/list） */
export const getTransferCandidates = () => request.post('/pool/transfer/candidates', {})

/** 某客户的转移记录 */
export const getCustomerTransfers = (customerId) =>
  request.post('/pool/transfer/by-customer', { customer_id: customerId })
