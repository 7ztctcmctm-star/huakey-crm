<template>
  <div class="page-container">
    <div class="page-header">
      <h2>数据报表</h2>
      <div class="header-actions">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          @change="handleDateChange"
        />
        <el-button type="warning" :icon="Download" :loading="exportLoading" @click="handleExport" style="margin-left: 12px">导出报表</el-button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="24">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-value">¥{{ formatAmount(paymentData.plan_amount) }}</div>
            <div class="stat-label">本月计划回款</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-value">¥{{ formatAmount(paymentData.pay_amount) }}</div>
            <div class="stat-label">本月实际回款</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card warning">
          <div class="stat-content">
            <div class="stat-value">¥{{ formatAmount(paymentData.overdue_amount) }}</div>
            <div class="stat-label">逾期账款</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-value">{{ customerData.month_new }}</div>
            <div class="stat-label">本月新增客户</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表区域 -->
    <el-row :gutter="24" style="margin-top: 24px">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <span class="section-title">销售漏斗</span>
          </template>
          <div ref="funnelChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <span class="section-title">客户来源分布</span>
          </template>
          <div ref="sourceChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="24" style="margin-top: 24px">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <span class="section-title">销售趋势</span>
          </template>
          <div ref="trendChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <span class="section-title">客户等级分布</span>
          </template>
          <div ref="levelChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 采购分析 -->
    <el-row :gutter="24" style="margin-top: 24px">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <span class="section-title">采购趋势</span>
          </template>
          <div ref="purchaseTrendChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <span class="section-title">采购供应商分布</span>
          </template>
          <div ref="purchaseSupplierChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 业绩排行 -->
    <el-row :gutter="24" style="margin-top: 24px">
      <el-col :span="24">
        <el-card shadow="never">
          <template #header>
            <span class="section-title">销售业绩排行</span>
          </template>
          <div v-if="performanceLoading" v-loading="performanceLoading" style="min-height: 300px" />
          <el-table v-else :data="performanceList" stripe border>
            <el-table-column type="index" label="排名" width="60" />
            <el-table-column prop="name" label="销售姓名" width="120" />
            <el-table-column prop="contract_amount" label="成交金额" width="160" align="right">
              <template #default="{ row }">
                <span>¥{{ formatAmount(row.contract_amount) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="payment_amount" label="回款金额" width="160" align="right">
              <template #default="{ row }">
                <span>¥{{ formatAmount(row.payment_amount) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="回款率" width="100" align="right">
              <template #default="{ row }">
                <span>{{ row.contract_amount ? Math.round((row.payment_amount / row.contract_amount) * 100) : 0 }}%</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { formatAmount } from '@/composables/useFormat'
import { useChart } from '@/composables/useChart'
import { PARENT_SOURCE_COLORS } from '@/constants/source'

const dateRange = ref([])
const paymentData = reactive({
  plan_amount: '0',
  pay_amount: '0',
  overdue_amount: '0'
})
const customerData = reactive({
  month_new: 0,
  source_dist: [],
  level_dist: []
})
const performanceList = ref([])
const performanceLoading = ref(false)
const exportLoading = ref(false)

const { refs: { funnelChartRef, sourceChartRef, trendChartRef, levelChartRef, purchaseTrendChartRef, purchaseSupplierChartRef }, echarts, initChart } = useChart('funnelChartRef', 'sourceChartRef', 'trendChartRef', 'levelChartRef', 'purchaseTrendChartRef', 'purchaseSupplierChartRef')

const handleDateChange = () => {
  fetchData()
}

const fetchData = () => {
  Promise.all([fetchPayment(), fetchCustomer(), fetchPerformance()]).then(() => initCharts())
}

const getDateParams = () => {
  if (dateRange.value && dateRange.value.length === 2) {
    return `?startDate=${dateRange.value[0]}&endDate=${dateRange.value[1]}`
  }
  return ''
}

const fetchPayment = async () => {
  try {
    const res = await request.get(`/report/payment${getDateParams()}`)
    if (res.code === 200) {
      Object.assign(paymentData, res.data)
    }
  } catch (error) {
    console.error('获取回款数据失败:', error)
    ElMessage.error('加载回款数据失败')
  }
}

const fetchCustomer = async () => {
  try {
    const res = await request.get(`/report/customer${getDateParams()}`)
    if (res.code === 200) {
      Object.assign(customerData, res.data)
      renderSourceChart(customerData.source_dist || [])
      renderLevelChart(customerData.level_dist || [])
    }
  } catch (error) {
    console.error('获取客户数据失败:', error)
    ElMessage.error('加载客户数据失败')
  }
}

const fetchPerformance = async () => {
  performanceLoading.value = true
  try {
    const res = await request.get(`/report/performance${getDateParams()}`)
    if (res.code === 200) {
      performanceList.value = res.data
    }
  } catch (error) {
    console.error('获取业绩数据失败:', error)
    ElMessage.error('加载业绩数据失败')
  } finally {
    performanceLoading.value = false
  }
}

const initCharts = () => {
  // source/level 图表已在 fetchCustomer() 成功后渲染
  Promise.all([fetchSalesFunnel(), fetchSalesTrend(), fetchPurchaseTrend(), fetchPurchaseBySupplier()])
}

const fetchSalesFunnel = async () => {
  try {
    const res = await request.get(`/report/sales-funnel${getDateParams()}`)
    if (res.code === 200) {
      renderFunnelChart(res.data)
    }
  } catch (error) {
    console.error('获取销售漏斗失败:', error)
    ElMessage.error('加载销售漏斗失败')
  }
}

const renderFunnelChart = (data) => {
  initChart('funnelChartRef', {
    tooltip: { trigger: 'item', formatter: '{b}: {c}个商机 (¥{d})' },
    legend: { data: data.map(item => item.stage), bottom: 10 },
    series: [{
      name: '销售漏斗',
      type: 'funnel',
      left: '10%',
      top: '10%',
      bottom: '20%',
      width: '80%',
      min: 0,
      max: data[0]?.count || 10,
      minSize: '0%',
      maxSize: '100%',
      sort: 'descending',
      gap: 2,
      label: { show: true, position: 'inside', formatter: '{b}\n{c}个' },
      labelLine: { length: 10 },
      itemStyle: { borderColor: '#fff', borderWidth: 1 },
      emphasis: { label: { fontSize: 14 } },
      data: data.map((item, index) => ({
        value: item.count,
        name: item.stage,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: ['#1a56db', '#2563eb', '#3b82f6', '#60a5fa', '#94a3b8', '#cbd5e1'][index] },
            { offset: 1, color: ['#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#e2e8f0', '#cbd5e1'][index] }
          ])
        }
      }))
    }]
  })
}

