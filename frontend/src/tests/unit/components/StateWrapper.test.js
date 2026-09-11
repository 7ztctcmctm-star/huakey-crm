import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StateWrapper from '@/components/common/StateWrapper.vue'

const stubs = {
  global: {
    stubs: {
      // Element Plus 组件未在 vitest 中注册（unplugin-vue-components 不在 vitest.config.js 里），
      // 显式桩成真实 button，才能对「按钮唯一性 + 点击」做断言。
      // 必须声明 emits: ['click']：否则 onClick 会同时作为 attrs 透传到根元素，
      // 造成「一次点击 emit 两次」的测试假象。
      'el-button': {
        template: '<button @click="$emit(\'click\')"><slot /></button>',
        emits: ['click'],
      },
    },
  },
}

describe('StateWrapper', () => {
  it('错误态只渲染一个「重新加载」按钮（不得出现死按钮）', () => {
    const w = mount(StateWrapper, { ...stubs, props: { error: '加载失败' } })
    const btns = w.findAll('button').filter((b) => b.text().includes('重新加载'))
    expect(btns.length).toBe(1)
  })

  it('点击「重新加载」应 emit retry', async () => {
    const w = mount(StateWrapper, { ...stubs, props: { error: '加载失败' } })
    await w.find('.state-wrapper__error button').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
  })

  it('加载态渲染骨架，不渲染错误态', () => {
    const w = mount(StateWrapper, { ...stubs, props: { loading: true, error: '加载失败' } })
    expect(w.find('.state-wrapper__loading').exists()).toBe(true)
    expect(w.find('.state-wrapper__error').exists()).toBe(false)
  })

  it('空态渲染自定义文案与 #empty-action 插槽', () => {
    const w = mount(StateWrapper, {
      ...stubs,
      props: { empty: true, emptyText: '暂无标签' },
      slots: { 'empty-action': '<button>新增标签</button>' },
    })
    expect(w.text()).toContain('暂无标签')
    expect(w.text()).toContain('新增标签')
  })

  it('正常态渲染默认插槽内容', () => {
    const w = mount(StateWrapper, { ...stubs, slots: { default: '<span>表格内容</span>' } })
    expect(w.find('.state-wrapper__content').text()).toContain('表格内容')
  })
})
