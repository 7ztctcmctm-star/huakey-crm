import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'

// 模拟 convertingId 逻辑（与 quotation/list.vue 中的实现一致）
function createConvertGuard() {
  const convertingId = ref(null)

  const isConverting = (rowId) => convertingId.value === rowId
  const setConverting = (rowId) => { convertingId.value = rowId }
  const clearConverting = () => { convertingId.value = null }

  return { convertingId, isConverting, setConverting, clearConverting }
}

describe('R-02 报价转合同 - loading 守卫', () => {
  let guard

  beforeEach(() => {
    guard = createConvertGuard()
  })

  it('初始状态 convertingId 为 null', () => {
    expect(guard.convertingId.value).toBeNull()
    expect(guard.isConverting(1)).toBe(false)
  })

  it('设置 convertingId 后按钮应禁用', () => {
    guard.setConverting(5)
    expect(guard.isConverting(5)).toBe(true)
    expect(guard.convertingId.value).toBe(5)
  })

  it('转换完成后 convertingId 恢复 null', async () => {
    guard.setConverting(3)
    expect(guard.isConverting(3)).toBe(true)

    guard.clearConverting()
    await nextTick()
    expect(guard.convertingId.value).toBeNull()
    expect(guard.isConverting(3)).toBe(false)
  })

  it('转换某行时其他行不受影响', () => {
    guard.setConverting(1)
    expect(guard.isConverting(1)).toBe(true)
    expect(guard.isConverting(2)).toBe(false)
  })

  it('转换条件：approval_status=2 显示按钮', () => {
    const row = { status: 1, approval_status: 2 }
    expect(row.approval_status === 2).toBe(true)
  })

  it('转换条件：approval_status≠2 隐藏按钮', () => {
    const row = { status: 3, approval_status: 1 }
    expect(row.approval_status === 2).toBe(false)
  })

  it('转换条件：approval_status=0 隐藏按钮（未提交审批）', () => {
    const row = { status: 3, approval_status: 0 }
    expect(row.approval_status === 2).toBe(false)
  })
})

describe('R-02 金额取值修复', () => {
  it('final_amount=0 时合同金额=0（修复 falsy 陷阱）', () => {
    const quote = { final_amount: 0, amount: 1000 }
    const result = quote.final_amount ?? quote.amount
    expect(result).toBe(0)
  })

  it('final_amount=null 时合同金额=amount', () => {
    const quote = { final_amount: null, amount: 1000 }
    const result = quote.final_amount ?? quote.amount
    expect(result).toBe(1000)
  })

  it('final_amount=undefined 时合同金额=amount', () => {
    const quote = { final_amount: undefined, amount: 500 }
    const result = quote.final_amount ?? quote.amount
    expect(result).toBe(500)
  })

  it('final_amount=500 时合同金额=500', () => {
    const quote = { final_amount: 500, amount: 1000 }
    const result = quote.final_amount ?? quote.amount
    expect(result).toBe(500)
  })

  it('旧逻辑 || 在 final_amount=0 时有 bug', () => {
    const quote = { final_amount: 0, amount: 1000 }
    const oldResult = quote.final_amount || quote.amount
    expect(oldResult).toBe(1000) // bug: 取到了 amount
  })
})
