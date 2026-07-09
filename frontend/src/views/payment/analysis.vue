<template>
  <div class="page-container">
    <div class="page-header">
      <h2>财务分析</h2>
      <div class="header-actions">
        <el-radio-group v-model="period" @change="fetchData">
          <el-radio-button value="quarter">本季</el-radio-button>
          <el-radio-button value="year">本年</el-radio-button>
        </el-radio-group>
        <el-button :icon="Download" @click="handleExport">导出</el-button>
      </div>
    </div>

    <!-- KPI 卡片 -->
    <div class="stat-cards">
      <div class="stat-card" v-for="s in kpiCards" :key="s.key">
        <div class="stat-label">{{ s.label }}</div>
        <div class="stat-value" :class="s.class">{{ s.value }}</div>
      </div>
    </div>

    <!-- 第二行：利润趋势 + 成本结构 -->
    <el-row :gutter="20" style="margin-bottom:20px">
      <el-col :span="14">
        <el-card shadow="never"><template #header><span class="card-title">利润趋势（近12个月）</span></template><div ref="profitTrendRef" class="chart-container"></div></el-card>
      </el-col>
      <el-col :span="10">
        <el-card shadow="never"><template #header><span class="card-title">成本结构</span></template><div ref="costStructRef" class="chart-container"></div></el-card>
      </el-col>
    </el-row>

    <!-- 第三行：账龄 + 现金流 -->
    <el-row :gutter="20" style="margin-bottom:20px">
      <el-col :span="12">
        <el-card shadow="never"><template #header><span class="card-title">应收账款账龄</span></template><div ref="agingRef" class="chart-container"></div></el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never"><template #header><span class="card-title">现金流趋势</span></template><div ref="cashFlowRef" class="chart-container"></div></el-card>
      </el-col>
    </el-row>

    <!-- 第四行：收款效率 -->
    <el-row :gutter="20">
      <el-col :span="8">
        <el-card shadow="never">
          <template #header><span class="card-title">收款效率</span></template>
          <div class="efficiency-card">
            <div class="eff-value">{{ data.collection?.avg_days || 0 }}</div>
            <div class="eff-label">平均回款天数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="16">
        <el-card shadow="never"><template #header><span class="card-title">回款率趋势</span></template><div ref="collectionRef" class="chart-container"></div></el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { Download } from '@element-plus/icons-vue'
import { getFinanceAnalysis } from '@/api/hr'
import echarts from '@/composables/useECharts'

const period = ref('year')
const data = ref({ profit: {}, costStructure: [], aging: [], cashFlow: [], collection: { avg_days: 0, trend: [] } })

const profitTrendRef = ref(null)
const costStructRef = ref(null)
const agingRef = ref(null)
const cashFlowRef = ref(null)
const collectionRef = ref(null)

const kpiCards = computed(() => {
  const p = data.value.profit
  return [
    { key: 'income', label: '总收入', value: '¥' + Number(p.income || 0).toLocaleString() },
    { key: 'cost', label: '总成本', value: '¥' + Number(p.cost || 0).toLocaleString() },
    { key: 'profit', label: '毛利润', value: '¥' + Number(p.gross_profit || 0).toLocaleString(), class: p.gross_profit >= 0 ? '' : 'danger' },
    { key: 'margin', label: '毛利率', value: (p.gross_margin || 0) + '%' }
  ]
})

const fetchData = async () => {
  try {
    const now = new Date()
    let start_date, end_date
    if (period.value === 'quarter') {
      const q = Math.ceil((now.getMonth() + 1) / 3)
      start_date = `${now.getFullYear()}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`
      end_date = `${now.getFullYear()}-12-31`
    } else {
      start_date = `${now.getFullYear()}-01-01`
      end_date = `${now.getFullYear()}-12-31`
    }
    const res = await getFinanceAnalysis({ start_date, end_date })
    if (res.code === 200) {
      data.value = res.data
      await nextTick()
      renderCharts()
    }
  } catch (e) { /* */ }
}

