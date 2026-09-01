/**
 * Follow Plan 前端 API 测试 (Phase 5.6)
 * 验证 customer.js 的 plan API 函数与请求路径
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock request (vi.mock 提升, 用工厂内联避免 hoisting 问题)
vi.mock('@/utils/request', () => {
  const get = vi.fn()
  const post = vi.fn()
  return { default: { get, post } }
})

import { getFollowUpPlans, addFollowUpPlan, completeFollowUpPlan, cancelFollowUpPlan } from '@/api/customer'
import request from '@/utils/request'
const mockPost = request.post
const mockGet = request.get

describe('Follow Plan API', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('1. getFollowUpPlans 调用正确路径', () => {
    getFollowUpPlans({ customer_id: 100 })
    expect(mockPost).toHaveBeenCalledWith('/follow-up/plan/list', { customer_id: 100 })
  })

  it('2. addFollowUpPlan 调用正确路径', () => {
    addFollowUpPlan({ customer_id: 100, opportunity_id: 200, plan_time: '2026-08-10', plan_content: 'test' })
    expect(mockPost).toHaveBeenCalledWith('/follow-up/plan/add', expect.objectContaining({ opportunity_id: 200 }))
  })

  it('3. completeFollowUpPlan 调用正确路径', () => {
    completeFollowUpPlan({ id: 1, content: '完成' })
    expect(mockPost).toHaveBeenCalledWith('/follow-up/plan/complete', { id: 1, content: '完成' })
  })

  it('4. cancelFollowUpPlan 调用正确路径', () => {
    cancelFollowUpPlan({ id: 1 })
    expect(mockPost).toHaveBeenCalledWith('/follow-up/plan/cancel', { id: 1 })
  })
})
