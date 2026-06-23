import request from '@/utils/request'

export const getSocialRecords = (params) => request.get('/social/records', { params })
export const saveSocialRecord = (data) => request.post('/social/records', data)
export const getSocialStats = () => request.get('/social/stats')
export const deleteSocialRecord = (id) => request.delete(`/social/records/${id}`)
