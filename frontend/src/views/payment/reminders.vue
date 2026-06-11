<template>
  <div class="page-container">
    <div class="page-header">
      <h2>回款提醒</h2>
      <el-button type="primary" :loading="generating" @click="handleGenerate">生成提醒</el-button>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card" v-for="s in statCards" :key="s.key">
        <div class="stat-value" :class="s.class">{{ s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="status-tabs">
      <el-check-tag :checked="!filterStatus" @change="filterStatus='';fetchList()">全部</el-check-tag>
      <el-check-tag :checked="filterStatus==='pending'" @change="filterStatus='pending';fetchList()">待处理</el-check-tag>
      <el-check-tag :checked="filterStatus==='acknowledged'" @change="filterStatus='acknowledged';fetchList()">已确认</el-check-tag>
    </div>

    <!-- 列表 -->
    <el-card shadow="never">
      <el-table :data="list" stripe border v-loading="loading">
        <el-table-column prop="customer_name" label="客户名称" min-width="150" show-overflow-tooltip />
        <el-table-column prop="contract_no" label="合同编号" width="150" />
        <el-table-column prop="amount" label="应回款" width="120" align="right">
          <template #default="{ row }">¥{{ Number(row.amount).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="remind_type" label="提醒类型" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.remind_type === 'overdue' ? 'danger' : 'warning'" size="small">
              {{ row.remind_type === 'overdue' ? '已逾期' : '即将到期' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remind_date" label="提醒日期" width="110" />
        <el-table-column label="距到期" width="100" align="center">
          <template #default="{ row }">
            <span v-if="row.remind_days >= 0" style="color:#e6a23c">{{ row.remind_days }}天</span>
            <span v-else style="color:#f56c6c">逾期{{ Math.abs(row.remind_days) }}天</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'pending' ? 'warning' : 'success'" size="small">
              {{ row.status === 'pending' ? '待处理' : '已确认' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'pending'" type="primary" link @click="handleAcknowledge(row)">确认处理</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" layout="total,prev,pager,next" @current-change="fetchList" /></div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'

const loading = ref(false)
const generating = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filterStatus = ref('')
const summary = ref({ today_pending: 0, upcoming: 0, overdue: 0, overdue_amount: 0 })

const statCards = computed(() => [
  { key: 'today', label: '今日待处理', value: summary.value.today_pending, class: '' },
  { key: 'upcoming', label: '即将到期', value: summary.value.upcoming, class: 'warning' },
  { key: 'overdue', label: '已逾期', value: summary.value.overdue, class: 'danger' },
  { key: 'amount', label: '逾期总金额', value: '¥' + Number(summary.value.overdue_amount).toLocaleString(), class: 'danger' }
])

const fetchList = async () => {
  loading.value = true
  try {
    const res = await request.get('/finance/reminders', { params: { page: page.value, page_size: pageSize.value, status: filterStatus.value } })
    if (res.code === 200) { list.value = res.data.list; total.value = res.data.total }
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const fetchSummary = async () => {
  try { const res = await request.get('/finance/reminders/summary'); if (res.code === 200) summary.value = res.data } catch (e) { /* */ }
}

const handleGenerate = async () => {
  generating.value = true
  try {
    const res = await request.post('/finance/reminders/generate')
    if (res.code === 200) { ElMessage.success(res.message); fetchList(); fetchSummary() }
  } finally { generating.value = false }
}

const handleAcknowledge = async (row) => {
  try {
    const res = await request.put(`/finance/reminders/${row.id}/acknowledge`)
    if (res.code === 200) { ElMessage.success('已确认'); fetchList(); fetchSummary() }
  } catch (e) { /* */ }
}

onMounted(() => { fetchList(); fetchSummary() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: var(--space-4); }
.stat-card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--color-text); }
.stat-value.warning { color: #e6a23c; }
.stat-value.danger { color: #f56c6c; }
.stat-label { font-size: 13px; color: var(--color-text-tertiary); margin-top: 4px; }
.status-tabs { display: flex; gap: 8px; margin-bottom: var(--space-4); }
.pagination { display: flex; justify-content: flex-end; margin-top: var(--space-4); }
</style>
