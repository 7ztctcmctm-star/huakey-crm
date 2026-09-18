import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/request', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ code: 200, data: [] }),
    post: vi.fn().mockResolvedValue({ code: 200, data: { id: 1 } }),
    put: vi.fn().mockResolvedValue({ code: 200 }),
    delete: vi.fn().mockResolvedValue({ code: 200 })
  }
}))

import request from '@/utils/request'

describe('approval API（R-11 补全）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updateApprovalWorkflow 应使用 PUT /approval/workflows/:id（修复旧 POST /workflows/update 错配）', async () => {
    const { updateApprovalWorkflow } = await import('@/api/approval')
    await updateApprovalWorkflow({ id: 5, name: '新流程' })
    expect(request.put).toHaveBeenCalledWith('/approval/workflows/5', { id: 5, name: '新流程' })
    expect(request.post).not.toHaveBeenCalledWith('/approval/workflows/update', expect.anything())
  })

  it('getMyCompleted 应 GET /approval/my-completed', async () => {
    const { getMyCompleted } = await import('@/api/approval')
    await getMyCompleted()
    expect(request.get).toHaveBeenCalledWith('/approval/my-completed')
  })

  it('getApprovalDetailFull 应 GET /approval/detail-full/:type/:id', async () => {
    const { getApprovalDetailFull } = await import('@/api/approval')
    await getApprovalDetailFull('contract', 3)
    expect(request.get).toHaveBeenCalledWith('/approval/detail-full/contract/3')
  })

  it('transferApproval 应 POST /approval/transfer/:id，body 含 to_user_id', async () => {
    const { transferApproval } = await import('@/api/approval')
    await transferApproval(9, 12, '转交说明')
    expect(request.post).toHaveBeenCalledWith('/approval/transfer/9', { to_user_id: 12, remark: '转交说明' })
  })

  it('getApprovalRules 应 GET /approval/rules 并带 business_type 过滤参数', async () => {
    const { getApprovalRules } = await import('@/api/approval')
    await getApprovalRules('contract')
    expect(request.get).toHaveBeenCalledWith('/approval/rules', { params: { business_type: 'contract' } })
  })

  it('createApprovalRule 应 POST /approval/rules', async () => {
    const { createApprovalRule } = await import('@/api/approval')
    const payload = { business_type: 'contract', min_amount: 0, approver_type: 'manager' }
    await createApprovalRule(payload)
    expect(request.post).toHaveBeenCalledWith('/approval/rules', payload)
  })

  it('updateApprovalRule 应 PUT /approval/rules/:id', async () => {
    const { updateApprovalRule } = await import('@/api/approval')
    await updateApprovalRule(4, { status: 0 })
    expect(request.put).toHaveBeenCalledWith('/approval/rules/4', { status: 0 })
  })

  it('deleteApprovalRule 应 DELETE /approval/rules/:id', async () => {
    const { deleteApprovalRule } = await import('@/api/approval')
    await deleteApprovalRule(4)
    expect(request.delete).toHaveBeenCalledWith('/approval/rules/4')
  })
})
