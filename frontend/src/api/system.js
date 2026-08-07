import request from '@/utils/request'

// ============ 用户管理 ============
export const getUserList = (params) => request.post('/user/list', params)
export const saveUser = (data, id) => id ? request.post('/user/update', data) : request.post('/user/add', data)
export const deleteUser = (id) => request.post('/user/delete', { id })
// [v1.0.1 安全补丁] 管理员重置用户密码
export const resetUserPassword = (data) => request.post('/user/reset-password', data)

// ============ 角色管理 ============
export const getRoleList = (params) => request.post('/role/list', params)
export const saveRole = (data, isEdit) => request.post(isEdit ? '/role/update' : '/role/add', data)
export const deleteRole = (id) => request.post('/role/delete', { id })

// ============ 部门管理 ============
export const getDeptList = (params) => request.post('/dept/list', params)
export const saveDept = (data, isEdit) => request.post(isEdit ? '/dept/update' : '/dept/add', data)
export const deleteDept = (id) => request.post('/dept/delete', { id })

// ============ 权限管理 ============
export const getPermissionList = () => request.get('/permission/list')
export const updateRolePermission = (data) => request.post('/permission/role/update', data)
export const getRolePermissions = (id) => request.get(`/permission/role/${id}`)
export const savePermission = (data) => request.post('/permission/add', data)
export const updatePermission = (data) => request.post('/permission/update-node', data)
export const deletePermissionNode = (id) => request.post('/permission/delete-node', { id })

// ============ 操作日志 ============
export const getLogList = (params) => request.post('/log/list', params)
export const exportLog = (params) => request.post('/log/export', params)
export const clearLog = (data) => request.post('/log/clear', data)
export const getLogModules = () => request.get('/log/modules')
export const getLogDetail = (id) => request.get(`/log/detail/${id}`)

// ============ 备份管理 ============
export const getBackupList = () => request.post('/backup/list')
export const createBackup = () => request.post('/backup/create')
export const deleteBackup = (id) => request.post('/backup/delete', { id })
export const restoreBackup = (id) => request.post('/backup/restore', { id })

// ============ 服务工单 ============
export const getServiceList = (params) => request.post('/service/list', params)
export const getServiceDetail = (id) => request.get(`/service/detail/${id}`)
export const addService = (data) => request.post('/service/add', data)
export const updateService = (data) => request.post('/service/update', data)
export const deleteService = (id) => request.post('/service/delete', { id })
export const assignService = (data) => request.post('/service/assign', data)
export const batchAssignService = (data) => request.post('/service/batch-assign', data)
export const startService = (id) => request.post('/service/start', { id })
export const finishService = (data) => request.post('/service/finish', data)
export const confirmService = (data) => request.post('/service/confirm', data)
export const getServiceTypes = () => request.get('/service/types')
export const getServiceStatusList = () => request.get('/service/status-list')
export const getServicePriorityList = () => request.get('/service/priority-list')

// ============ 币种管理 ============
export const getCurrencyList = () => request.get('/currency/list')
export const updateCurrency = (id, data) => request.put(`/currency/${id}`, data)

// ============ 系统配置 ============
export const getConfigList = () => request.get('/config/list')
export const updateConfig = (data) => request.post('/config/update', data)
export const testNotification = () => request.post('/config/test-notification')
export const getHealth = () => request.get('/health')

// ============ 集成管理 ============
export const getIntegrationList = () => request.get('/integration/list')
export const updateIntegration = (data) => request.post('/integration/update', data)
export const testIntegration = (data) => request.post('/integration/test', data)
export const sendIntegrationEmail = (data) => request.post('/integration/send-email', data)
export const getEmailLog = (params) => request.get('/integration/email-log', { params })

// ============ API平台 ============
export const getApiKeys = () => request.get('/platform/keys')
export const saveApiKey = (data, id) => id ? request.put(`/platform/keys/${id}`, data) : request.post('/platform/keys', data)
export const regenerateApiKey = (id) => request.post(`/platform/keys/${id}/regenerate`)
export const deleteApiKey = (id) => request.delete(`/platform/keys/${id}`)
export const getWebhooks = () => request.get('/platform/webhooks')
export const saveWebhook = (data, id) => id ? request.put(`/platform/webhooks/${id}`, data) : request.post('/platform/webhooks', data)
export const testWebhook = (id) => request.post(`/platform/webhooks/${id}/test`)
export const deleteWebhook = (id) => request.delete(`/platform/webhooks/${id}`)
export const getApiDocs = () => request.get('/platform/docs')

// ============ 标签管理 ============
export const getTagList = () => request.get('/tag/list')
export const manageTag = (data) => request.post('/tag/manage', data)

// ============ 评分管理 ============
export const getScoringRules = () => request.get('/scoring/rules')
export const saveScoringRule = (data) => request.post('/scoring/rules', data)
export const deleteScoringRule = (id) => request.delete(`/scoring/rules/${id}`)
export const updateScoringRule = (id, data) => request.put(`/scoring/rules/${id}`, data)
export const batchCalculateScore = () => request.post('/scoring/batch-calculate')
export const getScoringRanking = () => request.get('/scoring/ranking')

// ============ 销售目标 ============
export const getTargetList = (params) => request.post('/target/list', params)
export const batchSetTarget = (data) => request.post('/target/batch-set', data)

// ============ 团队仪表盘 ============
export const getTeamOverview = () => request.get('/team-dashboard/overview')
export const getSalesBreakdown = () => request.get('/team-dashboard/sales-breakdown')
export const getStuckOpportunities = () => request.get('/team-dashboard/stuck-opportunities')
export const getPendingApprovals = () => request.get('/team-dashboard/pending-approvals')
export const getSalesCustomers = (params) => request.post('/team-dashboard/sales-customers', params)
export const getSalesOverdueCustomers = (params) => request.post('/team-dashboard/sales-overdue-customers', params)
export const urgeFollowup = (params) => request.post('/team-dashboard/urge-followup', params)
