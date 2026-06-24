<template>
  <div class="page-container">
    <div class="page-header">
      <h2>我的待审批</h2>
      <p class="page-desc">处理需要我审批的业务单据</p>
    </div>
    <el-card>
      <div style="margin-bottom: 12px; display: flex; gap: 8px;">
        <el-button type="success" :disabled="selectedRows.length === 0" @click="handleBatchApprove">批量通过 ({{ selectedRows.length }})</el-button>
        <el-button type="danger" :disabled="selectedRows.length === 0" @click="handleBatchReject">批量驳回 ({{ selectedRows.length }})</el-button>
      </div>
      <el-table v-loading="loading" :data="tableData" stripe border @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="50" />
        <el-table-column prop="business_type_name" label="类型" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="typeTagMap[row.business_type]" size="small">{{ typeNameMap[row.business_type] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="business_title" label="单据编号" width="160" />
        <el-table-column prop="step_name" label="当前步骤" width="120" />
        <el-table-column prop="create_time" label="提交时间" width="160">
          <template #default="{ row }">{{ formatTime(row.create_time) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="success" link @click="handleApprove(row)">通过</el-button>
            <el-button type="danger" link @click="handleReject(row)">驳回</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && tableData.length === 0" description="暂无待审批" />
    </el-card>

    <!-- 审批弹窗 -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="600px">
      <el-form label-width="80px">
        <el-form-item label="审批意见">
          <el-input v-model="remark" type="textarea" :rows="3" placeholder="输入审批意见（可选）" />
        </el-form-item>
      </el-form>
      <!-- 客户历史 -->
      <div v-if="customerHistory" style="margin-top: 12px; border-top: 1px solid #f0f0f0; padding-top: 12px;">
        <div style="font-weight: 600; margin-bottom: 8px; font-size: 14px;">客户历史</div>
        <el-descriptions :column="2" size="small" border>
          <el-descriptions-item label="客户名称">{{ customerHistory.customer?.company_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="等级">{{ customerHistory.customer?.level || '-' }}</el-descriptions-item>
          <el-descriptions-item label="来源">{{ customerHistory.customer?.source || '-' }}</el-descriptions-item>
          <el-descriptions-item label="联系人">{{ customerHistory.customer?.contact_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="历史合同">{{ customerHistory.stats?.contract_count || 0 }} 笔</el-descriptions-item>
          <el-descriptions-item label="合同总额">¥{{ Number(customerHistory.stats?.total_amount || 0).toLocaleString() }}</el-descriptions-item>
          <el-descriptions-item label="回款总额">¥{{ Number(customerHistory.stats?.total_paid || 0).toLocaleString() }}</el-descriptions-item>
        </el-descriptions>
        <div v-if="customerHistory.follows?.length" style="margin-top: 8px;">
          <div style="font-size: 12px; color: #86868b; margin-bottom: 4px;">最近跟进</div>
          <div v-for="f in customerHistory.follows" :key="f.create_time" style="font-size: 12px; color: #1d1d1f; padding: 2px 0;">
            <el-tag size="small" style="margin-right: 4px;">{{ f.follow_type }}</el-tag>{{ f.content }}
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button :type="dialogType" :loading="submitLoading" @click="handleSubmit">{{ dialogType === 'success' ? '确认通过' : '确认驳回' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getMyPending, getApprovalDetail, approveRequest, rejectRequest, batchApprove, batchReject } from '@/api/tools'
import { formatTime } from '@/composables/useFormat'

const typeNameMap = { quote: '报价', contract: '合同', purchase: '采购', discount: '折扣' }
const typeTagMap = { quote: '', contract: 'success', purchase: 'warning', discount: 'info' }

const loading = ref(false)
const tableData = ref([])
const dialogVisible = ref(false)
const dialogTitle = ref('')
const dialogType = ref('success')
const submitLoading = ref(false)
const remark = ref('')
const currentRecord = ref(null)
const selectedRows = ref([])
const customerHistory = ref(null)

const fetchCustomerHistory = async (row) => {
  try {
    const res = await getApprovalDetail(row.business_type, row.business_id)
    if (res.code === 200) customerHistory.value = res.data
  } catch { customerHistory.value = null }
}

const handleSelectionChange = (rows) => { selectedRows.value = rows }

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getMyPending()
    if (res.code === 200) tableData.value = res.data
  } catch (e) { console.error('[pending] 获取待审批列表失败:', e) }
  finally { loading.value = false }
}

const handleApprove = (row) => {
  currentRecord.value = row
  dialogTitle.value = '审批通过'
  dialogType.value = 'success'
  remark.value = ''
  customerHistory.value = null
  dialogVisible.value = true
  if (row.business_type === 'quote' || row.business_type === 'contract') fetchCustomerHistory(row)
}

const handleReject = (row) => {
  currentRecord.value = row
  dialogTitle.value = '审批驳回'
  dialogType.value = 'danger'
  remark.value = ''
  customerHistory.value = null
  dialogVisible.value = true
  if (row.business_type === 'quote' || row.business_type === 'contract') fetchCustomerHistory(row)
}

const handleSubmit = async () => {
  if (!currentRecord.value) return
  submitLoading.value = true
  try {
    const res = dialogType.value === 'success'
      ? await approveRequest(currentRecord.value.id, remark.value)
      : await rejectRequest(currentRecord.value.id, remark.value)
    if (res.code === 200) {
      ElMessage.success(dialogType.value === 'success' ? '审批通过' : '已驳回')
      dialogVisible.value = false
      fetchList()
    }
  } finally { submitLoading.value = false }
}

const handleBatchApprove = () => {
  ElMessageBox.confirm(`确定批量通过选中的 ${selectedRows.value.length} 条审批？`, '批量通过', { type: 'success' }).then(async () => {
    const ids = selectedRows.value.map(r => r.id)
    const res = await batchApprove(ids)
    if (res.code === 200) { ElMessage.success(res.message); fetchList() }
  }).catch(e => console.error('[pending] 批量通过失败:', e))
}

const handleBatchReject = () => {
  ElMessageBox.prompt('请输入驳回理由', '批量驳回', { type: 'warning', inputType: 'textarea', inputPlaceholder: '输入驳回理由（可选）' }).then(async ({ value }) => {
    const ids = selectedRows.value.map(r => r.id)
    const res = await batchReject(ids, value || '批量驳回')
    if (res.code === 200) { ElMessage.success(res.message); fetchList() }
  }).catch(e => console.error('[pending] 批量驳回失败:', e))
}

onMounted(() => { fetchList() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.page-desc { margin: var(--space-1) 0 0; font-size: 13px; color: var(--color-text-tertiary); }
</style>
