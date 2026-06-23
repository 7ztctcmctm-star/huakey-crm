import request from '@/utils/request'

export function getConfigList() { return request.get('/config/list') }
export function updateConfig(data) { return request.post('/config/update', data) }
export function testNotification() { return request.post('/config/test-notification') }
export function getHealth() { return request.get('/health') }
