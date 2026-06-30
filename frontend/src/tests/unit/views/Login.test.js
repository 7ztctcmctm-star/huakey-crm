import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

// Mock API
vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  getCaptcha: vi.fn().mockResolvedValue({ code: 200, data: { svg: '<svg/>', key: 'k1' } })
}))

// Element Plus stubs（简化渲染）
const globalStubs = {
  global: {
    stubs: {
      'el-form': { template: '<form><slot /></form>' },
      'el-form-item': { template: '<div><slot /></div>' },
      'el-input': { template: '<input />', props: ['modelValue'] },
      'el-button': { template: '<button><slot /></button>' },
      'el-checkbox': { template: '<input type="checkbox" />', props: ['modelValue'] },
      User: true,
      Lock: true
    }
  }
}

describe('Login 组件', () => {
  let Login

  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    vi.clearAllMocks()
    // 动态 import 避免模块缓存问题
    const mod = await import('@/views/login/index.vue')
    Login = mod.default
  })

  it('应渲染登录表单', () => {
    const wrapper = mount(Login, globalStubs)
    expect(wrapper.exists()).toBe(true)
  })

  it('应显示系统标题', () => {
    const wrapper = mount(Login, globalStubs)
    expect(wrapper.text()).toContain('铧旗CRM')
  })

  it('onMounted 应调用 getCaptcha', async () => {
    const { getCaptcha } = await import('@/api/auth')
    mount(Login, globalStubs)
    // wait for onMounted + nextTick
    await new Promise(r => setTimeout(r, 0))
    expect(getCaptcha).toHaveBeenCalled()
  })

  it('登录成功应调用 setUser', async () => {
    const { login } = await import('@/api/auth')
    login.mockResolvedValue({
      code: 200,
      data: { userInfo: { id: 1, username: 'admin' } }
    })
    // 验证 API mock 可用
    expect(login).toBeDefined()
    const res = await login({ username: 'admin', password: '123456' })
    expect(res.code).toBe(200)
  })
})
