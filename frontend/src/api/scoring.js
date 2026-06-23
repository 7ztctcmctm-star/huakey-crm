import request from '@/utils/request'

export const getScoringRules = () => request.get('/scoring/rules')
export const saveScoringRule = (data) => request.post('/scoring/rules', data)
export const batchCalculateScore = () => request.post('/scoring/batch-calculate')
export const getScoringRanking = () => request.get('/scoring/ranking')
export const deleteScoringRule = (id) => request.delete(`/scoring/rules/${id}`)
export const updateScoringRule = (id, data) => request.put(`/scoring/rules/${id}`, data)
