import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadBlob } from '@/utils/download'

describe('downloadBlob（P1-24）', () => {
  let createObjectURL
  let revokeObjectURL
  let clickSpy
  let clickedAnchor

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url')
    revokeObjectURL = vi.fn()
    globalThis.URL.createObjectURL = createObjectURL
    globalThis.URL.revokeObjectURL = revokeObjectURL
    clickedAnchor = null
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      clickedAnchor = this
    })
    document.body.innerHTML = ''
  })

  afterEach(() => {
    clickSpy.mockRestore()
  })

  it('正常 Blob 应触发下载并释放 object URL', async () => {
    const blob = new Blob(['xlsx-bytes'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })

    await downloadBlob(blob, '客户列表.xlsx')

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(clickedAnchor).not.toBeNull()
    expect(clickedAnchor.download).toBe('客户列表.xlsx')
    expect(clickedAnchor.href).toContain('blob:mock-url')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    // 链接节点不应残留在 body
    expect(document.body.querySelector('a')).toBeNull()
  })

  it('JSON 错误体应抛出后端 message，且不触发下载', async () => {
    const blob = new Blob([JSON.stringify({ code: 403, message: '无导出权限' })], {
      type: 'application/json;charset=utf-8'
    })

    await expect(downloadBlob(blob, 'x.xlsx')).rejects.toMatchObject({
      message: '无导出权限',
      isDownloadError: true
    })
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('JSON 错误体无 message 时使用兜底文案', async () => {
    const blob = new Blob(['{"code":500}'], { type: 'application/json' })
    await expect(downloadBlob(blob, 'x.xlsx')).rejects.toThrow('下载失败')
  })

  it('非 Blob 数据（旧调用方式）应自动包装后下载', async () => {
    await downloadBlob('plain-bytes', 'a.bin', 'application/octet-stream')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickedAnchor.download).toBe('a.bin')
  })
})
