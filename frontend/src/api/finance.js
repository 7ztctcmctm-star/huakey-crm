import request from '@/utils/request'

export function getFinanceReminders(params) {
  return request.get('/finance/reminders', { params })
}
export function getReminderSummary() {
  return request.get('/finance/reminders/summary')
}
export function generateReminders() {
  return request.post('/finance/reminders/generate')
}
export function getReconciliationList(params) {
  return request.get('/finance/reconciliation/list', { params })
}
export function getSupplierReconciliation(params) {
  return request.get('/finance/reconciliation/supplier', { params })
}
export function getCustomerReconciliation(params) {
  return request.get('/finance/reconciliation/customer', { params })
}
export function saveReconciliation(data) {
  return request.post('/finance/reconciliation/save', data)
}
export function getFinanceAnalysis() {
  return request.get('/finance/analysis')
}
export function acknowledgeReminder(id) {
  return request.put(`/finance/reminders/${id}/acknowledge`)
}
