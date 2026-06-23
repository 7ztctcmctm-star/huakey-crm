import request from '@/utils/request'

// 用户
export function getUserList(params) { return request.post('/user/list', params) }
export function deleteUser(id) { return request.post('/user/delete', { id }) }
// 角色
export function getRoleList(params) { return request.post('/role/list', params) }
export function deleteRole(id) { return request.post('/role/delete', { id }) }
// 部门
export function getDeptList(params) { return request.post('/dept/list', params) }
export function deleteDept(id) { return request.post('/dept/delete', { id }) }
// 权限
export function getPermissionList() { return request.get('/permission/list') }
export function updateRolePermission(data) { return request.post('/permission/role/update', data) }
export function deletePermissionNode(id) { return request.post('/permission/delete-node', { id }) }
// 日志
export function getLogList(params) { return request.post('/log/list', params) }
export function exportLog(params) { return request.post('/log/export', params) }
export function clearLog(data) { return request.post('/log/clear', data) }
export function getLogModules() { return request.get('/log/modules') }
// 备份
export function getBackupList() { return request.post('/backup/list') }
export function createBackup() { return request.post('/backup/create') }
export function deleteBackup(id) { return request.post('/backup/delete', { id }) }
export function restoreBackup(id) { return request.post('/backup/restore', { id }) }
// 币种
export function getCurrencyList() { return request.get('/currency/list') }

// 用户管理
export function saveUser(data, id) { return id ? request.put('/user/update', data) : request.post('/user/add', data) }

// 部门管理
export function saveDept(data, isEdit) { return request.post(isEdit ? '/dept/update' : '/dept/add', data) }

// 角色管理
export function saveRole(data, isEdit) { return request.post(isEdit ? '/role/update' : '/role/add', data) }
export function getRolePermissions(id) { return request.get(`/permission/role/${id}`) }

// 操作日志
export function getLogDetail(id) { return request.get(`/log/detail/${id}`) }

// 权限管理
export function savePermission(data) { return request.post('/permission/save', data) }

// 货币
export function updateCurrency(id, data) { return request.put(`/currency/${id}`, data) }