const renderSourceChart = (data) => {
  initChart('sourceChartRef', {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { orient: 'vertical', left: 'left', top: 'center' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['60%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      emphasis: {
        label: { show: true, fontSize: 18, fontWeight: 'bold' },
        itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' }
      },
      labelLine: { show: false },
      data: data.map((item) => ({
        value: item.count,
        name: item.source || '未知',
        itemStyle: { color: PARENT_SOURCE_COLORS[item.source] || '#94a3b8' }
      }))
    }]
  })
}

const fetchSalesTrend = async () => {
  try {
    const res = await request.get(`/report/sales-trend${getDateParams()}`)
    if (res.code === 200) {
      renderTrendChart(res.data)
    }
  } catch (error) {
    console.error('获取销售趋势失败:', error)
    ElMessage.error('加载销售趋势失败')
  }
}

const renderTrendChart = (data) => {
  const months = data.map(item => item.month)
  const amounts = data.map(item => parseFloat(item.amount))
  const counts = data.map(item => item.contract_count || 0)
  initChart('trendChartRef', {
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { data: ['销售额', '合同数'], bottom: 10 },
    grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
    xAxis: { type: 'category', data: months, axisLabel: { rotate: 30 } },
    yAxis: [
      { type: 'value', name: '销售额', axisLabel: { formatter: '¥{value}' } },
      { type: 'value', name: '合同数', axisLabel: { formatter: '{value}个' }, splitLine: { show: false } }
    ],
    series: [
      {
        name: '销售额',
        type: 'bar',
        data: amounts,
        itemStyle: { color: '#2563eb' }
      },
      {
        name: '合同数',
        type: 'line',
        yAxisIndex: 1,
        data: counts,
        lineStyle: { color: '#1a56db', width: 3 },
        itemStyle: { color: '#1a56db' }
      }
    ]
  })
}

