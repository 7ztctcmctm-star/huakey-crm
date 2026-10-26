import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'

// [P1-22] el-upload 统一上传：走 axios 封装，因此自动获得 CSRF 头与 Cookie 认证。
vi.mock('@/utils/request', () => ({
  default: { post: vi.fn() }
}))

import request from '@/utils/request'
import { uploadByRequest } from '@/utils/upload'
import { getCsrfToken } from '@/utils/csrf'

describe('uploadByRequest（P1-22）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    request.post.mockResolvedValue({ code: 200, data: [{ id: 1 }] })
  })

  const makeOptions = () => ({
    action: '/api/v1/upload/file',
    filename: 'file',
    file: new File(['hello'], 'a.txt', { type: 'text/plain' }),
    data: { business_type: 'follow_up', business_id: 7 },
    onProgress: vi.fn()
  })

  it('以 multipart FormData POST 到 action，并携带 data 字段', async () => {
    const options = makeOptions()
    const result = await uploadByRequest(options)

    expect(request.post).toHaveBeenCalledTimes(1)
    const [url, body, config] = request.post.mock.calls[0]
    expect(url).toBe('/api/v1/upload/file')
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('file')).toBe(options.file)
    expect(body.get('business_type')).toBe('follow_up')
    expect(body.get('business_id')).toBe('7')
    // action 已含 /api/v1，必须禁用实例 baseURL 防止重复拼接
    expect(config.baseURL).toBe('')
    expect(config.timeout).toBe(0)
    // 返回 Promise，Element Plus 据此调用 onSuccess
    expect(result).toEqual({ code: 200, data: [{ id: 1 }] })
  })

  it('忽略 undefined/null 的附加字段', async () => {
    const options = makeOptions()
    options.data = { business_type: 'service_order', business_id: null, other: undefined }
    await uploadByRequest(options)

    const body = request.post.mock.calls[0][1]
    expect(body.get('business_type')).toBe('service_order')
    expect(body.has('business_id')).toBe(false)
    expect(body.has('other')).toBe(false)
  })

  it('上传进度通过 options.onProgress 上报百分比', async () => {
    const options = makeOptions()
    await uploadByRequest(options)

    const config = request.post.mock.calls[0][2]
    config.onUploadProgress({ loaded: 50, total: 200 })
    expect(options.onProgress).toHaveBeenCalledWith({ percent: 25 })

    // total 未知时不应上报 NaN
    config.onUploadProgress({ loaded: 10, total: 0 })
    expect(options.onProgress).toHaveBeenCalledTimes(1)
  })

  it('上传失败时 Promise 拒绝（交给 Element Plus 触发 onError）', async () => {
    const failure = new Error('403')
    request.post.mockRejectedValue(failure)
    await expect(uploadByRequest(makeOptions())).rejects.toBe(failure)
  })
})

describe('三处直传已接入 axios 封装（P1-22）', () => {
  const targets = [
    ['回款导入', '../../../views/payment/index.vue'],
    ['客户跟进附件', '../../../views/customer/Detail.vue'],
    ['服务工单附件', '../../../views/service/index.vue']
  ]

  it.each(targets)('%s 使用 :http-request 而非裸 :action 直传', (_name, relativePath) => {
    const source = fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    expect(source).toContain(":http-request=\"uploadByRequest\"")
    expect(source).toContain("import { uploadByRequest } from '@/utils/upload'")
  })
})

describe('getCsrfToken（P1-22）', () => {
  beforeEach(() => {
    document.cookie = 'csrf-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })

  it('从 cookie 读取 token', () => {
    document.cookie = 'csrf-token=abc123; path=/'
    expect(getCsrfToken()).toBe('abc123')
  })

  it('cookie 不存在时返回 null', () => {
    expect(getCsrfToken()).toBeNull()
  })
})
