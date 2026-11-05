/**
 * @file 商机 API 模块
 * @module api/opportunity
 * @description 商机 CRUD + 阶段推进 + 销售漏斗 + 时间轴/阶段日志
 *
 * 业务规则（见 HUAKYCRM_MASTER_SPEC.md §9）：
 *   - 商机 owner 离职时自动转移给直属上级（无上级则 NULL 待分配）
 *   - 合同通过 opportunity_id 关联商机；创建合同**不会**自动推进商机阶段
 *     （报价审批通过时会推进商机，见 quoteService）
 *   - 商机 **不能** 反向驱动 crm_customer.business_status（领域边界）
 */
import request from '@/utils/request'

export const getOpportunityList = (params) => request.post('/opportunity/list', params)

export const addOpportunity = (data) => request.post('/opportunity/add', data)

export const updateOpportunity = (data) => request.post('/opportunity/update', data)

export const deleteOpportunity = (id) => request.post('/opportunity/delete', { id })

/**
 * 推进商机阶段
 * @param {number} id
 * @param {number} stage - 目标阶段（后端只接受 1-6；5/6 为签约/丢单终态）
 * @param {string} [changeReason=''] - 阶段变更原因，记录到 opportunity_stage_log
 */
export const updateOpportunityStage = (id, stage, changeReason = '') => request.post('/opportunity/update-stage', { id, stage, change_reason: changeReason })

/** 销售漏斗（按阶段分组统计数量/金额） */
export const getSalesFunnel = (params) => request.get('/opportunity/funnel', { params })

export const getOpportunityDetail = (id) => request.get(`/opportunity/detail/${id}`)

/** 商机阶段变更历史（每次 updateOpportunityStage 都写一条） */
export const getOpportunityStageLog = (id) => request.get(`/opportunity/stage-log/${id}`)

/** 商机完整时间轴（跟进 + 阶段 + 合同关联事件） */
export const getOpportunityTimeline = (id) => request.get(`/opportunity/timeline/${id}`)

/** 商机在各阶段的停留时长统计（用于识别瓶颈） */
export const getOpportunityStageStats = (id) => request.get(`/opportunity/stage-stats/${id}`)