const renderCharts = () => {
  const d = data.value

  // 利润趋势
  if (profitTrendRef.value && d.cashFlow.length > 0) {
    const chart = echarts.init(profitTrendRef.value)
    chart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['收入', '成本', '利润'], top: 0 },
      grid: { left: 60, right: 20, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: d.cashFlow.map(c => c.month) },
      yAxis: { type: 'value', axisLabel: { formatter: v => v >= 10000 ? (v/10000)+'万' : v } },
      series: [
        { name: '收入', type: 'line', smooth: true, data: d.cashFlow.map(c => c.inflow), itemStyle: { color: '#0071e3' } },
        { name: '成本', type: 'line', smooth: true, data: d.cashFlow.map(c => c.outflow), itemStyle: { color: '#f56c6c' } },
        { name: '利润', type: 'line', smooth: true, data: d.cashFlow.map(c => c.inflow - c.outflow), itemStyle: { color: '#34c759' }, lineStyle: { type: 'dashed' } }
      ]
    })
  }

  // 成本结构
  if (costStructRef.value && d.costStructure.length > 0) {
    const chart = echarts.init(costStructRef.value)
    chart.setOption({
      tooltip: { trigger: 'item' },
      series: [{ type: 'pie', radius: ['40%', '70%'], data: d.costStructure, label: { show: true, formatter: '{b}\n{d}%' } }]
    })
  }

  // 账龄
  if (agingRef.value) {
    const chart = echarts.init(agingRef.value)
    chart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 60, right: 20, top: 20, bottom: 30 },
      xAxis: { type: 'category', data: d.aging.map(a => a.label) },
      yAxis: { type: 'value', axisLabel: { formatter: v => v >= 10000 ? (v/10000)+'万' : v } },
      series: [{ type: 'bar', data: d.aging.map(a => ({ value: a.amount, itemStyle: { color: a.label === '90+' ? '#f56c6c' : a.label === '61-90' ? '#e6a23c' : '#0071e3' } })), barWidth: '50%' }]
    })
  }

  // 现金流
  if (cashFlowRef.value && d.cashFlow.length > 0) {
    const chart = echarts.init(cashFlowRef.value)
    chart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['流入', '流出'], top: 0 },
      grid: { left: 60, right: 20, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: d.cashFlow.map(c => c.month) },
      yAxis: { type: 'value', axisLabel: { formatter: v => v >= 10000 ? (v/10000)+'万' : v } },
      series: [
        { name: '流入', type: 'bar', data: d.cashFlow.map(c => c.inflow), itemStyle: { color: '#34c759' } },
        { name: '流出', type: 'bar', data: d.cashFlow.map(c => c.outflow), itemStyle: { color: '#f56c6c' } }
      ]
    })
  }

  // 回款率趋势
  if (collectionRef.value && d.collection.trend.length > 0) {
    const chart = echarts.init(collectionRef.value)
    chart.setOption({
      tooltip: { trigger: 'axis', formatter: p => `${p[0].axisValue}<br/>回款率: ${p[0].value}%` },
      grid: { left: 50, right: 20, top: 20, bottom: 30 },
      xAxis: { type: 'category', data: d.collection.trend.map(t => t.month) },
      yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
      series: [{ type: 'line', smooth: true, data: d.collection.trend.map(t => t.contract_amount > 0 ? Math.round(t.paid_amount / t.contract_amount * 100) : 0), areaStyle: { opacity: 0.15 }, itemStyle: { color: '#0071e3' } }]
    })
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1'

const handleExport = () => {
  const now = new Date()
  const start_date = `${now.getFullYear()}-01-01`
  window.open(`${apiBaseUrl}/finance/analysis/export?start_date=${start_date}`, '_blank')
}

onMounted(() => { fetchData() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.header-actions { display: flex; gap: 12px; align-items: center; }
.stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
.stat-card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.stat-label { font-size: 13px; color: var(--color-text-tertiary); margin-bottom: 8px; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--color-text); }
.stat-value.danger { color: #f56c6c; }
.card-title { font-size: 15px; font-weight: 600; }
.chart-container { height: 280px; }
.efficiency-card { text-align: center; padding: 20px 0; }
.eff-value { font-size: 48px; font-weight: 800; color: var(--color-accent); }
.eff-label { font-size: 14px; color: var(--color-text-tertiary); margin-top: 8px; }
</style>
