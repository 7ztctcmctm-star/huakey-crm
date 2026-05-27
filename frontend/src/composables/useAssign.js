import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { post, get } from '@/utils/request'

export function useAssign() {
  const salesUsers = ref([])
  const assignLoading = ref(false)

  async function fetchSalesUsers() {
    try {
      const res = await get('/customer/sales-users')
      if (res?.code === 200) salesUsers.value = res.data
    } catch { /* ignore */ }
  }

  async function assignCustomer(customerId, toUserId, remark = '手动分配') {
    assignLoading.value = true
    try {
      const res = await post('/customer/assign', { customer_id: customerId, to_user_id: toUserId, remark })
      if (res?.code === 200) return true
      ElMessage.error(res?.message || '分配失败')
      return false
    } catch { ElMessage.error('分配失败'); return false }
    finally { assignLoading.value = false }
  }

  async function batchAssign(customerIds, toUserId, remark = '批量分配') {
    try {
      const res = await post('/customer/batch-assign', { customer_ids: customerIds, to_user_id: toUserId, remark })
      if (res?.code === 200) { ElMessage.success(res.message); return true }
      ElMessage.error(res?.message || '分配失败')
      return false
    } catch { ElMessage.error('批量分配失败'); return false }
  }

  return { salesUsers, assignLoading, fetchSalesUsers, assignCustomer, batchAssign }
}
