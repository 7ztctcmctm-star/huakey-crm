<template>
  <div class="page-container">
    <div class="page-header">
      <h2>我的审批</h2>
      <p class="page-desc">查看我提交的审批记录及状态</p>
    </div>
    <el-card>
      <el-table v-loading="loading" :data="tableData" stripe border>
        <el-table-column prop="business_type" label="类型" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="typeTagMap[row.business_type]" size="small">{{ typeNameMap[row.business_type] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="business_title" label="单据编号" width="160" />
        <el-table-column prop="approval_status" label="审批状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTypeMap[row.approval_status]" size="small">{{ statusNameMap[row.approval_status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审批进度" min-width="200">
          <template #default="{ row }">
            <template v-if="row.approval_history && row.approval_history.length > 0">
              <div v-for="(h, idx) in row.approval_history" :key="idx" class="history-step">
                <el-icon v-if="h.status === 'approved'" style="color:#67C23A"><SuccessFilled /></el-icon>
                <el-icon v-else-if="h.status === 'rejected'" style="color:#F56C6C"><CircleCloseFilled /></el-icon>
                <el-icon v-else style="color:#909399"><Clock /></el-icon>
                <span>{{ h.step_name }}: {{ h.approver || '-' }}</span>
                <span v-if="h.remark" class="history-remark">（{{ h.remark }}）</span>
              </div>
            </template>
            <span v-else class="no-history">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="create_time" label="提交时间" width="160">
          <template #default="{ row }">{{ formatTime(row.create_time) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && tableData.length === 0" description="暂无审批记录" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { SuccessFilled, CircleCloseFilled, Clock } from '@element-plus/icons-vue'
import { getMySubmitted } from '@/api/approval'
import { formatTime } from '@/composables/useFormat'

const typeNameMap = { quote: '报价', contract: '合同', purchase: '采购', discount: '折扣' }
const typeTagMap = { quote: '', contract: 'success', purchase: 'warning', discount: 'info' }
const statusNameMap = { 1: '待审批', 2: '已通过', 3: '已拒绝', pending: '待审批', approved: '已通过', rejected: '已拒绝' }
const statusTypeMap = { 1: 'warning', 2: 'success', 3: 'danger', pending: 'warning', approved: 'success', rejected: 'danger' }

const loading = ref(false)
const tableData = ref([])

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getMySubmitted()
    if (res.code === 200) {
      tableData.value = (res.data || []).map(row => {
        if (typeof row.approval_history === 'string') {
          try { row.approval_history = JSON.parse(row.approval_history) } catch { row.approval_history = [] }
        }
        return row
      })
    }
  } catch (e) { console.error('[submitted] 获取已提交列表失败:', e) }
  finally { loading.value = false }
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
.no-history { color: var(--color-text-tertiary); }
</style>
