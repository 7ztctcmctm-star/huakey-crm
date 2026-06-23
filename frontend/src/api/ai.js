import request from '@/utils/request'

export const getAiSuggestions = (params) => request.get(`/ai/suggestions${params || ''}`)
export const generateAiSuggestions = () => request.post('/ai/generate-suggestions')
export const aiSuggestionFeedback = (data) => request.post('/ai/suggestion/feedback', data)
export const aiQuery = (data, config) => request.post('/ai/query', data, config)
export const aiChat = (data, config) => request.post('/ai/chat', data, config)
export const getAiStatus = () => request.get('/ai/status')
