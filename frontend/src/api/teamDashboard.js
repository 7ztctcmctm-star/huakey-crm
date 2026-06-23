import request from '@/utils/request'

export const getTeamOverview = () => request.get('/team-dashboard/overview')
export const getSalesBreakdown = () => request.get('/team-dashboard/sales-breakdown')
export const getStuckOpportunities = () => request.get('/team-dashboard/stuck-opportunities')
export const getPendingApprovals = () => request.get('/team-dashboard/pending-approvals')
export const getSalesCustomers = (params) => request.post('/team-dashboard/sales-customers', params)
export const getSalesOverdueCustomers = (params) => request.post('/team-dashboard/sales-overdue-customers', params)
export const urgeFollowup = (params) => request.post('/team-dashboard/urge-followup', params)
