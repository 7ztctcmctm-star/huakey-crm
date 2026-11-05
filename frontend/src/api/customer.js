import request from '@/utils/request'

// ============ 客户管理（Phase 5 + 阶段3：统一走 /customers 命名空间） ============
// [2026-09-14 阶段4] 老树 /api/v1/customer/* 已整体下线（不再挂载），/customers/* 是唯一命名空间。
// CRUD 由 routes/customers.js 承载，能力型端点（分配/批量分配/联系人/360/分配规则/
// 导入模板与预览确认/逾期/临回收/销售用户/下属）由 customer/{assign,contact,import,detailExtras}.js 挂载到同一前缀。

/**
 * 全量客户列表（分页 + 筛选 + 排序 + 数据权限自动追加）
 * @param {Object} params - { page, pageSize, keyword, company_name, contact_name,
 *   phone, source, level, status, business_status, owner_id, start_date, end_date,
 *   overdue, unassigned, customer_type, lifecycle_status, overdue_follow, tag_id, sort }
 * @returns {Promise<{code:number, data:{list:Array, total:number}}>}
 */
export const getCustomerList = (params) => request.post('/customers/list', params)

/** 正式客户列表（status IN following/quoted/negotiating/signed/lost/paused，且 owner_id IS NOT NULL） */
export const getFormalCustomers = (params) => request.post('/customers', params)

export const getCustomerDetail = (id) => request.get(`/customers/detail/${id}`)

/**
 * 新增客户
 * @param {Object} data - 后端 schema 必填：company_name + contacts（至少 1 个联系人）
 *   可选：address/industry/source/level/remark；联系人为
 *   { name(必填), position?, phone?, email?, wechat?, is_decision?, remark? }
 */
export const addCustomer = (data) => request.post('/customers/add', data)

export const updateCustomer = (data) => request.post('/customers/update', data)

export const deleteCustomer = (id) => request.post('/customers/delete', { id })

/**
 * 分配客户给销售（owner_id 变更 + 写 crm_customer_transfer 日志）
 * @param {Object} data - 单条分配：{ customer_id, to_user_id|null, remark? }
 *   （批量分配请用 batchAssignCustomer，字段为 { customer_ids:[], to_user_id }）
 */
export const assignCustomer = (data) => request.post('/customers/assign', data)

export const batchAssignCustomer = (data) => request.post('/customers/batch-assign', data)

/** 客户状态向前推进（lead→sea→following→quoted→negotiating→signed） */
export const forwardCustomer = (data) => request.post('/customers/forward', data)

/** 客户状态向后回退（任意非终态 → lost / paused） */
export const backwardCustomer = (data) => request.post('/customers/backward', data)

/** 客户导出（xlsx，responseType: blob） */
export const exportCustomers = (params) => request.post('/customers/export', params, { responseType: 'blob' })

export const addContact = (data) => request.post('/customers/contact/add', data)
export const updateContact = (data) => request.post('/customers/contact/update', data)
export const deleteContact = (id) => request.post('/customers/contact/delete', { id })

/** 销售用户列表（用于分配下拉，data_scope=self 的销售只能看到自己） */
export const getSalesUsers = () => request.get('/customers/sales-users')

/** 当前用户的直属下属列表（manager 用） */
export const getMySubordinates = () => request.get('/customers/my-subordinates')

/** 客户 360 视图（聚合客户 + 联系人 + 跟进 + 报价 + 商机 + 合同 + 付款） */
export const getCustomer360 = (id) => request.get(`/customers/${id}/360`)

/** 释放客户到公海（owner_id=NULL + pool_status='sea'） */
export const releaseCustomer = (customerId) => request.post('/customers/release', { customer_id: customerId })

export const getAssignRules = () => request.get('/customers/assign-rules')
export const createAssignRule = (data) => request.post('/customers/assign-rules/add', data)
export const updateAssignRule = (data) => request.post('/customers/assign-rules/update', data)
export const deleteAssignRule = (id) => request.post('/customers/assign-rules/delete', { id })

/** 客户导入模板下载（xlsx，必须按 blob 接收，否则 xlsx 会被当文本解析） */
export const getCustomerTemplate = () => request.get('/customers/template', { responseType: 'blob' })

/** 导入预览（不写 DB，仅解析 + 返回错误行 + 统计；config 透传取消/进度） */
export const importPreview = (data, config) => request.post('/customers/import-preview', data, config)

/** 导入确认（校验通过后批量 INSERT，事务保护；config 透传取消/进度） */
export const importConfirm = (data, config) => request.post('/customers/import-confirm', data, config)

/** 触发单个客户的 AI 评分（scoring_rule 表驱动） */
export const calculateCustomerScore = (id) => request.post(`/scoring/calculate/${id}`)

// ============ 跟进记录 ============

/** 某客户的跟进列表（分页 + 按时间倒序） */
export const getFollowUpList = (customerId, params = {}) => request.post('/follow-up/list', { customer_id: customerId, ...params })

/**
 * 新增跟进 — **唯一会驱动客户状态变化的端点**（lead/sea→following）
 * @param {Object} data - { customer_id, content, next_time?, next_content?, follow_type? }
 * @param {boolean} [data.advance_status=true] - 是否自动推进客户状态
 */
export const addFollowUp = (data) => request.post('/follow-up/add', data)

export const updateFollowUp = (data) => request.post('/follow-up/update', data)
export const deleteFollowUp = (id) => request.post('/follow-up/delete', { id })

export const getFollowupTemplates = () => request.get('/followup-templates')
export const saveFollowupTemplate = (data) => request.post('/followup-templates', data)
/** 编辑跟进模板（PUT /:id；POST 为新建，编辑误用 POST 会重复创建） */
export const updateFollowupTemplate = (id, data) => request.put(`/followup-templates/${id}`, data)
export const deleteFollowupTemplate = (id) => request.delete(`/followup-templates/${id}`)

/** 跟进日历视图（返回 { list, total }，前端按 list 渲染月/周视图） */
export const getFollowUpCalendar = (params) => request.post('/follow-up/calendar', params)

/** 今天的待办跟进（含逾期） */
export const getTodayReminders = () => request.get('/follow-up/remind')

/** 明天的计划跟进 */
export const getTomorrowTasks = () => request.get('/follow-up/tomorrow')

export const getFollowUpPlans = (params = {}) => request.post('/follow-up/plan/list', params)
export const addFollowUpPlan = (data) => request.post('/follow-up/plan/add', data)
export const completeFollowUpPlan = (data) => request.post('/follow-up/plan/complete', data)
export const cancelFollowUpPlan = (data) => request.post('/follow-up/plan/cancel', data)
export const batchAddFollowUp = (items) => request.post('/follow-up/batch-add', { items })
export const getFollowUpTaskStats = () => request.get('/follow-up/task-stats')

/**
 * 逾期客户列表（超过 overdue_days 未跟进，默认 15 天，sys_config 可配）
 * 默认筛选：status NOT IN ('signed','lost') 且 owner_id IS NOT NULL
 */
export const getOverdueCustomers = (params) => request.get('/customers/overdue', { params })

/**
 * 临近回收客户列表（距离 auto-recycle 还剩 near_recycle_days 天，默认 7 天）
 */
export const getNearRecycleCustomers = (params) => request.get('/customers/near-recycle', { params })