const renderLevelChart = (data) => {
  const levelColors = { 'A': '#60a5fa', 'B': '#3b82f6', 'C': '#1a56db', 'D': '#94a3b8' }
  const getLevelColor = (level) => {
    const key = (level || '')[0]
    return levelColors[key] || '#94a3b8'
  }
  initChart('levelChartRef', {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: data.map(item => item.level) },
    yAxis: { type: 'value', name: '客户数' },
    series: [{
      type: 'bar',
      data: data.map(item => ({
        value: item.count,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: getLevelColor(item.level) },
            { offset: 1, color: getLevelColor(item.level) + '80' }
          ]),
          borderRadius: [4, 4, 0, 0]
        }
      })),
      barWidth: '50%'
    }]
  })
}

const fetchPurchaseTrend = async () => {
  try {
    const res = await request.get(`/report/purchase-trend${getDateParams()}`)
    if (res.code === 200) {
      renderPurchaseTrendChart(res.data)
    }
  } catch (error) {
    console.error('获取采购趋势失败:', error)
    ElMessage.error('加载采购趋势失败')
  }
}

const renderPurchaseTrendChart = (data) => {
  const months = data.map(item => item.month)
  const amounts = data.map(item => parseFloat(item.amount))
  const counts = data.map(item => item.order_count || 0)
  initChart('purchaseTrendChartRef', {
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { data: ['采购额', '采购单数'], bottom: 10 },
    grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
    xAxis: { type: 'category', data: months, axisLabel: { rotate: 30 } },
    yAxis: [
      { type: 'value', name: '采购额', axisLabel: { formatter: '¥{value}' } },
      { type: 'value', name: '采购单数', axisLabel: { formatter: '{value}个' }, splitLine: { show: false } }
    ],
    series: [
      {
        name: '采购额',
        type: 'bar',
        data: amounts,
        itemStyle: { color: '#059669' }
      },
      {
        name: '采购单数',
        type: 'line',
        yAxisIndex: 1,
        data: counts,
        lineStyle: { color: '#047857', width: 3 },
        itemStyle: { color: '#047857' }
      }
    ]
  })
}

const fetchPurchaseBySupplier = async () => {
  try {
    const res = await request.get(`/report/purchase-by-supplier${getDateParams()}`)
    if (res.code === 200) {
      renderPurchaseSupplierChart(res.data)
    }
  } catch (error) {
    console.error('获取采购供应商分布失败:', error)
    ElMessage.error('加载采购供应商分布失败')
  }
}

const renderPurchaseSupplierChart = (data) => {
  const names = data.map(item => item.supplier_name)
  const amounts = data.map(item => parseFloat(item.total_amount))
  initChart('purchaseSupplierChartRef', {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: '{b}: ¥{c}' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value', axisLabel: { formatter: '¥{value}' } },
    yAxis: { type: 'category', data: names, axisLabel: { width: 80, overflow: 'truncate' } },
    series: [{
      type: 'bar',
      data: amounts,
      barWidth: '60%',
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#059669' },
          { offset: 1, color: '#34d399' }
        ]),
        borderRadius: [0, 4, 4, 0]
      }
    }]
  })
}

const handleExport = async () => {
  exportLoading.value = true
  try {
    const params = {}
    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }
    const blob = await request.post('/report/export', params, { responseType: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '数据报表.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('导出失败')
  } finally {
    exportLoading.value = false
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.page-container {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-5);
}

.page-header h2 {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text);
  letter-spacing: -0.02em;
}

.header-actions {
  display: flex;
  align-items: center;
}

.stat-card {
  text-align: center;
}

.stat-card.warning .stat-value {
  color: var(--color-warning);
}

.stat-content {
  padding: var(--space-2);
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-accent);
  margin-bottom: var(--space-2);
}

.stat-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.chart-container {
  height: 300px;
}
</style>
