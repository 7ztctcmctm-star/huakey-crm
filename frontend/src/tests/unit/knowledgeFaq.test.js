import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'

// mock 知识库 API：模拟后端返回 { code:200, data:{ list, total } }
vi.mock('@/api/tools', () => ({
  getKnowledgeFaqs: vi.fn(),
  addKnowledgeFaq: vi.fn(),
  updateKnowledgeFaq: vi.fn(),
  deleteKnowledgeFaq: vi.fn(),
  getKnowledgeFaqsCategories: vi.fn().mockResolvedValue({ code: 200, data: [] })
}))

import FaqsView from '@/views/knowledge/faqs.vue'
import * as api from '@/api/tools'

// el-collapse-item 的「问题」在 #title 具名插槽里；未注册该组件时具名插槽会被丢弃，
// 故必须提供渲染具名插槽的 stub，否则列表渲染不出问题文本。
const elStub = { template: '<div><slot /></div>' }
const collapseItemStub = { template: '<div><slot name="title" /><slot /></div>' }
const mountOpts = {
  attachTo: document.body,
  global: {
    components: {
      'el-collapse': elStub,
      'el-collapse-item': collapseItemStub,
      'el-tag': elStub,
      'el-button': { template: '<button><slot /></button>' }
    }
  }
}

describe('知识库 FAQ 视图 - 检索渲染', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('列表应正确消费 res.data.list（修复前误用 res.data 导致空白）', async () => {
    api.getKnowledgeFaqs.mockResolvedValue({
      code: 200,
      data: {
        list: [
          { id: 1, question: '如何发起报价？', answer: '进入报价模块新建。', category: '操作指南', view_count: 5 },
          { id: 2, question: '合同模板在哪下载？', answer: '文档模板页。', category: '文档', view_count: 2 }
        ],
        total: 2
      }
    })

    const wrapper = mount(FaqsView, mountOpts)
    await flushPromises()
    await nextTick()

    const text = wrapper.text()
    expect(text).toContain('如何发起报价？')
    expect(text).toContain('合同模板在哪下载？')
    // 列表渲染出两条 FAQ
    expect(wrapper.findAll('.faq-question').length).toBe(2)

    wrapper.unmount()
  })

  it('无数据时展示空态', async () => {
    api.getKnowledgeFaqs.mockResolvedValue({ code: 200, data: { list: [], total: 0 } })

    const wrapper = mount(FaqsView, mountOpts)
    await flushPromises()
    await nextTick()

    expect(wrapper.findAll('.faq-question').length).toBe(0)
    expect(wrapper.text()).toContain('暂无常见问题')

    wrapper.unmount()
  })
})
