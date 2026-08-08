import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// 局部 mock 图标（覆盖 setup.js 全局 mock 未覆盖的图标）
vi.mock('@element-plus/icons-vue', () => ({
  TrendCharts: { name: 'TrendCharts', template: '<span />' },
  Document: { name: 'Document', template: '<span />' },
  Wallet: { name: 'Wallet', template: '<span />' }
}))

// Mock API modules
const mocks = {
  overview: vi.fn(),
  funnel: vi.fn(),
  revenue: vi.fn(),
  collection: vi.fn()
}

vi.mock('@/api/analytics', () => ({
  getAnalyticsOverview: (...args) => mocks.overview(...args),
  getAnalyticsFunnel: (...args) => mocks.funnel(...args),
  getAnalyticsContractRevenue: (...args) => mocks.revenue(...args),
  getAnalyticsPaymentCollection: (...args) => mocks.collection(...args)
}))

vi.mock('@/composables/useFormat', () => ({
  formatAmount: (v) => String(v ?? 0)
}))

import SalesAnalytics from '@/components/dashboard/SalesAnalytics.vue'

// Mock Element Plus 组件（jsdom 下避免真实渲染，渲染 attributes 使 title/description 可见）
const attrStub = { template: '<div><slot />{{ title }}{{ description }}</div>', props: ['title', 'description'] }
const elStub = { template: '<div><slot /></div>' }
const globalComponents = {
  'el-alert': attrStub,
  'el-card': elStub,
  'el-row': elStub,
  'el-col': elStub,
  'el-descriptions': elStub,
  'el-descriptions-item': { template: '<div><slot /></div>' },
  'el-progress': elStub,
  'el-icon': elStub,
  'el-empty': attrStub
}

// Mock v-loading 指令（jsdom 下 Element Plus 指令缺失）
const loadingDirective = { mounted: () => {}, unmounted: () => {} }
const mountOpts = { global: { components: globalComponents, directives: { loading: loadingDirective } } }

describe('SalesAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockFunnelData = {
    code: 200,
    data: {
      stages: [
        { stage: 1, stage_name: '询盘', count: 10, amount: '1000.00' },
        { stage: 5, stage_name: '成交', count: 3, amount: '3000.00' }
      ],
      win_rate: 23.08
    }
  }
  const mockRevenue = { code: 200, data: { total_amount: '5000.00', active_amount: '2000.00', completed_amount: '1000.00', cancelled_amount: '500.00' } }
  const mockCollection = { code: 200, data: { receivable_amount: '5000.00', received_amount: '3000.00', outstanding_amount: '2000.00', overdue_amount: '100.00', collection_rate: 60 } }
  const mockOverview = { code: 200, data: { opportunity_amount: '4000.00', contract_amount: '5000.00', received_amount: '3000.00', pending_amount: '2000.00' } }

  it('1. 正常渲染 KPI 卡片（数据绑定）', async () => {
    mocks.overview.mockResolvedValue(mockOverview)
    mocks.funnel.mockResolvedValue(mockFunnelData)
    mocks.revenue.mockResolvedValue(mockRevenue)
    mocks.collection.mockResolvedValue(mockCollection)

    const wrapper = mount(SalesAnalytics, mountOpts)
    await flushPromises()

    const text = wrapper.text()
    // 销售漏斗数据
    expect(text).toContain('商机总数')
    expect(text).toContain('13') // 商机总数
    expect(text).toContain('23.08%') // win rate
    expect(text).toContain('询盘')
    expect(text).toContain('成交')
    // 合同收入
    expect(text).toContain('5000.00')
    // 回款
    expect(text).toContain('应收')
    expect(text).toContain('已收')
    expect(text).toContain('回款率')
    expect(text).toContain('60%')
  })

  it('2. 无数据时显示 empty 状态', async () => {
    mocks.overview.mockResolvedValue({ code: 200, data: {} })
    mocks.funnel.mockResolvedValue({ code: 200, data: { stages: [], win_rate: 0 } })
    mocks.revenue.mockResolvedValue({ code: 200, data: {} })
    mocks.collection.mockResolvedValue({ code: 200, data: {} })

    const wrapper = mount(SalesAnalytics, mountOpts)
    await flushPromises()

    expect(wrapper.text()).toContain('暂无销售分析数据')
  })

  it('3. API 错误显示 error 状态', async () => {
    mocks.overview.mockRejectedValue(new Error('网络错误'))
    mocks.funnel.mockRejectedValue(new Error('网络错误'))
    mocks.revenue.mockRejectedValue(new Error('网络错误'))
    mocks.collection.mockRejectedValue(new Error('网络错误'))

    const wrapper = mount(SalesAnalytics, mountOpts)
    await flushPromises()

    expect(wrapper.text()).toContain('网络错误')
  })
})
