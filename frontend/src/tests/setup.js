import { config } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { vi, beforeEach } from 'vitest'

// Mock Element Plus（避�?jsdom 下渲染报错）
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm'), alert: vi.fn() },
    ElNotification: { success: vi.fn(), error: vi.fn() }
  }
})

// Mock Element Plus 图标（避�?auto-import 解析失败�?
vi.mock('@element-plus/icons-vue', () => ({
  User: { name: 'User', template: '<span />' },
  Lock: { name: 'Lock', template: '<span />' },
  Search: { name: 'Search', template: '<span />' },
  Plus: { name: 'Plus', template: '<span />' },
  Edit: { name: 'Edit', template: '<span />' },
  Delete: { name: 'Delete', template: '<span />' },
  ArrowDown: { name: 'ArrowDown', template: '<span />' },
  ArrowRight: { name: 'ArrowRight', template: '<span />' },
  Menu: { name: 'Menu', template: '<span />' },
  Setting: { name: 'Setting', template: '<span />' },
  Bell: { name: 'Bell', template: '<span />' },
  Refresh: { name: 'Refresh', template: '<span />' },
  Download: { name: 'Download', template: '<span />' },
  Upload: { name: 'Upload', template: '<span />' },
  View: { name: 'View', template: '<span />' },
  Close: { name: 'Close', template: '<span />' }
}))

// Mock vue-router（组件测试不需要真实路由）
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), currentRoute: { value: { path: '/', query: {} } } }),
  useRoute: () => ({ path: '/', query: {}, params: {} }),
  createRouter: vi.fn(() => ({ beforeEach: vi.fn(), afterEach: vi.fn() })),
  createWebHistory: vi.fn()
}))

// Mock localStorage
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: vi.fn(key => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value }),
    removeItem: vi.fn(key => { delete store[key] }),
    clear: vi.fn(() => { store = {} })
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock IntersectionObserver（ECharts 等组件需要）
global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }

// 每个测试前重�?pinia
beforeEach(() => {
  setActivePinia(createPinia())
  localStorageMock.clear()
})

// Mock Layout.vue������� router �� Layout �� logo.png �� jsdom TypeError
vi.mock('@/views/layout/index.vue', () => ({
  default: { template: '<div><slot /></div>', name: 'Layout' }
}))

