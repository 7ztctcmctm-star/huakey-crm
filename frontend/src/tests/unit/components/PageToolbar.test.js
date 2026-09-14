import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PageToolbar from '@/components/common/PageToolbar.vue'

// Element Plus 组件未在 vitest 中注册（unplugin-vue-components 不在 vitest.config.js 里），
// 显式桩成真实元素，才能对「按钮文案 + 点击」做断言。
const stubs = {
  global: {
    stubs: {
      'el-button': {
        template: '<button @click="$emit(\'click\')"><slot /></button>',
        emits: ['click'],
      },
      'el-icon': { template: '<span class="el-icon"><slot /></span>' },
    },
  },
}

describe('PageToolbar', () => {
  it('未提供 #extra 槽时，不渲染「展开」按钮（避免点了没反应的死按钮）', () => {
    const w = mount(PageToolbar, {
      ...stubs,
      props: { collapsible: true },
      slots: { default: '<div class="f1">筛选项</div>' },
    })
    const toggle = w.findAll('button').filter((b) => b.text().includes('展开'))
    expect(toggle.length).toBe(0)
  })

  it('提供 #extra 槽时，渲染「展开」按钮；点击后文案变「收起」', async () => {
    const w = mount(PageToolbar, {
      ...stubs,
      props: { collapsible: true },
      slots: {
        default: '<div class="f1">筛选项</div>',
        extra: '<div class="f2">折叠项</div>',
      },
    })

    let toggle = w.findAll('button').filter((b) => b.text().includes('展开'))
    expect(toggle.length).toBe(1)

    await toggle[0].trigger('click')
    toggle = w.findAll('button').filter((b) => b.text().includes('收起'))
    expect(toggle.length).toBe(1)
  })

  it('collapsible=false 时即使有 #extra 槽也不渲染折叠按钮', () => {
    const w = mount(PageToolbar, {
      ...stubs,
      props: { collapsible: false },
      slots: {
        default: '<div class="f1">筛选项</div>',
        extra: '<div class="f2">折叠项</div>',
      },
    })
    const toggle = w.findAll('button').filter((b) => b.text().includes('展开'))
    expect(toggle.length).toBe(0)
  })

  it('未提供 #actions 槽时不渲染右侧操作区', () => {
    const w = mount(PageToolbar, {
      ...stubs,
      slots: { default: '<div class="f1">筛选项</div>' },
    })
    expect(w.find('.page-toolbar__actions').exists()).toBe(false)
  })

  it('提供 #actions 槽时渲染右侧操作区', () => {
    const w = mount(PageToolbar, {
      ...stubs,
      slots: {
        default: '<div class="f1">筛选项</div>',
        actions: '<button class="add-btn">新增</button>',
      },
    })
    expect(w.find('.page-toolbar__actions').exists()).toBe(true)
    expect(w.find('.add-btn').exists()).toBe(true)
  })

  it('defaultExpanded=false 时折叠区初始隐藏', () => {
    const w = mount(PageToolbar, {
      ...stubs,
      props: { collapsible: true, defaultExpanded: false },
      slots: {
        default: '<div class="f1">筛选项</div>',
        extra: '<div class="f2">折叠项</div>',
      },
    })
    expect(w.find('.page-toolbar__filters-extra').isVisible()).toBe(false)
  })

  it('defaultExpanded=true 时折叠区初始可见', () => {
    const w = mount(PageToolbar, {
      ...stubs,
      props: { collapsible: true, defaultExpanded: true },
      slots: {
        default: '<div class="f1">筛选项</div>',
        extra: '<div class="f2">折叠项</div>',
      },
    })
    expect(w.find('.page-toolbar__filters-extra').isVisible()).toBe(true)
  })

  it('#filter-actions 槽始终渲染（承载查询/重置按钮）', () => {
    const w = mount(PageToolbar, {
      ...stubs,
      slots: {
        default: '<div class="f1">筛选项</div>',
        'filter-actions': '<button class="submit-btn">查询</button>',
      },
    })
    expect(w.find('.submit-btn').exists()).toBe(true)
  })
})
