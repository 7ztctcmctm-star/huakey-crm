/**
 * @file 报价 API 模块
 * @module api/quotation
 * @description 报价单 CRUD + 审批 + 转合同
 *
 * 业务规则（见 HUAKYCRM_MASTER_SPEC.md §8）：
 *   - 金额以 DB DECIMAL(15,2) 存储为准，前端展示层只做 toFixed(2)
 *   - 折扣 rate 与 amount 二选一，优先 rate
 *   - 报价创建 **不会** 自动修改客户 business_status（领域边界铁律）
 *   - 报价转合同后，报价状态标记为 accepted，合同状态为 pending
 */
import request from '@/utils/request'

/**
 * 报价列表（支持分页、筛选、排序）
 * @param {Object} params - 分页 + 筛选参数
 * @returns {Promise<{code:number, data:{list:Array, total:number}}>}
 */
export const getQuoteList = (params) => request.post('/quote/list', params)

/**
 * 新增报价
 * @param {Object} data - 报价主体 + items 明细数组
 * @param {number} data.customer_id
 * @param {Array<{product_id:number, qty:number, unit_price:number}>} data.items
 * @param {number} [data.discount_rate]  - 折扣百分比（0-1）
 * @param {number} [data.discount_amount] - 固定折扣金额
 * @param {string} [data.currency='CNY']
 */
export const addQuote = (data) => request.post('/quote/add', data)

export const updateQuote = (data) => request.post('/quote/update', data)

export const deleteQuote = (id) => request.post('/quote/delete', { id })

/**
 * 报价审批（通过/拒绝）
 * @param {Object} data
 * @param {number} data.id
 * @param {'approve'|'reject'} data.action
 * @param {string} [data.reason] - 拒绝原因
 */
export const approveQuote = (data) => request.post('/quote/approve', data)

/**
 * 报价转合同
 * 触发后端自动创建 crm_contract + crm_contract_item，原 quote.status → accepted
 */
export const quoteToContract = (id) => request.post('/quote/to-contract', { id })

export const getQuoteDetail = (id) => request.get(`/quote/detail/${id}`)
