import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/request', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ code: 200, data: [] }),
    post: vi.fn().mockResolvedValue({ code: 200, data: null }),
    put: vi.fn().mockResolvedValue({ code: 200, data: null }),
    delete: vi.fn().mockResolvedValue({ code: 200, data: null })
  }
}))

import request from '@/utils/request'
import {
  updateWorkflow,
  executeWorkflow,
  getWorkflowLogs,
  updateSmartReminder,
  runSmartReminder,
  updateAutomationAssignRule,
  applyAutomationAssignRule
} from '@/api/automation'
import { updateSurveyTemplate } from '@/api/survey'
import { updateFollowupTemplate } from '@/api/customer'
import { markNotificationRead } from '@/api/reminder'
import { getFinanceAnalysis } from '@/api/hr'
import { getRoleList, getDeptList } from '@/api/system'

/**
 * 前端 API 封装 × 后端 Joi schema 契约对齐回归（2026-10-26）
 * 背景：validate 使用 stripUnknown=true，未声明字段会被静默剥离；
 * 编辑流程误用 POST 新建端点时 id 被丢弃 → 重复创建。
 */
describe('API 契约对齐（编辑走 PUT / 字段名 / 死参数）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updateWorkflow 必须 PUT /automation/workflows/:id', async () => {
    await updateWorkflow(9, { name: 'x' })
    expect(request.put).toHaveBeenCalledWith('/automation/workflows/9', { name: 'x' })
  })

  it('executeWorkflow 应原样透传 { rule_id, target_type, target_id }', async () => {
    const payload = { rule_id: 3, target_type: 'customer', target_id: 42 }
    await executeWorkflow(payload)
    expect(request.post).toHaveBeenCalledWith('/automation/workflows/execute', payload)
  })

  it('getWorkflowLogs 查询参数必须是 rule_id', async () => {
    await getWorkflowLogs(5)
    expect(request.get).toHaveBeenCalledWith('/automation/workflows/logs', { params: { rule_id: 5 } })
  })

  it('updateSmartReminder 必须 PUT /automation/smart-reminders/:id', async () => {
    await updateSmartReminder(6, { name: 'r' })
    expect(request.put).toHaveBeenCalledWith('/automation/smart-reminders/6', { name: 'r' })
  })

  it('runSmartReminder 发送空 body（后端 run 端点不接收 id）', async () => {
    await runSmartReminder()
    expect(request.post).toHaveBeenCalledWith('/automation/smart-reminders/run')
  })

  it('updateAutomationAssignRule 必须 PUT /automation/assign-rules/:id', async () => {
    await updateAutomationAssignRule(7, { rule_name: 'r' })
    expect(request.put).toHaveBeenCalledWith('/automation/assign-rules/7', { rule_name: 'r' })
  })

  it('applyAutomationAssignRule 必须发送 customer_ids 数组', async () => {
    await applyAutomationAssignRule([1, 2])
    expect(request.post).toHaveBeenCalledWith('/automation/assign-rules/apply', { customer_ids: [1, 2] })
  })

  it('updateSurveyTemplate 必须 PUT /survey/templates/:id', async () => {
    await updateSurveyTemplate(8, { name: 't' })
    expect(request.put).toHaveBeenCalledWith('/survey/templates/8', { name: 't' })
  })

  it('updateFollowupTemplate 必须 PUT /followup-templates/:id', async () => {
    await updateFollowupTemplate(4, { name: 't' })
    expect(request.put).toHaveBeenCalledWith('/followup-templates/4', { name: 't' })
  })

  it('markNotificationRead 字段名必须是 notification_id', async () => {
    await markNotificationRead(11)
    expect(request.post).toHaveBeenCalledWith('/reminder/notification-read', { notification_id: 11 })
  })

  it('getFinanceAnalysis 应透传 start_date/end_date', async () => {
    const params = { start_date: '2026-01-01', end_date: '2026-01-31' }
    await getFinanceAnalysis(params)
    expect(request.get).toHaveBeenCalledWith('/finance/analysis', { params })
  })

  it('getRoleList / getDeptList 不发送后端忽略的分页参数', async () => {
    await getRoleList()
    await getDeptList()
    expect(request.post).toHaveBeenNthCalledWith(1, '/role/list', {})
    expect(request.post).toHaveBeenNthCalledWith(2, '/dept/list', {})
  })
})
