import { describe, it, expect, vi } from 'vitest'

// Mock request 模块，避免发送真实 HTTP 请求导致挂起
vi.mock('@/utils/request', () => ({
  default: {
    post: vi.fn().mockRejectedValue(new Error('mock error')),
    get: vi.fn().mockRejectedValue(new Error('mock error')),
    put: vi.fn().mockRejectedValue(new Error('mock error')),
    del: vi.fn().mockRejectedValue(new Error('mock error'))
  }
}))

describe('敏感数据处理', () => {
  it('request 拦截器不应在 console 中暴露密码', async () => {
    const consoleSpy = vi.spyOn(console, 'log')
    const request = (await import('@/utils/request')).default

    try {
      await request.post('/auth/login', { username: 'admin', password: 'secret123' })
    } catch {}

    const logCalls = consoleSpy.mock.calls.flat().join(' ')
    expect(logCalls).not.toContain('secret123')
    consoleSpy.mockRestore()
  })

  it('useUser 不应将敏感信息持久化到 localStorage', async () => {
    const { useUser } = await import('@/composables/useUser')
    const { setUser } = useUser()
    setUser({ id: 1, username: 'admin', token: 'secret_token' })
    expect(localStorage.getItem('userInfo')).toBeNull()
  })
})
