import request from '@/utils/request'

export const getMyPending = () => request.get('/approval/my-pending')
export const getMySubmitted = () => request.get('/approval/my-submitted')
export const getMyCompleted = () => request.get('/approval/my-completed')
export const getApprovalDetail = (type, id) => request.get(`/approval/detail-with-history/${type}/${id}`)
export const getApprovalDetailFull = (type, id) => request.get(`/approval/detail-full/${type}/${id}`)
export const approveRequest = (id, remark) => request.post(`/approval/approve/${id}`, { remark })
export const rejectRequest = (id, remark) => request.post(`/approval/reject/${id}`, { remark })
export const transferApproval = (id, toUserId, remark) => request.post(`/approval/transfer/${id}`, { to_user_id: toUserId, remark })
export const batchApprove = (ids) => request.post('/approval/batch-approve', { ids, remark: '批量通过' })
export const batchReject = (ids, remark) => request.post('/approval/batch-reject', { ids, remark })
export const withdrawApproval = (type, id) => request.delete(`/approval/withdraw/${type}/${id}`)
export const submitApproval = (data) => request.post('/approval/submit', data)
export const getApprovalWorkflows = () => request.get('/approval/workflows')
export const updateApprovalWorkflow = (data) => request.put(`/approval/workflows/${data.id}`, data)
export const saveApprovalWorkflow = (data) => request.post('/approval/workflows', data)
export const deleteApprovalWorkflow = (id) => request.delete(`/approval/workflows/${id}`)

// 审批规则（阈值→审批人矩阵）
export const getApprovalRules = (businessType) => request.get('/approval/rules', { params: { business_type: businessType } })
export const createApprovalRule = (data) => request.post('/approval/rules', data)
export const updateApprovalRule = (id, data) => request.put(`/approval/rules/${id}`, data)
export const deleteApprovalRule = (id) => request.delete(`/approval/rules/${id}`)
