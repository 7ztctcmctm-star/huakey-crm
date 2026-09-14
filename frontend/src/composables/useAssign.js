import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { post, get } from '@/utils/request'
import { reportError, reportWarn } from '@/utils/error'

// [2026-09-14 阶段3] 本文件为历史遗留（全仓零引用），路径已随命名空间归拢切至 /customers/*。
// 注意：其能力与 @/api/customer.js 的 getSalesUsers/assignCustomer/batchAssignCustomer 重复，
// 建议随 v2 一并删除，统一走 @/api/customer。详见 docs/crm-customer-api-port-map.md §六。

export function useAssign() {
  const salesUsers = ref([])
  const assignLoading = ref(false)

  async function fetchSalesUsers() {
    try {
      const res = await get('/customers/sales-users')
      if (res?.code === 200) salesUsers.value = res.data
    } catch (e) { reportError('[useAssign] 获取销售人员失败:', e) }
  }

  async function assignCustomer(customerId, toUserId, remark = '手动分配') {
    assignLoading.value = true
    try {
      const res = await post('/customers/assign', { customer_id: customerId, to_user_id: toUserId, remark })
      if (res?.code === 200) return true
      ElMessage.error(res?.message || '分配失败')
      return false
    } catch { ElMessage.error('分配失败'); return false }
    finally { assignLoading.value = false }
  }

  async function batchAssign(customerIds, toUserId, remark = '批量分配') {
    try {
      const res = await post('/customers/batch-assign', { customer_ids: customerIds, to_user_id: toUserId, remark })
      if (res?.code === 200) { ElMessage.success(res.message); return true }
      ElMessage.error(res?.message || '分配失败')
      return false
    } catch { ElMessage.error('批量分配失败'); return false }
  }

  return { salesUsers, assignLoading, fetchSalesUsers, assignCustomer, batchAssign }
}
