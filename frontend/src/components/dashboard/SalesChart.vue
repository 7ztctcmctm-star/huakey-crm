<template>
  <el-row :gutter="24" style="margin-top: 24px">
    <el-col :span="12">
      <el-card shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              <el-icon><Setting /></el-icon> 快捷操作
            </span>
          </div>
        </template>
        <div class="quick-actions">
          <div class="action-item" @click="$emit('quick-action', 'add_customer')">
            <div class="action-icon" style="background: #eff6ff; color: #1a56db">
              <el-icon :size="24"><Plus /></el-icon>
            </div>
            <span>新建客户</span>
          </div>
          <div class="action-item" @click="$emit('quick-action', 'add_follow')">
            <div class="action-icon" style="background: #eff6ff; color: #1a56db">
              <el-icon :size="24"><ArrowDown /></el-icon>
            </div>
            <span>添加跟进</span>
          </div>
          <div class="action-item" @click="$emit('quick-action', 'add_opportunity')">
            <div class="action-icon" style="background: #eff6ff; color: #1a56db">
              <el-icon :size="24"><Star /></el-icon>
            </div>
            <span>新建商机</span>
          </div>
          <div class="action-item" @click="$emit('quick-action', 'add_contract')">
            <div class="action-icon" style="background: #eff6ff; color: #dc2626">
              <el-icon :size="24"><Document /></el-icon>
            </div>
            <span>新建合同</span>
          </div>
          <div class="action-item" @click="$emit('quick-action', 'add_service')">
            <div class="action-icon" style="background: #eff6ff; color: #1a56db">
              <el-icon :size="24"><Service /></el-icon>
            </div>
            <span>创建工单</span>
          </div>
          <div class="action-item" @click="$emit('quick-action', 'report')">
            <div class="action-icon" style="background: #eff6ff; color: #1a56db">
              <el-icon :size="24"><Histogram /></el-icon>
            </div>
            <span>数据报表</span>
          </div>
          <div class="action-item" @click="$emit('quick-action', 'batch_follow')">
            <div class="action-icon" style="background: #f0fdf4; color: #16a34a">
              <el-icon :size="24"><List /></el-icon>
            </div>
            <span>批量跟进</span>
          </div>
        </div>
      </el-card>
    </el-col>

    <el-col :span="12">
      <el-card shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              <el-icon><TrendCharts /></el-icon> 销售趋势
            </span>
          </div>
        </template>
        <div ref="trendChartRef" class="chart-container"></div>
      </el-card>
    </el-col>
  </el-row>

  <el-row :gutter="24" style="margin-top: 24px">
    <el-col :span="14">
      <el-card shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              <el-icon><TrendCharts /></el-icon> 销售趋势
            </span>
          </div>
        </template>
        <div ref="trendChartRef2" class="chart-container"></div>
      </el-card>
    </el-col>
    <el-col :span="10">
      <el-card shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              <el-icon><PieChart /></el-icon> 客户来源分布
            </span>
          </div>
        </template>
        <div ref="sourceChartRef" class="chart-container"></div>
      </el-card>
    </el-col>
  </el-row>

  <el-row :gutter="24" style="margin-top: 24px">
    <el-col :span="14">
      <el-card shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              <el-icon><Search /></el-icon> 销售漏斗
            </span>
          </div>
        </template>
        <div ref="funnelChartRef" class="chart-container"></div>
      </el-card>
    </el-col>
    <el-col :span="10">
      <el-card shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              <el-icon><Trophy /></el-icon> 销售业绩排行
            </span>
          </div>
        </template>
        <div v-if="rankLoading" v-loading="rankLoading" style="min-height: 260px" />
        <el-table v-else :data="performanceRank" stripe size="small">
          <el-table-column type="index" label="排名" width="60" align="center" />
          <el-table-column prop="name" label="销售" min-width="80" />
          <el-table-column prop="contract_amount" label="成交金额" width="100" align="right">
            <template #default="{ row }">
              <span class="amount-text">¥{{ formatAmount(row.contract_amount) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="payment_amount" label="回款金额" width="100" align="right">
            <template #default="{ row }">
              <span class="amount-text">¥{{ formatAmount(row.payment_amount) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </el-col>
  </el-row>
</template>

<script setup>
import {
  TrendCharts, Plus, Document, Service, ArrowDown, Star,
  Histogram, List, PieChart, Search, Trophy, Setting
} from '@element-plus/icons-vue'
import { ref, onMounted, onActivated } from 'vue'
import { formatAmount } from '@/composables/useFormat'
import { useChart } from '@/composables/useChart'
import { PARENT_SOURCE_COLORS } from '@/constants/source'
import {
  getReportPerformance,
  getReportSalesTrend,
  getReportCustomerAnalysis,
  getReportSalesFunnel
} from '@/api/report'

const emit = defineEmits(['quick-action'])

const performanceRank = ref([])
const rankLoading = ref(false)

const { refs, echarts, initChart } = useChart('trendChartRef', 'sourceChartRef', 'funnelChartRef')
const trendChartRef = refs.trendChartRef
const trendChartRef2 = ref(null)
const sourceChartRef = refs.sourceChartRef
const funnelChartRef = refs.funnelChartRef

const fetchPerformanceRank = async () => {
  rankLoading.value = true
  try {
    const res = await getReportPerformance()
    if (res.code === 200) performanceRank.value = res.data.filter(item => item.contract_amount > 0).slice(0, 5)
  } catch (error) { console.error('获取业绩排行失败:', error) }
  finally { rankLoading.value = false }
}

const fetchSalesTrend = async () => {
  try {
    const res = await getReportSalesTrend()
    if (res.code === 200) renderTrendChart(res.data)
  } catch (error) { console.error('获取销售趋势失败:', error) }
}

const renderTrendChart = (data) => {
  const months = data.map(item => item.month)
  const amounts = data.map(item => parseFloat(item.amount))
  initChart('trendChartRef', {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: months, axisLabel: { rotate: 30 } },
    yAxis: { type: 'value', axisLabel: { formatter: '¥{value}' } },
    series: [{
      name: '销售额', type: 'line', smooth: true, data: amounts,
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(26, 86, 219, 0.15)' },
        { offset: 1, color: 'rgba(26, 86, 219, 0.03)' }
      ])},
      lineStyle: { color: '#1a56db', width: 2 },
      itemStyle: { color: '#1a56db' }
    }]
  })
}

