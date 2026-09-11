import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/system', () => ({ getTagList: vi.fn(), manageTag: vi.fn() }))

import { getTagList } from '@/api/system'
import TagsPage from '@/views/system/tags.vue'

const mountPage = () =>
  mount(TagsPage, {
    global: {
      directives: { permission: {} },
      stubs: {
        // el-button 桩需声明 emits，否则 onClick 会同时透传到根元素（一次点击 emit 两次）
        'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>', emits: ['click'] },
        // 表格与列用自动桩：Element Plus 未在 vitest 注册（unplugin-vue-components 不在
        // vitest.config.js 里），未解析时 Vue 会把 <template #default="{ row }"> 当普通元素插槽、
        // 以 undefined 调用，抛 "Cannot destructure property 'row' of 'undefined'" —— 测试环境专属，
        // 生产由 unplugin-vue-components 解析，不受影响。本用例断言的是状态容器，不是表格行。
        'el-table': true,
        'el-table-column': true,
      },
    },
  })

describe('标签管理页 —— 加载失败态', () => {
  beforeEach(() => vi.clearAllMocks())

  it('接口失败时显示错误态与重试按钮，而不是停在空表', async () => {
    getTagList.mockRejectedValueOnce(new Error('network down'))
    const w = mountPage()
    await flushPromises()
    expect(w.text()).toContain('加载失败')
    expect(w.text()).toContain('重新加载')
    expect(w.text()).not.toContain('暂无标签')
    w.unmount()
  })

  it('点击重试应重新请求接口，并在成功后恢复正常态', async () => {
    getTagList.mockRejectedValueOnce(new Error('boom'))
    const w = mountPage()
    await flushPromises()

    getTagList.mockResolvedValueOnce({ code: 200, data: [{ id: 1, name: '重点客户', color: '#f00', sort: 1 }] })
    await w.find('.state-wrapper__error button').trigger('click')
    await flushPromises()

    expect(getTagList).toHaveBeenCalledTimes(2)
    expect(w.text()).not.toContain('加载失败')
    expect(w.find('.state-wrapper__content').exists()).toBe(true)
    w.unmount()
  })

  it('业务码非 200 也应进入错误态（原先静默停在空表）', async () => {
    getTagList.mockResolvedValueOnce({ code: 500, message: '服务异常' })
    const w = mountPage()
    await flushPromises()
    expect(w.text()).toContain('服务异常')
    w.unmount()
  })
})
