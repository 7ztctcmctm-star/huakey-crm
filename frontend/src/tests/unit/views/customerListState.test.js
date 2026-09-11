import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// setup.js 把 @element-plus/icons-vue mock 成了白名单，缺 DataAnalysis/ChatLineRound/Select
// 时 vitest 直接抛「No "X" export is defined on the mock」。真实图标是极轻量的 Vue 组件，
// jsdom 下可正常渲染，故本文件直接用真实模块（覆盖 setup.js 的白名单 mock）。
vi.mock('@element-plus/icons-vue', async () => await vi.importActual('@element-plus/icons-vue'))

vi.mock('@/api/customer', () => ({
  getFormalCustomers: vi.fn(),
  deleteCustomer: vi.fn(),
  batchAssignCustomer: vi.fn(),
  exportCustomers: vi.fn(),
  getSalesUsers: vi.fn().mockResolvedValue({ code: 200, data: [] }),
  getMySubordinates: vi.fn().mockResolvedValue({ code: 200, data: [] }),
}))

import { getFormalCustomers } from '@/api/customer'
import CustomerList from '@/views/customer/List.vue'

const mountPage = () =>
  mount(CustomerList, {
    global: {
      directives: { permission: {} },
      stubs: {
        // 只保留 CustomerTable（本次改动的载体），其余子组件与网络无关，直接桩掉
        CustomerImport: true,
        DataQualityCheck: true,
        CustomerFilter: true,
        CustomerPagination: true,
        CustomerFormDialog: true,
        AssignDialog: true,
        FollowDialog: true,
        BatchFollowDialog: true,
        'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>', emits: ['click'] },
        // 表格与列用自动桩（原因见 tagsState.test.js：Element Plus 未在 vitest 注册）
        'el-table': true,
        'el-table-column': true,
      },
    },
  })

describe('客户列表 —— 加载失败态', () => {
  beforeEach(() => vi.clearAllMocks())

  it('接口失败时表格区显示错误态与重试按钮，而不是停在空表', async () => {
    getFormalCustomers.mockRejectedValueOnce(new Error('boom'))
    const w = mountPage()
    await flushPromises()
    expect(w.text()).toContain('加载失败')
    expect(w.text()).toContain('重新加载')
    w.unmount()
  })

  it('点击重试应重新请求客户列表', async () => {
    getFormalCustomers.mockRejectedValueOnce(new Error('boom'))
    const w = mountPage()
    await flushPromises()
    getFormalCustomers.mockResolvedValueOnce({ code: 200, data: { list: [], total: 0 } })
    await w.find('.state-wrapper__error button').trigger('click')
    await flushPromises()
    expect(getFormalCustomers).toHaveBeenCalledTimes(2)
    w.unmount()
  })
})
