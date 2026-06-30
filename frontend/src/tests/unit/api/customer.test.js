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

  it('getCustomerList 应 POST /customer/list', async () => {
    const { getCustomerList } = await import('@/api/customer')
    await getCustomerList({ page: 1, pageSize: 10 })
    expect(request.post).toHaveBeenCalledWith('/customer/list', { page: 1, pageSize: 10 })
  })

  it('addCustomer 应 POST /customer/add', async () => {
    const { addCustomer } = await import('@/api/customer')
    await addCustomer({ company_name: '测试' })
    expect(request.post).toHaveBeenCalledWith('/customer/add', { company_name: '测试' })
  })

  it('deleteCustomer 应 POST /customer/delete', async () => {
    const { deleteCustomer } = await import('@/api/customer')
    await deleteCustomer(1)
    expect(request.post).toHaveBeenCalledWith('/customer/delete', { id: 1 })
  })

  it('getCustomerDetail 应 GET /customer/detail/:id', async () => {
    const { getCustomerDetail } = await import('@/api/customer')
    await getCustomerDetail(1)
    expect(request.get).toHaveBeenCalledWith('/customer/detail/1')
  })
})
