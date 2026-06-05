<template>
  <div class="page-container">
    <div class="page-header">
      <h2>销售目标</h2>
      <div class="header-actions">
        <el-date-picker v-model="queryMonth" type="month" placeholder="选择月份" value-format="YYYY-MM" @change="fetchData" />
        <el-button type="primary" :icon="Check" :loading="saveLoading" @click="handleSave" style="margin-left: 12px">保存目标</el-button>
      </div>
    </div>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="tableData" stripe border>
        <el-table-column prop="real_name" label="销售姓名" width="120" />
        <el-table-column prop="dept_name" label="部门" width="120" />
        <el-table-column label="月度目标(元)" width="180" align="right">
          <template #default="{ row }">
            <el-input-number v-model="row.target_amount" :min="0" :precision="2" :controls="false" size="small" style="width: 140px" />
          </template>
        </el-table-column>
        <el-table-column prop="actual_amount" label="成交金额" width="140" align="right">
          <template #default="{ row }">¥{{ fmt(row.actual_amount) }}</template>
        </el-table-column>
        <el-table-column prop="payment_amount" label="回款金额" width="140" align="right">
          <template #default="{ row }">¥{{ fmt(row.payment_amount) }}</template>
        </el-table-column>
        <el-table-column label="达成率" width="140" align="center">
          <template #default="{ row }">
            <el-progress
              v-if="row.target_amount > 0"
              :percentage="Math.min(row.achievement_rate, 100)"
              :status="row.achievement_rate >= 100 ? 'success' : row.achievement_rate >= 60 ? '' : 'exception'"
              :stroke-width="18"
              :format="() => row.achievement_rate + '%'"
            />
            <span v-else class="text-muted">未设目标</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Check } from '@element-plus/icons-vue'
import { post } from '@/utils/request'

const loading = ref(false)
const saveLoading = ref(false)
const tableData = ref([])
const now = new Date()
const queryMonth = ref(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)

const fmt = (v) => {
  if (!v && v !== 0) return '0.00'
  return parseFloat(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })
}

const fetchData = async () => {
  loading.value = true
  try {
    const [year, month] = queryMonth.value.split('-').map(Number)
    const res = await post('/target/list', { year, month })
    if (res.code === 200) {
      tableData.value = res.data.list
    }
  } catch {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const handleSave = async () => {
  saveLoading.value = true
  try {
    const [year, month] = queryMonth.value.split('-').map(Number)
    const targets = tableData.value
      .filter(r => r.target_amount > 0)
      .map(r => ({ user_id: r.user_id, target_amount: r.target_amount }))
    const res = await post('/target/batch-set', { year, month, targets })
    if (res.code === 200) {
      ElMessage.success('保存成功')
      fetchData()
    }
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saveLoading.value = false
  }
}

onMounted(() => { fetchData() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.header-actions { display: flex; align-items: center; }
.text-muted { color: var(--color-text-tertiary); font-size: 12px; }
</style>
