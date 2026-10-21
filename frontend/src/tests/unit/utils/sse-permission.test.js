import { describe, it, expect, vi, beforeEach } from 'vitest'

// [C2 2026-10-21] SSE permission-changed → 强制刷新权限缓存 的单测。
// 覆盖：收到权限变更事件触发刷新；普通通知不触发；坏 JSON 不崩溃。
//
// 注意：只 mock 底层 request，**不 mock useUser 本体** —— 本用例的要旨正是验证
// sse.js → useUser.refreshPermissions（模块级命名导出）→ /auth/me 的真实链路
// （曾因整模块 mock 掩盖了命名导出缺失，靠生产构建才发现，故在此锁定）。

vi.mock('@/utils/request', () => ({
  default: { get: vi.fn().mockResolvedValue({ code: 200, data: { id: 1, permissions: [] } }) }
}))

// Mock EventSource（jsdom 无此实现）：捕获实例供测试手动派发消息
class MockEventSource {
  constructor(url) {
    MockEventSource.instances.push(this)
    this.url = url
    this.onopen = null
    this.onmessage = null
    this.onerror = null
    this.closed = false
  }
  close() { this.closed = true }
}
MockEventSource.instances = []
vi.stubGlobal('EventSource', MockEventSource)

describe('utils/sse 权限变更推送', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    MockEventSource.instances = []
  })

  async function getSse() {
    return import('@/utils/sse')
  }

  it('收到 type=permission-changed 应经真实链路刷新 /auth/me', async () => {
    const { connectSSE } = await getSse()
    const { default: request } = await import('@/utils/request')

    connectSSE({ onMessage: vi.fn() })
    expect(MockEventSource.instances).toHaveLength(1)
    const es = MockEventSource.instances[0]

    es.onmessage({ data: JSON.stringify({ type: 'permission-changed', action: 'refresh' }) })
    // refreshPermissions → verifyAuth → GET /auth/me
    expect(request.get).toHaveBeenCalledWith('/auth/me')

    // 普通通知不应触发刷新
    request.get.mockClear()
    es.onmessage({ data: JSON.stringify({ type: 'notification', data: { id: 1 } }) })
    expect(request.get).not.toHaveBeenCalled()
  })

  it('无 type 或异常 JSON 不应触发刷新且不抛出', async () => {
    const { connectSSE } = await getSse()
    const { default: request } = await import('@/utils/request')

    connectSSE({ onMessage: vi.fn() })
    const es = MockEventSource.instances[0]

    expect(() => es.onmessage({ data: 'not-json' })).not.toThrow()
    expect(() => es.onmessage({ data: JSON.stringify({ foo: 'bar' }) })).not.toThrow()
    expect(request.get).not.toHaveBeenCalled()
  })
})
