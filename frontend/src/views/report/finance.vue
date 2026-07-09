<template>
  <div class="page-container">
    <div class="page-header">
      <h2>财务报表</h2>
      <div class="header-actions">
        <el-radio-group v-model="period" @change="fetchData">
          <el-radio-button value="month">本月</el-radio-button>
          <el-radio-button value="quarter">本季</el-radio-button>
          <el-radio-button value="year">本年</el-radio-button>
        </el-radio-group>
        <el-button :icon="Download" @click="handleExport('receivable')">导出</el-button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card" v-for="s in statCards" :key="s.key">
        <div class="stat-label">{{ s.label }}</div>
        <div class="stat-value">¥{{ fmtMoney(s.value) }}</div>
      </div>
    </div>

    <!-- 收入趋势 -->
    <el-card shadow="never" class="chart-card">
      <template #header><span class="card-title">收入趋势（近12个月）</span></template>
      <div ref="trendChartRef" class="chart-container"></div>
    </el-card>

    <!-- 应收账款 -->
    <el-card shadow="never">
      <template #header><span class="card-title">应收账款</span></template>
      <el-table :data="receivables" stripe border v-loading="loading">
        <el-table-column prop="contract_no" label="合同编号" width="150" />
        <el-table-column prop="customer_name" label="客户名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="total_amount" label="合同金额" width="120" align="right">
          <template #default="{ row }">¥{{ fmtMoney(row.total_amount) }}</template>
        </el-table-column>
        <el-table-column prop="paid_amount" label="已回款" width="120" align="right">
          <template #default="{ row }">¥{{ fmtMoney(row.paid_amount) }}</template>
        </el-table-column>
        <el-table-column prop="unpaid_amount" label="未回款" width="120" align="right">
          <template #default="{ row }"><span style="color:#f56c6c;font-weight:600">¥{{ fmtMoney(row.unpaid_amount) }}</span></template>
        </el-table-column>
        <el-table-column prop="overdue_days" label="逾期天数" width="100" align="center" sortable>
          <template #default="{ row }">
            <el-tag :type="row.overdue_days > 60 ? 'danger' : row.overdue_days > 30 ? 'warning' : 'info'" size="small">{{ row.overdue_days }}天</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { Download } from '@element-plus/icons-vue'
import { getReportFinance } from '@/api/report'
import echarts from '@/composables/useECharts'

const loading = ref(false)
const period = ref('month')
const data = ref({ overview: { month: {}, quarter: {}, year: {}, payment_rate: 0 }, receivables: [], trend: [] })
const trendChartRef = ref(null)
let trendChart = null

const fmtMoney = (v) => { const n = Number(v); return isNaN(n) ? '0.00' : n.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }

const periodData = computed(() => {
  if (period.value === 'quarter') return data.value.overview.quarter;
  if (period.value === 'year') return data.value.overview.year;
  return data.value.overview.month;
})

const statCards = computed(() => [
  { key: 'contract', label: '合同总金额', value: periodData.value.contract || 0 },
  { key: 'payment', label: '回款总金额', value: periodData.value.payment || 0 },
  { key: 'purchase', label: '采购总金额', value: periodData.value.purchase || 0 },
  { key: 'profit', label: '毛利润', value: periodData.value.profit || 0 }
])

const receivables = computed(() => data.value.receivables || [])

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getReportFinance()
    if (res.code === 200) {
      data.value = res.data
      await nextTick()
      renderTrendChart()
    }
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const renderTrendChart = () => {
  if (!trendChartRef.value) return
  if (!trendChart) trendChart = echarts.init(trendChartRef.value)
  const trend = data.value.trend || []
  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['合同金额', '回款金额'], top: 0 },
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: trend.map(t => t.month) },
    yAxis: { type: 'value', axisLabel: { formatter: (v) => v >= 10000 ? (v / 10000) + '万' : v } },
    series: [
      { name: '合同金额', type: 'line', smooth: true, data: trend.map(t => t.contract_amount), itemStyle: { color: '#0071e3' } },
      { name: '回款金额', type: 'line', smooth: true, data: trend.map(t => t.payment_amount), itemStyle: { color: '#34c759' } }
    ]
  })
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1'

const handleExport = (type) => {
  window.open(`${apiBaseUrl}/report/finance/export?type=${type}`, '_blank')
}

onMounted(() => { fetchData() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.header-actions { display: flex; gap: 12px; align-items: center; }

.stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: var(--space-4); }
.stat-card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.stat-label { font-size: 13px; color: var(--color-text-tertiary); margin-bottom: 8px; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--color-text); }

.chart-card { margin-bottom: var(--space-4); }
.card-title { font-size: 15px; font-weight: 600; }
.chart-container { height: 320px; }

@media (max-width: 1200px) { .stat-cards { grid-template-columns: repeat(2, 1fr); } }
</style>
