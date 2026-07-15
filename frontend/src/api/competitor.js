import request from '@/utils/request'

// ============ 竞品分析 ============
export const getCompetitorList = (params) => request.post('/competitor/list', params)
export const getCompetitorDetail = (id) => request.get('/competitor/' + id)
export const addCompetitor = (data) => request.post('/competitor/add', data)
export const updateCompetitor = (data) => request.put('/competitor/' + data.id, data)
export const deleteCompetitor = (id) => request.delete('/competitor/' + id)
export const addCompetitorEncounter = (data) => request.post('/competitor/encounters/add', data)
export const addCompetitorIntel = (data) => request.post('/competitor/intel/add', data)
export const getCompetitorAnalysis = () => request.get('/competitor/analysis/overview')
export const getCompetitorEncounters = (id) => request.get('/competitor/' + id + '/encounters')
export const getCompetitorIntel = (id) => request.get('/competitor/' + id + '/intel')
export const deleteCompetitorEncounter = (id) => request.delete('/competitor/encounters/' + id)
export const deleteCompetitorIntel = (id) => request.delete('/competitor/intel/' + id)
