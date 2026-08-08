import request from '@/utils/request'

// ============ Sales Analytics (Phase 5.5.2) ============
// 统一销售分析查询接口
// 数据权限由后端 RBAC 控制: sales=owner / manager=dept / admin=all

/** 销售总览: 商机额/合同额/已收/未收 */
export const getAnalyticsOverview = () => request.get('/analytics/sales/overview')

/** 销售漏斗: stage 分布 + win_rate */
export const getAnalyticsFunnel = () => request.get('/analytics/sales/funnel')

/** 合同收入: total/active/completed/cancelled */
export const getAnalyticsContractRevenue = () => request.get('/analytics/contract/revenue')

/** 回款情况: receivable/received/outstanding/overdue/rate */
export const getAnalyticsPaymentCollection = () => request.get('/analytics/payment/collection')
