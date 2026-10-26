/** @file AI 智能分析 API - 销售预测/客户洞察 */
import request from '@/utils/request'

// ============ Sales Analytics (Phase 5.5.2) ============
// 统一销售分析查询接口
// 数据权限由后端 RBAC 控制: sales=owner / manager=dept / admin=all

/** 销售总览: 商机总额（opportunity_amount）；合同额/回款额由下方独立接口返回 */
export const getAnalyticsOverview = (params) => request.get('/report/analytics/sales/overview', { params })

/** 销售漏斗: stage 分布 + win_rate */
export const getAnalyticsFunnel = (params) => request.get('/report/analytics/sales/funnel', { params })

/** 合同收入: total/active/completed/cancelled */
export const getAnalyticsContractRevenue = (params) => request.get('/report/analytics/contract/revenue', { params })

/** 回款情况: receivable/received/outstanding/overdue/rate */
export const getAnalyticsPaymentCollection = (params) => request.get('/report/analytics/payment/collection', { params })
