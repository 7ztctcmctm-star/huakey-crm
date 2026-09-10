/**
 * 客户转移待办 —— 「同意 / 拒绝」的共用逻辑
 *
 * 使用方（两处，避免逻辑复制漂移）：
 *   · frontend/src/components/layout/NotificationBadge.vue  —— 顶栏铃铛面板
 *   · frontend/src/views/notification/index.vue             —— 通知中心页
 *
 * 业务规则（委托人 2026-09-10 确认）：
 *   · 双方同意制：只有接收人本人可处理；同意后客户归属才变更
 *   · 申请不可撤回；超过 3 天自动失效（后端定时任务置 expired）
 *   · 因此这里对「已过期」的申请不做兜底 —— 后端会拒收，
 *     列表接口也只返回未过期的申请，不制造点了没反应的死按钮
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import { acceptTransfer, rejectTransfer } from '@/api/pool'
import { reportError } from '@/utils/error'

/** 待办条目的展示名：铃铛面板用 title，通知中心用 company_name */
const displayName = (item) => item?.company_name || item?.title || '该客户'

/**
 * 同意接收客户转移
 * @returns {Promise<boolean>} 是否真的处理成功（用户取消 / 失败均返回 false）
 */
export async function acceptTransferItem(item) {
  try {
    await ElMessageBox.confirm(
      `接收后「${displayName(item)}」的负责人将变更为你，原负责人会收到通知。`,
      '确认接收客户',
      { type: 'warning', confirmButtonText: '确认接收', cancelButtonText: '取消' }
    )
  } catch {
    return false // 用户取消，不是错误
  }

  try {
    const res = await acceptTransfer(item.id)
    if (res?.code === 200) {
      ElMessage.success('已接收该客户')
      return true
    }
    ElMessage.error(res?.message || '接收失败')
    return false
  } catch (error) {
    ElMessage.error('接收失败')
    reportError('[useTransferTodo] 接收客户转移失败:', error)
    return false
  }
}

/**
 * 拒绝客户转移（可填拒绝理由，会通知发起人）
 * @returns {Promise<boolean>} 是否真的处理成功
 */
export async function rejectTransferItem(item) {
  let remark = ''
  try {
    const { value } = await ElMessageBox.prompt(
      `拒绝后「${displayName(item)}」仍归原负责人。可填写拒绝理由，该理由会通知发起人。`,
      '拒绝转移申请',
      {
        confirmButtonText: '确认拒绝',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputPlaceholder: '拒绝理由（选填）',
        inputValidator: () => true // 允许留空
      }
    )
    remark = value || ''
  } catch {
    return false // 用户取消，不是错误
  }

  try {
    const res = await rejectTransfer(item.id, remark)
    if (res?.code === 200) {
      ElMessage.success('已拒绝该转移申请')
      return true
    }
    ElMessage.error(res?.message || '拒绝失败')
    return false
  } catch (error) {
    ElMessage.error('拒绝失败')
    reportError('[useTransferTodo] 拒绝客户转移失败:', error)
    return false
  }
}
