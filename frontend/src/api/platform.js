import request from '@/utils/request'

// API Keys
export function getApiKeys() { return request.get('/platform/keys') }
export function saveApiKey(data, id) { return id ? request.put(`/platform/keys/${id}`, data) : request.post('/platform/keys', data) }
export function regenerateApiKey(id) { return request.post(`/platform/keys/${id}/regenerate`) }
export function deleteApiKey(id) { return request.delete(`/platform/keys/${id}`) }

// Webhooks
export function getWebhooks() { return request.get('/platform/webhooks') }
export function saveWebhook(data, id) { return id ? request.put(`/platform/webhooks/${id}`, data) : request.post('/platform/webhooks', data) }
export function testWebhook(id) { return request.post(`/platform/webhooks/${id}/test`) }
export function deleteWebhook(id) { return request.delete(`/platform/webhooks/${id}`) }

export function getApiDocs() { return request.get('/platform/docs') }
