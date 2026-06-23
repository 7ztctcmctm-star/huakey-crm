import request from '@/utils/request'

export const getWinRate = () => request.get('/analysis/win-rate')
export const getRfm = () => request.get('/analysis/rfm')
export const getAnalysisRanking = () => request.get('/analysis/ranking')
export const getPrediction = () => request.get('/analysis/prediction')
export const getPredictionEnhanced = (params) => request.get('/analysis/prediction/enhanced', { params })
export const getAnalysisFunnel = () => request.get('/analysis/funnel')
export const getAnomaly = () => request.get('/analysis/anomaly')
export const getChurnAlert = (params) => request.get('/analysis/churn-alert', { params })
