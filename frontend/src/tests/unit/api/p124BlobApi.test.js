import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

vi.mock('@/utils/request', () => ({
  default: {
    get: vi.fn().mockResolvedValue(new Blob(['x'])),
    post: vi.fn().mockResolvedValue({ code: 200 }),
    put: vi.fn(),
    delete: vi.fn()
  }
}))

import request from '@/utils/request'
import { getCustomerTemplate, importPreview, importConfirm } from '@/api/customer'
import { exportLog } from '@/api/system'

describe('导出/模板下载按 blob 接收（P1-24）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getCustomerTemplate 必须声明 responseType: blob', async () => {
    await getCustomerTemplate()
    expect(request.get).toHaveBeenCalledWith('/customers/template', { responseType: 'blob' })
  })

  it('exportLog 必须声明 responseType: blob', async () => {
    const params = { module: 'customer' }
    await exportLog(params)
    expect(request.post).toHaveBeenCalledWith('/log/export', params, { responseType: 'blob' })
  })

  it('客户导入预览/确认应透传 axios config（进度/取消）', async () => {
    const fd = new FormData()
    const config = { signal: new AbortController().signal, onUploadProgress: vi.fn() }
    await importPreview(fd, config)
    await importConfirm(fd, config)
    expect(request.post).toHaveBeenNthCalledWith(1, '/customers/import-preview', fd, config)
    expect(request.post).toHaveBeenNthCalledWith(2, '/customers/import-confirm', fd, config)
  })

  it('下载组件改用统一下载函数，不再直接 createObjectURL(res)', () => {
    const importSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CustomerImport.vue'), 'utf8')
    const logSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/views/system/log.vue'), 'utf8')

    expect(importSrc).toContain("downloadBlob(res, 'customer_import_template.xlsx')")
    expect(importSrc).not.toContain('URL.createObjectURL(res)')
    expect(logSrc).toContain('await downloadBlob(res,')
  })
})
