import request from '@/utils/request'

export function getIntegrationList() { return request.get('/integration/list') }
export function updateIntegration(data) { return request.post('/integration/update', data) }
export function testIntegration(data) { return request.post('/integration/test', data) }
export function sendIntegrationEmail(data) { return request.post('/integration/send-email', data) }
export function getEmailLog(params) { return request.get('/integration/email-log', { params }) }
