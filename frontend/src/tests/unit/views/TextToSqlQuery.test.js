import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

// Mock AI API
const mocks = {
  aiQuery: vi.fn(),
  getAiStatus: vi.fn()
}
vi.mock('@/api/ai', () => ({
  aiQuery: (...args) => mocks.aiQuery(...args),
  getAiStatus: (...args) => mocks.getAiStatus(...args)
}))

// 捕获图表 option（jsdom 无 canvas，mock useChart）
const { mockInitChart } = vi.hoisted(() => {
  const initChart = vi.fn(() => ({ off: () => {}, on: () => {}, setOption: () => {} }))
  return { mockInitChart: initChart }
})
vi.mock('@/composables/useChart', () => ({
  useChart: () => ({
    refs: { resultChartRef: { value: null } },
    echarts: null,
    initChart: mockInitChart,
    getChart: () => null,
    dispose: () => {}
  })
}))

import TextToSqlQuery from '@/views/ai/TextToSqlQuery.vue'

const elStub = { template: '<div><slot /></div>' }
const attrStub = { template: '<div><slot />{{ title }}{{ description }}</div>', props: ['title', 'description'] }
const globalComponents = {
  'el-card': elStub,
  'el-alert': attrStub,
  'el-input': { template: '<input v-model="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup.enter="$emit(\'keyup\', $event)" />', props: ['modelValue'], emits: ['update:modelValue', 'keyup'] },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>', emits: ['click'] },
  'el-tag': elStub,
  'el-collapse': elStub,
  'el-collapse-item': { template: '<div><slot /></div>' },
  'el-table': { template: '<div class="el-table-stub">{{ data.length }} rows</div>', props: ['data'] },
  'el-table-column': { template: '<span />' }
}
const mountOpts = { global: { components: globalComponents } }

const sampleSuccess = {
  code: 200,
  data: {
    sql: 'SELECT status, COUNT(*) AS c FROM crm_customer GROUP BY status',
    answer: '各状态客户数如下。',
    rows: [
      { status: 'lead', c: 5 },
      { status: 'signed', c: 3 }
    ],
    total: 2,
    chartSuggestion: { type: 'pie', reason: '检测到维度与数值。' }
  }
}

describe('TextToSqlQuery (R-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAiStatus.mockResolvedValue({ code: 200, data: { online: true } })
  })

  it('1. 渲染权限范围安全提示', async () => {
    mocks.aiQuery.mockResolvedValue(sampleSuccess)
    const wrapper = mount(TextToSqlQuery, mountOpts)
    await flushPromises()
    expect(wrapper.text()).toContain('仅查询你权限范围内的数据')
    expect(wrapper.text()).toContain('商机 / 客户（只读）/ 合同')
  })

  it('2. 正常查询：展示可折叠 SQL + 图表建议 + 表格', async () => {
    mocks.aiQuery.mockResolvedValue(sampleSuccess)
    const wrapper = mount(TextToSqlQuery, mountOpts)
    await flushPromises()

    await wrapper.find('input').setValue('各状态客户数')
    await wrapper.find('button').trigger('click')
    await flushPromises()
    await nextTick()

    const text = wrapper.text()
    expect(text).toContain('SELECT status, COUNT(*) AS c FROM crm_customer GROUP BY status')
    expect(text).toContain('图表建议')
    expect(text).toContain('2 rows')
    // 饼图建议触发图表渲染，option 使用图表类型 pie
    expect(mockInitChart).toHaveBeenCalled()
    const option = mockInitChart.mock.calls[mockInitChart.mock.calls.length - 1][1]
    expect(option.series[0].type).toBe('pie')
  })

  it('3. 降级：无 SQL 但有提示语时显示 info 提示', async () => {
    mocks.aiQuery.mockResolvedValue({
      code: 200,
      data: { sql: '', answer: 'AI 查询仅限「商机 / 客户（只读）/ 合同」维度。', rows: [] }
    })
    const wrapper = mount(TextToSqlQuery, mountOpts)
    await flushPromises()

    await wrapper.find('input').setValue('供应商名单')
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('AI 查询仅限')
    expect(mockInitChart).not.toHaveBeenCalled()
  })

  it('4. 异常：服务不可用显示 error 降级提示', async () => {
    mocks.aiQuery.mockRejectedValue({ response: { data: { message: 'AI 查询服务暂时不可用' } } })
    const wrapper = mount(TextToSqlQuery, mountOpts)
    await flushPromises()

    await wrapper.find('input').setValue('测试')
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('AI 查询服务暂时不可用')
  })
})
