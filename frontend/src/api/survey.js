import request from '@/utils/request'

// ============ 满意度调查 ============
export const getSurveyTemplates = () => request.get('/survey/templates')
export const saveSurveyTemplate = (data) => request.post('/survey/templates', data)
export const deleteSurveyTemplate = (id) => request.delete(`/survey/templates/${id}`)
export const getSurveyCampaigns = () => request.get('/survey/campaigns')
export const saveSurveyCampaign = (data) => request.post('/survey/campaigns', data)
export const getSurveyAnalytics = (id) => request.get(`/survey/analytics/${id}`)
export const getCampaignDetail = (id) => request.get(`/survey/campaigns/${id}`)
export const getCampaignResponses = (id, params) => request.get(`/survey/campaigns/${id}/responses`, { params })
export const startCampaign = (id) => request.post(`/survey/campaigns/${id}/start`)
export const closeCampaign = (id) => request.post(`/survey/campaigns/${id}/close`)
export const getSurveyCampaign = (id) => request.get(`/survey/campaigns/${id}`)
export const submitSurveyResponse = (campaignId, data) => request.post(`/survey/respond/${campaignId}`, data)
