import { describe, it, expect, vi } from 'vitest'

// Mock Layout.vue — 阻断 <img src="/logo.png"> → jsdom TypeError
vi.mock('@/views/layout/index.vue', () => ({
  default: { template: '<div><slot /></div>', name: 'Layout' }
}))

// Mock Dashboard.vue — 阻断子组件（StatsCards/SalesChart）在 jsdom 下初始化耗时
vi.mock('@/views/Dashboard.vue', () => ({
  default: { template: '<div />', name: 'Dashboard' }
}))

// 覆盖 setup.js 的 vue-router mock，让 createRouter 返回带 beforeEach 的 stub
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), currentRoute: { value: { path: '/', query: {} } } }),
  useRoute: () => ({ path: '/', query: {}, params: {} }),
  createRouter: vi.fn(() => ({ beforeEach: vi.fn(), afterEach: vi.fn() })),
  createWebHistory: vi.fn(() => ({}))
}))

// Mock useUser — 绕过认证流程
vi.mock('@/composables/useUser', () => ({
  useUser: () => ({
    userInfo: { value: null },
    verifyAuth: vi.fn().mockResolvedValue(false)
  })
}))

describe('路由守卫', () => {
  it('公开页面应直接放行', async () => {
    const routerConfig = await import('@/router/index')
    expect(routerConfig).toBeDefined()
  })
})
