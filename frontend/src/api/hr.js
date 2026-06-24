import request from '@/utils/request'

// ============ HR管理 ============
export const getEmployees = (params) => request.get('/hr/employees', { params })
export const getEmployeeStats = () => request.get('/hr/employees/stats')
export const getEmployeeDetail = (id) => request.get(`/hr/employees/${id}`)
export const updateEmployeeProfile = (id, data) => request.post(`/hr/employees/${id}/profile`, data)
export const getOrgTree = () => request.get('/hr/org-tree')
export const getOrgTreeEmployees = (nodeId) => request.get(`/hr/org-tree/${nodeId}/employees`)
export const getCommissionRules = () => request.get('/hr/commission/rules')
export const saveCommissionRule = (data, id) => id ? request.put(`/hr/commission/rules/${id}`, data) : request.post('/hr/commission/rules', data)
export const deleteCommissionRule = (id) => request.delete(`/hr/commission/rules/${id}`)
export const getCommissionRecords = (params) => request.get('/hr/commission/records', { params })
export const getCommissionStats = () => request.get('/hr/commission/stats')
export const calculateCommission = (data) => request.post('/hr/commission/calculate', data)
export const batchConfirmCommission = (ids) => request.post('/hr/commission/records/batch-confirm', { ids })
export const batchPayCommission = (ids) => request.post('/hr/commission/records/batch-pay', { ids })

// ============ 财务管理 ============
export const getFinanceReminders = (params) => request.get('/finance/reminders', { params })
export const getReminderSummary = () => request.get('/finance/reminders/summary')
export const generateReminders = () => request.post('/finance/reminders/generate')
export const getReconciliationList = (params) => request.get('/finance/reconciliation/list', { params })
export const getSupplierReconciliation = (params) => request.get('/finance/reconciliation/supplier', { params })
export const getCustomerReconciliation = (params) => request.get('/finance/reconciliation/customer', { params })
export const saveReconciliation = (data) => request.post('/finance/reconciliation/save', data)
export const getFinanceAnalysis = () => request.get('/finance/analysis')
export const acknowledgeReminder = (id) => request.put(`/finance/reminders/${id}/acknowledge`)
