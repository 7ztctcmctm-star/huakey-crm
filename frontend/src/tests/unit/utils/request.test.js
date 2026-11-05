import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AxiosHeaders } from 'axios'

// Mock router（request.js 内部 import router 会触发组件加载）
vi.mock('@/router', () => ({
  default: {
    push: vi.fn(),
    replace: vi.fn(),
    currentRoute: { value: { path: '/' } }
  }
}))

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() }
}))

// 需要 mock import.meta.env
vi.stubEnv('VITE_API_BASE_URL', '/api/v1')

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
    expect(request.defaults.baseURL).toBe('/api/v1')
  })

  it('应设置 withCredentials: true', () => {
    expect(request.defaults.withCredentials).toBe(true)
  })

  it('应有 60 秒超时', () => {
    expect(request.defaults.timeout).toBe(60000)
  })

  describe('[P1-22] 请求拦截器', () => {
    const runRequestInterceptor = (config) =>
      request.interceptors.request.handlers[0].fulfilled(config)

    beforeEach(() => {
      document.cookie = 'csrf-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    })

    it('写请求应注入 X-CSRF-Token（el-upload 统一上传依赖此机制）', () => {
      document.cookie = 'csrf-token=tok-1; path=/'
      const out = runRequestInterceptor({
        method: 'post',
        url: '/upload/file',
        headers: new AxiosHeaders(),
        data: {}
      })
      expect(out.headers.get('X-CSRF-Token')).toBe('tok-1')
    })

    it('GET 请求不注入 X-CSRF-Token', () => {
      document.cookie = 'csrf-token=tok-1; path=/'
      const out = runRequestInterceptor({
        method: 'get',
        url: '/customers',
        headers: new AxiosHeaders()
      })
      expect(out.headers.get('X-CSRF-Token')).toBeUndefined()
    })

    it('FormData 请求应移除默认 application/json，避免文件被序列化成 JSON', () => {
      const fd = new FormData()
      const out = runRequestInterceptor({
        method: 'post',
        url: '/upload/file',
        headers: new AxiosHeaders({ 'Content-Type': 'application/json' }),
        data: fd
      })
      expect(out.data).toBe(fd)
      expect(out.headers.get('Content-Type')).toBeUndefined()
    })

    it('[P1-24] blob 错误响应应解析 JSON 后展示后端 message', async () => {
      const { ElMessage } = await import('element-plus')
      const rejected = request.interceptors.response.handlers[0].rejected
      const blob = new Blob([JSON.stringify({ code: 400, message: '导出条件不合法' })], {
        type: 'application/json;charset=utf-8'
      })
      const error = {
        config: { url: '/log/export' },
        response: { status: 400, data: blob }
      }

      await expect(rejected(error)).rejects.toBe(error)
      expect(ElMessage.error).toHaveBeenCalledWith('导出条件不合法')
    })

    it('FormData 经实例发送到适配器仍为 FormData（客户导入预览/确认修复验证）', async () => {
      let seen
      request.defaults.adapter = async (config) => {
        seen = config
        return { data: { code: 200 }, status: 200, statusText: 'OK', headers: {}, config }
      }
      const fd = new FormData()
      fd.append('file', new File(['x'], 'x.txt', { type: 'text/plain' }))

      await request.post('/customers/import-preview', fd)

      // 修复前 axios 会因 application/json 默认头把 FormData 序列化成字符串（文件变 {}）；
      // 修复后到达适配器的仍是 FormData，由 xhr 适配器在浏览器环境生成 multipart boundary。
      expect(seen.data).toBe(fd)
      expect(seen.headers.get('Content-Type') || '').not.toContain('application/json')
    })
  })
})
