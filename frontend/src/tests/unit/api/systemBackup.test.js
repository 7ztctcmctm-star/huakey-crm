import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/request', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ code: 200, data: { confirm_code: 'abc123' } }),
    post: vi.fn().mockResolvedValue({ code: 200, data: null })
  }
}))

import request from '@/utils/request'

describe('备份恢复 API 契约（P0-13）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getRestoreConfirmCode 应 GET /backup/confirm-code/:id', async () => {
    const { getRestoreConfirmCode } = await import('@/api/system')
    await getRestoreConfirmCode(7)
    expect(request.get).toHaveBeenCalledWith('/backup/confirm-code/7')
  })

  it('restoreBackup 必须携带 confirm_code（后端 Joi required，缺了必 400）', async () => {
    const { restoreBackup } = await import('@/api/system')
    await restoreBackup(7, 'abc123')
    expect(request.post).toHaveBeenCalledWith('/backup/restore', {
      id: 7,
      confirm_code: 'abc123'
    })
  })
})
