<template>
  <div class="page-container">
    <div class="page-header">
      <h2>已办结</h2>
      <p class="page-desc">我已审批完成的单据（审批历史时间线）</p>
    </div>
    <el-card>
      <StateWrapper
        :loading="loading"
        :error="errorMsg"
        :empty="!loading && !errorMsg && tableData.length === 0"
        empty-text="暂无已办结单据"
        @retry="fetchList">
        <template #loading><TableSkeleton :rows="8" :cols="6" /></template>
        <el-table :data="tableData" stripe border>
          <el-table-column prop="business_type" label="类型" width="80" align="center">
            <template #default="{ row }"><el-tag :type="typeTagMap[row.business_type]" size="small">{{ typeNameMap[row.business_type] }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="business_title" label="单据编号" width="160" />
          <el-table-column prop="approval_status" label="结果" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.approval_status === 2 ? 'success' : 'danger'" size="small">{{ row.approval_status === 2 ? '已通过' : '已驳回' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="审批进度" min-width="200">
            <template #default="{ row }">
              <div v-for="(h, idx) in parseHistory(row)" :key="idx" class="history-step">
                <el-icon v-if="h.status === 'approved'" class="text-success"><SuccessFilled /></el-icon>
                <el-icon v-else-if="h.status === 'rejected'" class="text-danger"><CircleCloseFilled /></el-icon>
                <el-icon v-else style="color: var(--color-text-secondary)"><Clock /></el-icon>
                <span>{{ h.step_name }}: {{ h.approver || '-' }}</span>
                <span v-if="h.remark" class="history-remark">（{{ h.remark }}）</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="create_time" label="提交时间" width="160">
            <template #default="{ row }">{{ formatTime(row.create_time) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }"><el-button type="primary" link @click="handleView(row)">详情</el-button></template>
          </el-table-column>
        </el-table>
      </StateWrapper>
    </el-card>

    <!-- 完整详情：申请人/金额/折扣率/关联客户只读卡片/审批历史时间线 -->
    <el-dialog v-model="detailVisible" title="审批详情" width="680px">
      <div v-if="detail" v-loading="detailLoading">
        <el-descriptions :column="2" size="small" border>
          <el-descriptions-item label="申请人">{{ detail.applicant || '-' }}</el-descriptions-item>
          <el-descriptions-item label="金额">¥{{ Number(detail.amount || 0).toLocaleString() }}</el-descriptions-item>
          <el-descriptions-item label="折扣率">{{ Number(detail.discount || 0) }}%</el-descriptions-item>
          <el-descriptions-item label="业务类型">{{ typeNameMap[detail.business_type] || detail.business_type }}</el-descriptions-item>
        </el-descriptions>

        <div class="section-title">关联客户（只读）</div>
        <el-descriptions v-if="detail.customer" :column="2" size="small" border>
          <el-descriptions-item label="客户名称">{{ detail.customer.company_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="等级">{{ detail.customer.level || '-' }}</el-descriptions-item>
          <el-descriptions-item label="来源">{{ detail.customer.source || '-' }}</el-descriptions-item>
          <el-descriptions-item label="联系人">{{ detail.customer.contact_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ detail.customer.phone || '-' }}</el-descriptions-item>
        </el-descriptions>
        <el-empty v-else description="无关联客户" :image-size="60" />

        <div class="section-title">审批历史时间线</div>
        <el-timeline>
          <el-timeline-item
            v-for="(h, idx) in (detail.history || [])"
            :key="idx"
            :type="h.status === 'approved' ? 'success' : h.status === 'rejected' ? 'danger' : 'info'"
            :timestamp="formatTime(h.update_time || h.create_time)">
            {{ h.step_name }} — {{ h.approver || '-' }}
            <span v-if="h.remark" class="history-remark">（{{ h.remark }}）</span>
          </el-timeline-item>
        </el-timeline>
      </div>
      <template #footer><el-button @click="detailVisible = false">关闭</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reportError } from '@/utils/error'
import { ref, onMounted } from 'vue'
import { SuccessFilled, CircleCloseFilled, Clock } from '@element-plus/icons-vue'
import { getMyCompleted, getApprovalDetailFull } from '@/api/approval'
import { formatTime } from '@/composables/useFormat'
import StateWrapper from '@/components/common/StateWrapper.vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import { ElMessage } from 'element-plus'

const typeNameMap = { quote: '报价', contract: '合同', purchase: '采购', discount: '折扣' }
const typeTagMap = { quote: '', contract: 'success', purchase: 'warning', discount: 'danger' }

const loading = ref(true)
const errorMsg = ref('')
const tableData = ref([])
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)

const parseHistory = (row) => {
  if (!row.approval_history) return []
  if (typeof row.approval_history === 'string') {
    try { return JSON.parse(row.approval_history) } catch { return [] }
  }
  return row.approval_history
}

const fetchList = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await getMyCompleted()
    if (res.code === 200) tableData.value = res.data || []
    else { errorMsg.value = res.message || '加载已办结失败'; reportError('[completed] 获取已办结失败:', res.message) }
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || '加载已办结失败'
    reportError('[completed] 获取已办结失败:', e)
  } finally { loading.value = false }
}

const handleView = async (row) => {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    const res = await getApprovalDetailFull(row.business_type, row.business_id)
    if (res.code === 200) detail.value = res.data
    else ElMessage.error(res.message || '加载详情失败')
  } catch (e) { reportError('[completed] 获取详情失败:', e) } finally { detailLoading.value = false }
}

onMounted(() => { fetchList() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.page-desc { margin: var(--space-1) 0 0; font-size: 13px; color: var(--color-text-tertiary); }
.history-step { display: flex; align-items: center; gap: 6px; font-size: 13px; line-height: 1.8; }
.history-remark { color: var(--color-text-tertiary); font-size: 12px; }
.section-title { font-weight: 600; margin: var(--space-4) 0 var(--space-2); font-size: 14px; }
</style>
