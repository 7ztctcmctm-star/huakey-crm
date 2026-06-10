<template>
  <div class="page-container">
    <div class="page-header">
      <h2>我的待审批</h2>
      <p class="page-desc">处理需要我审批的业务单据</p>
    </div>
    <el-card>
      <el-table v-loading="loading" :data="tableData" stripe border>
        <el-table-column prop="workflow_name" label="流程" min-width="140" />
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
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="450px">
      <el-form label-width="80px">
        <el-form-item label="审批意见">
          <el-input v-model="remark" type="textarea" :rows="3" placeholder="输入审批意见（可选）" />
        </el-form-item>
      </el-form>
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
import request from '@/utils/request'
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

const fetchList = async () => {
  loading.value = true
  try {
    const res = await request.get('/approval/my-pending')
    if (res.code === 200) tableData.value = res.data
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const handleApprove = (row) => {
  currentRecord.value = row
  dialogTitle.value = '审批通过'
  dialogType.value = 'success'
  remark.value = ''
  dialogVisible.value = true
}

const handleReject = (row) => {
  currentRecord.value = row
  dialogTitle.value = '审批驳回'
  dialogType.value = 'danger'
  remark.value = ''
  dialogVisible.value = true
}

const handleSubmit = async () => {
  if (!currentRecord.value) return
  submitLoading.value = true
  try {
    const url = dialogType.value === 'success'
      ? `/approval/approve/${currentRecord.value.id}`
      : `/approval/reject/${currentRecord.value.id}`
    const res = await request.post(url, { remark: remark.value })
    if (res.code === 200) {
      ElMessage.success(dialogType.value === 'success' ? '审批通过' : '已驳回')
      dialogVisible.value = false
      fetchList()
    }
  } finally { submitLoading.value = false }
}

onMounted(() => { fetchList() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.page-desc { margin: var(--space-1) 0 0; font-size: 13px; color: var(--color-text-tertiary); }
</style>
