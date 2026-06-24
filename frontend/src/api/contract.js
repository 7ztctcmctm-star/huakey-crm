import request from '@/utils/request'

// ============ 合同管理 ============
export const getContractList = (params) => request.post('/contract/list', params)
export const getContractDetail = (id) => request.get(`/contract/detail/${id}`)
export const addContract = (data) => request.post('/contract/add', data)
export const updateContract = (data) => request.post('/contract/update', data)
export const deleteContract = (id) => request.post('/contract/delete', { id })
export const approveContract = (data) => request.post('/contract/approve', data)
export const exportContracts = (params) => request.post('/contract/export', params, { responseType: 'blob' })
export const getContractOpportunityList = (customerId) => request.get('/contract/opportunity-list', { params: { customer_id: customerId } })
export const getContractTemplates = () => request.get('/contract-template/list')
export const searchContract = (keyword) => request.get('/contract/search', { params: { keyword } })

// ============ 回款管理 ============
export const getPaymentList = (params) => request.post('/contract/payment/list', params)
export const addPayment = (data) => request.post('/contract/payment/add', data)
export const deletePayment = (id) => request.post('/contract/payment/delete', { id })
export const getPaymentSummary = () => request.post('/contract/payment/summary')
export const getMergedPayments = (params) => request.post('/contract/payment/merged', params)
export const exportPayments = (params) => request.post('/contract/payment/export', params, { responseType: 'blob' })
export const exportPaymentStatement = (params) => request.post('/contract/payment/statement-export', params, { responseType: 'blob' })

// ============ 报价管理 ============
export const getQuoteList = (params) => request.post('/quote/list', params)
export const addQuote = (data) => request.post('/quote/add', data)
export const updateQuote = (data) => request.post('/quote/update', data)
export const deleteQuote = (id) => request.post('/quote/delete', { id })
export const approveQuote = (data) => request.post('/quote/approve', data)
export const quoteToContract = (id) => request.post('/quote/to-contract', { id })
export const getQuoteDetail = (id) => request.get(`/quote/detail/${id}`)
