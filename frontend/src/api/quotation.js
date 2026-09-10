import request from '@/utils/request'

// 报价列表
export const getQuoteList = (params) => request.post('/quote/list', params)

// 新增报价
export const addQuote = (data) => request.post('/quote/add', data)

// 编辑报价
export const updateQuote = (data) => request.post('/quote/update', data)

// 删除报价
export const deleteQuote = (id) => request.post('/quote/delete', { id })

// 报价审批（通过/拒绝）
export const approveQuote = (data) => request.post('/quote/approve', data)

// 报价转合同
export const quoteToContract = (id) => request.post('/quote/to-contract', { id })

// 报价详情
export const getQuoteDetail = (id) => request.get(`/quote/detail/${id}`)
