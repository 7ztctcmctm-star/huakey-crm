import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/utils/request', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ code: 200, data: {} }),
    post: vi.fn().mockResolvedValue({ code: 200, data: {} }),
    put: vi.fn().mockResolvedValue({ code: 200, data: {} }),
    delete: vi.fn().mockResolvedValue({ code: 200, data: {} })
  }
}))

import request from '@/utils/request'
import { newIdempotencyKey, withIdempotencyKey } from '@/utils/idempotency'

/** 取出某次 post 调用里的 Idempotency-Key 请求头 */
const headerOf = (callIndex, verb = 'post') => {
  const cfg = request[verb].mock.calls[callIndex].find(
    (a) => a && typeof a === 'object' && a.headers
  )
  return cfg?.headers?.['Idempotency-Key']
}

describe('utils/idempotency · 幂等键生成', () => {
  it('newIdempotencyKey 应带业务前缀且长度不超过后端限定的 64', () => {
    const key = newIdempotencyKey('claim')
    expect(key.startsWith('claim-')).toBe(true)
    expect(key.length).toBeLessThanOrEqual(64)
  })

  it('连续生成两次必须不同（否则重试会命中错误的记录）', () => {
    const a = newIdempotencyKey()
    const b = newIdempotencyKey()
    expect(a).not.toBe(b)
  })

  it('withIdempotencyKey 不修改入参，且保留 responseType 等既有配置', () => {
    const original = { responseType: 'blob', headers: { 'X-Test': '1' } }
    const merged = withIdempotencyKey(original, 'x')
    expect(original.headers['Idempotency-Key']).toBeUndefined()
    expect(merged.responseType).toBe('blob')
    expect(merged.headers['X-Test']).toBe('1')
    expect(typeof merged.headers['Idempotency-Key']).toBe('string')
  })
})

describe('写接口应发送 Idempotency-Key', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.clearAllMocks())

  it('quoteToContract → POST /quote/to-contract 带幂等键', async () => {
    const { quoteToContract } = await import('@/api/quotation')
    await quoteToContract(11)
    expect(request.post).toHaveBeenCalledWith(
      '/quote/to-contract',
      { id: 11 },
      expect.objectContaining({ headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }) })
    )
    expect(headerOf(0)).toBeTruthy()
  })

  it('claimPoolCustomer → POST /pool/claim 带幂等键', async () => {
    const { claimPoolCustomer } = await import('@/api/pool')
    await claimPoolCustomer(22)
    expect(headerOf(0)).toMatch(/^claim-/)
  })

  it('createTransfer / acceptTransfer / rejectTransfer 均带幂等键且互不复用', async () => {
    const pool = await import('@/api/pool')
    await pool.createTransfer({ customer_ids: [1], target_user_id: 2 })
    await pool.acceptTransfer(33)
    await pool.rejectTransfer(33, '不合适')

    const keys = [0, 1, 2].map((i) => headerOf(i))
    expect(keys.every(Boolean)).toBe(true)
    expect(new Set(keys).size).toBe(3)
    expect(keys[0]).toMatch(/^transfer-/)
  })

  it('submitPurchaseRequest 无 body，幂等键只能落在请求头的第三参数上', async () => {
    const { submitPurchaseRequest } = await import('@/api/purchaseRequest')
    await submitPurchaseRequest(44)
    const [, data, config] = request.post.mock.calls[0]
    expect(data).toBeNull()
    expect(config.headers['Idempotency-Key']).toMatch(/^pr-submit-/)
  })

  it('只读/非幂等写接口不应被误加幂等键（避免无意义膨胀 crm_idempotency）', async () => {
    const pool = await import('@/api/pool')
    await pool.getPoolList({ page: 1 })
    await pool.releaseToPool(55, '不跟了')
    expect(headerOf(0)).toBeUndefined()
    expect(headerOf(1)).toBeUndefined()
  })
})