const fetchCustomerSource = async () => {
  try {
    const res = await getReportCustomerAnalysis()
    if (res.code === 200) renderSourceChart(res.data.source_dist)
  } catch (error) { console.error('获取客户来源失败:', error) }
}

const renderSourceChart = (data) => {
  initChart('sourceChartRef', {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { orient: 'vertical', left: 'left', top: 'center' },
    series: [{
      type: 'pie', radius: ['40%', '70%'], center: ['60%', '50%'], avoidLabelOverlap: false,
      itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
      label: { show: false, position: 'center' },
      emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold' } },
      labelLine: { show: false },
      data: data.map((item) => ({
        value: item.count, name: item.source || '未知',
        itemStyle: { color: PARENT_SOURCE_COLORS[item.source] || 'var(--color-text-tertiary)' }
      }))
    }]
  })
}

const fetchSalesFunnel = async () => {
  try {
    const res = await getReportSalesFunnel()
    if (res.code === 200) renderFunnelChart(res.data)
  } catch (error) { console.error('获取销售漏斗失败:', error) }
}

const renderFunnelChart = (data) => {
  initChart('funnelChartRef', {
    tooltip: { trigger: 'item', formatter: '{b}: {c}个商机' },
    legend: { data: data.map(item => item.stage), bottom: 10 },
    series: [{
      name: '销售漏斗', type: 'funnel', left: '10%', top: '10%', bottom: '20%', width: '80%',
      min: 0, max: data[0]?.count || 10, minSize: '0%', maxSize: '100%', sort: 'descending', gap: 2,
      label: { show: true, position: 'inside' },
      labelLine: { length: 10, lineStyle: { width: 1, type: 'solid' } },
      itemStyle: { borderColor: '#fff', borderWidth: 1 },
      emphasis: { label: { fontSize: 14 } },
      data: data.map((item, index) => ({
        value: item.count, name: item.stage,
        itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: ['#1a56db', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#94a3b8'][index] },
          { offset: 1, color: ['#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#e2e8f0', '#cbd5e1'][index] }
        ])}
      }))
    }]
  })
}

const loadCharts = () => {
  fetchPerformanceRank()
  fetchSalesTrend()
  fetchCustomerSource()
  fetchSalesFunnel()
}

onMounted(() => { loadCharts() })
onActivated(() => { loadCharts() })
</script>

<style scoped>
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
  letter-spacing: -0.02em;
}

.chart-container {
  height: 260px;
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
}

.action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-3);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: background 0.2s var(--ease-out);
}

.action-item:hover {
  background: var(--color-bg-secondary);
}

.action-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
}

.action-item span {
  font-size: 13px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.amount-text {
  font-size: 13px;
  color: var(--color-text);
}
</style>
