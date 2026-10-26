/**
 * @file 合同 + 回款 API 模块
 * @module api/contract
 * @description 合同 CRUD + 审批 + 导出 + 合同项目明细 + 回款管理
 *
 * 业务规则（见 HUAKYCRM_MASTER_SPEC.md §9）：
 *   - crm_contract.status 原始枚举：1 待执行 / 2 执行中 / 3 已完成(终态) / 4 已取消(终态)
 *   - crm_contract.approval_status：1 待审批 / 2 已通过 / 3 已拒绝
 *   - 派生状态（overdue / partial / completed）由 crm_payment_plan SQL 子查询计算
 *   - **关键业务事务保护**：创建合同（含回款计划）、客户转移、报价转合同必须在事务内
 *   - 金额以 DB DECIMAL(15,2) 为准，前端展示只做 toFixed(2)
 *
 * 回款规则：
 *   - 部分付款可多次记录，每次关联合同
 *   - 全额付款 = 付款总额 ≥ 合同金额时标记合同完成
 */
import request from '@/utils/request'
import { withIdempotencyKey } from '@/utils/idempotency'

// ============ 合同管理 ============

export const getContractList = (params) => request.post('/contract/list', params)

export const getContractDetail = (id) => request.get(`/contract/detail/${id}`)

/**
 * 新增合同（事务创建 crm_contract + crm_payment_plan）
 * @param {Object} data
 * @param {number} data.customer_id         必填
 * @param {number} data.amount              必填
 * @param {number} [data.opportunity_id]   必须属于同一客户
 * @param {number} [data.quote_id]
 * @param {string} [data.sign_date]
 * @param {string} [data.delivery_date]
 * @param {string} [data.payment_terms]
 * @param {string} [data.remark]
 * @param {Array<{plan_date:string, plan_amount:number, remark?:string}>} [data.plans] 回款计划
 */
/**
 * 【幂等】带 Idempotency-Key：双击 / 网络重试 / 401 续期重放不会重复建合同
 */
export const addContract = (data) =>
  request.post('/contract/add', data, withIdempotencyKey({}, 'contract-create'))

export const updateContract = (data) => request.post('/contract/update', data)

export const deleteContract = (id) => request.post('/contract/delete', { id })

/**
 * 合同审批（通过/拒绝）
 * @param {Object} data
 * @param {number} data.id
 * @param {2|3} data.approval_status - 2=通过，3=拒绝
 * @param {string} [data.approval_remark]
 */
export const approveContract = (data) => request.post('/contract/approve', data)

/** 合同导出（xlsx，responseType: blob） */
export const exportContracts = (params) => request.post('/contract/export', params, { responseType: 'blob' })

/** 获取某客户下可关联的商机列表（合同创建时下拉选择） */
export const getContractOpportunityList = (customerId) => request.get('/contract/opportunity-list', { params: { customer_id: customerId } })

export const getContractTemplates = () => request.get('/contract-template/list')

export const searchContract = (keyword) => request.get('/contract/search', { params: { keyword } })

/** 合同明细列表（crm_contract_item） */
export const getContractItems = (contractId) => request.get(`/contract/items/${contractId}`)

// ============ 回款管理 ============

export const getPaymentList = (params) => request.post('/contract/payment/list', params)

/**
 * 新增回款记录
 * @param {Object} data
 * @param {number} data.contract_id 必填
 * @param {string} data.pay_date    必填（ISO 日期）
 * @param {number} data.pay_amount  必填（> 0）
 * @param {number} [data.plan_id]   关联回款计划
 * @param {string} [data.pay_method] 付款方式
 * @param {string} [data.remark]
 */
/**
 * 【幂等】带 Idempotency-Key：双击 / 重试不会登记两条回款（金额翻倍）
 */
export const addPayment = (data) =>
  request.post('/contract/payment/add', data, withIdempotencyKey({}, 'payment-add'))

export const deletePayment = (id) => request.post('/contract/payment/delete', { id })

/** 回款汇总（合同级别的已收/未收/逾期统计） */
export const getPaymentSummary = () => request.post('/contract/payment/summary')

/** 合同维度合并回款视图（一份合同一次付清的聚合） */
export const getMergedPayments = (params) => request.post('/contract/payment/merged', params)

export const exportPayments = (params) => request.post('/contract/payment/export', params, { responseType: 'blob' })

/** 回款对账单导出（汇总某时间段内所有合同的回款情况） */
export const exportPaymentStatement = (params) => request.post('/contract/payment/statement-export', params, { responseType: 'blob' })
