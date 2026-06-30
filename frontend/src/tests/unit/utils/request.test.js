import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock router（request.js 内部 import router 会触发组件加载）
vi.mock('@/router', () => ({
  default: {
    push: vi.fn(),
    replace: vi.fn(),
    currentRoute: { value: { path: '/' } }
  }
}))

// 需要 mock import.meta.env
vi.stubEnv('VITE_API_BASE_URL', '/api')

describe('request 工具', () => {
  let request

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    // 动态 import 以获取干净实例
    const mod = await import('@/utils/request')
    request = mod.default
  })

  it('应导出 axios 实例', () => {
    expect(request).toBeDefined()
    expect(typeof request.get).toBe('function')
    expect(typeof request.post).toBe('function')
  })

  it('应有正确的 baseURL', () => {
    expect(request.defaults.baseURL).toBe('/api')
  })

  it('应设置 withCredentials: true', () => {
    expect(request.defaults.withCredentials).toBe(true)
  })

  it('应有 60 秒超时', () => {
    expect(request.defaults.timeout).toBe(60000)
  })
})
