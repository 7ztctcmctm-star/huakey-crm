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

describe('customer API', () => {
  beforeEach(() => vi.clearAllMocks())

  // Phase 5：客户中心拆分后端点 /customer/* → /customers/*
  it('getCustomerList 应 POST /customers/list', async () => {
    const { getCustomerList } = await import('@/api/customer')
    await getCustomerList({ page: 1, pageSize: 10 })
    expect(request.post).toHaveBeenCalledWith('/customers/list', { page: 1, pageSize: 10 })
  })

  it('addCustomer 应 POST /customers/add', async () => {
    const { addCustomer } = await import('@/api/customer')
    await addCustomer({ company_name: '测试' })
    expect(request.post).toHaveBeenCalledWith('/customers/add', { company_name: '测试' })
  })

  it('deleteCustomer 应 POST /customers/delete', async () => {
    const { deleteCustomer } = await import('@/api/customer')
    await deleteCustomer(1)
    expect(request.post).toHaveBeenCalledWith('/customers/delete', { id: 1 })
  })

  it('getCustomerDetail 应 GET /customers/detail/:id', async () => {
    const { getCustomerDetail } = await import('@/api/customer')
    await getCustomerDetail(1)
    expect(request.get).toHaveBeenCalledWith('/customers/detail/1')
  })

  // 阶段3（2026-09-14）：能力型端点统一到 /customers/* 命名空间
  it('assignCustomer 应 POST /customers/assign（阶段3 归拢）', async () => {
    const { assignCustomer } = await import('@/api/customer')
    await assignCustomer({ customer_id: 1, to_user_id: 2 })
    expect(request.post).toHaveBeenCalledWith('/customers/assign', { customer_id: 1, to_user_id: 2 })
  })

  it('batchAssignCustomer 应 POST /customers/batch-assign', async () => {
    const { batchAssignCustomer } = await import('@/api/customer')
    await batchAssignCustomer({ customer_ids: [1, 2], to_user_id: 3 })
    expect(request.post).toHaveBeenCalledWith('/customers/batch-assign', { customer_ids: [1, 2], to_user_id: 3 })
  })

  it('addContact 应 POST /customers/contact/add', async () => {
    const { addContact } = await import('@/api/customer')
    await addContact({ customer_id: 1, name: '张三' })
    expect(request.post).toHaveBeenCalledWith('/customers/contact/add', { customer_id: 1, name: '张三' })
  })

  it('getSalesUsers 应 GET /customers/sales-users', async () => {
    const { getSalesUsers } = await import('@/api/customer')
    await getSalesUsers()
    expect(request.get).toHaveBeenCalledWith('/customers/sales-users')
  })

  it('getCustomer360 应 GET /customers/:id/360', async () => {
    const { getCustomer360 } = await import('@/api/customer')
    await getCustomer360(7)
    expect(request.get).toHaveBeenCalledWith('/customers/7/360')
  })

  it('getOverdueCustomers 应 GET /customers/overdue', async () => {
    const { getOverdueCustomers } = await import('@/api/customer')
    await getOverdueCustomers({ page: 1 })
    expect(request.get).toHaveBeenCalledWith('/customers/overdue', { params: { page: 1 } })
  })

  it('importPreview 应 POST /customers/import-preview', async () => {
    const { importPreview } = await import('@/api/customer')
    const fd = new FormData()
    await importPreview(fd)
    expect(request.post).toHaveBeenCalledWith('/customers/import-preview', fd)
  })
})
