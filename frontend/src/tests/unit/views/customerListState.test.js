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
import { useUser } from '@/composables/useUser'
import CustomerList from '@/views/customer/List.vue'

const { setUser, clearUser } = useUser()

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

/**
 * 查询参数契约回归（2026-09-12）
 *
 * 背景——CI `navigation.spec.js:16`「客户列表页应能正常加载」连续 5 次稳定失败，
 * 解压 trace.zip 拿到失败瞬间的真实请求：`POST /api/v1/customers {"page":1,"pageSize":20}`，
 * 响应 `{"list":[],"total":0}`。即**首屏请求一个筛选参数都没带**。
 *
 * 两个根因（均在本文件修复）：
 *  1. UI 上「我的客户」被选中（activeQuickTab 初值 'mine'），但 viewMode 初值是 'all'
 *     → UI 与查询参数长期脱节，首屏永远不带 owner_id；
 *  2. 状态 tab 的 handleTabChange 只翻页、把 tab 参数整个丢弃
 *     → 用户点「已签约」列表毫无变化（与 f14bacb 修的「假功能」同类，但这是前端侧）。
 *
 * 断言的是**下发给接口的真实参数**，不是渲染结果 —— 避免「UI 看着对、数据是空的」再次漏过。
 */
describe('客户列表 —— 查询参数契约', () => {
  beforeEach(() => vi.clearAllMocks())

  const lastParams = () => {
    const calls = getFormalCustomers.mock.calls
    return calls[calls.length - 1][0]
  }

  it('首屏不按「我的客户」限制时不应带 owner_id（viewMode 与 activeQuickTab 初值一致）', async () => {
    getFormalCustomers.mockResolvedValueOnce({ code: 200, data: { list: [], total: 0 } })
    const w = mountPage()
    await flushPromises()

    expect(getFormalCustomers).toHaveBeenCalled()
    const p = lastParams()
    // 初值统一为「全部客户」：不带 owner_id，也不带 business_status
    expect(p).not.toHaveProperty('owner_id')
    expect(p).not.toHaveProperty('business_status')
    expect(p.page).toBe(1)
    expect(p.pageSize).toBe(20)
    w.unmount()
  })

  it('切换到「我的客户」应下发当前用户 owner_id', async () => {
    getFormalCustomers.mockResolvedValue({ code: 200, data: { list: [], total: 0 } })
    // useUser 是模块级单例：注入真实用户，才能验证 owner_id 真的来自 userInfo
    setUser({ id: 71, roleCode: 'sales', manageAll: false })
    const w = mountPage()
    await flushPromises()

    // CustomerFilter 被桩掉，直接触发其对外事件（等价于用户点快捷 tab）
    w.findComponent({ name: 'CustomerFilter' }).vm.$emit('quick-tab-change', 'mine')
    await flushPromises()

    expect(lastParams()).toHaveProperty('owner_id', 71)
    w.unmount()
    clearUser()
  })

  it('切换状态 tab 应下发 business_status（回归：曾整参丢弃）', async () => {
    getFormalCustomers.mockResolvedValue({ code: 200, data: { list: [], total: 0 } })
    const w = mountPage()
    await flushPromises()

    w.findComponent({ name: 'CustomerFilter' }).vm.$emit('tab-change', 'signed')
    await flushPromises()
    expect(lastParams()).toHaveProperty('business_status', 'signed')

    // 切回「全部」应撤下该参数，而不是残留 'signed'
    w.findComponent({ name: 'CustomerFilter' }).vm.$emit('tab-change', 'all')
    await flushPromises()
    expect(lastParams()).not.toHaveProperty('business_status')
    w.unmount()
  })
})
