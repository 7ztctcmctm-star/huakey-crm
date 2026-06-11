<template>
  <div class="page-container">
    <div class="page-header">
      <h2>增强销售预测</h2>
      <div>
        <el-select v-model="monthsAhead" style="width:120px;margin-right:8px">
          <el-option label="未来3月" :value="3" /><el-option label="未来6月" :value="6" /><el-option label="未来12月" :value="12" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="fetchData">刷新</el-button>
      </div>
    </div>

    <!-- 预测对比图 -->
    <el-card shadow="never" style="margin-bottom:20px">
      <template #header><span class="card-title">预测对比</span></template>
      <div ref="chartRef" class="chart-container"></div>
    </el-card>

    <!-- 预测表格 -->
    <el-card shadow="never" style="margin-bottom:20px">
      <template #header><span class="card-title">预测数据</span></template>
      <el-table :data="predictions" stripe border>
        <el-table-column prop="month" label="月份" width="100" />
        <el-table-column prop="moving_avg" label="移动平均" width="120" align="right">
          <template #default="{ row }">¥{{ Number(row.moving_avg).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="linear_regression" label="线性回归" width="120" align="right">
          <template #default="{ row }">¥{{ Number(row.linear_regression).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="seasonal" label="季节性" width="120" align="right">
          <template #default="{ row }">¥{{ Number(row.seasonal).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="置信区间" width="200">
          <template #default="{ row }">¥{{ Number(row.confidence_low).toLocaleString() }} ~ ¥{{ Number(row.confidence_high).toLocaleString() }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 模型说明 -->
    <el-row :gutter="16">
      <el-col :span="8">
        <el-card shadow="never">
          <template #header><span class="card-title">移动平均法</span></template>
          <p class="model-desc">基于最近N个月的平均值预测。适合短期预测，对波动不敏感。</p>
          <div class="model-param">窗口大小：{{ models.moving_avg?.window || '-' }} 个月</div>
          <div class="model-param">最近均值：¥{{ Number(models.moving_avg?.last_value || 0).toLocaleString() }}</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never">
          <template #header><span class="card-title">线性回归法</span></template>
          <p class="model-desc">用最小二乘法拟合趋势直线。适合识别增长/下降趋势。</p>
          <div class="model-param">斜率：{{ models.linear_regression?.slope || '-' }}（每月变化）</div>
          <div class="model-param">截距：{{ models.linear_regression?.intercept || '-' }}</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never">
          <template #header><span class="card-title">季节性分析</span></template>
          <p class="model-desc">识别周期性规律（如年底旺季）。需要至少12个月数据。</p>
          <div class="model-param">是否有季节性：{{ models.seasonal?.has_seasonal ? '是' : '否（数据不足）' }}</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch } from 'vue'
import request from '@/utils/request'
import * as echarts from 'echarts'

const loading = ref(false)
const monthsAhead = ref(3)
const history = ref([])
const predictions = ref([])
const models = ref({})
const chartRef = ref(null)

const fetchData = async () => {
  loading.value = true
  try {
    const res = await request.get('/analysis/prediction/enhanced', { params: { months_ahead: monthsAhead.value } })
    if (res.code === 200) {
      history.value = res.data.history || []
      predictions.value = res.data.predictions || []
      models.value = res.data.models || {}
      await nextTick()
      renderChart()
    }
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const renderChart = () => {
  if (!chartRef.value) return
  const chart = echarts.init(chartRef.value)
  const histMonths = history.value.map(h => h.month)
  const predMonths = predictions.value.map(p => p.month)
  const allMonths = [...histMonths, ...predMonths]
  const histAmounts = history.value.map(h => parseFloat(h.amount))

  const maData = [...new Array(histMonths.length).fill(null), ...predictions.value.map(p => p.moving_avg)]
  const lrData = [...new Array(histMonths.length).fill(null), ...predictions.value.map(p => p.linear_regression)]
  const seasonData = [...new Array(histMonths.length).fill(null), ...predictions.value.map(p => p.seasonal)]
  const confLow = [...new Array(histMonths.length).fill(null), ...predictions.value.map(p => p.confidence_low)]
  const confHigh = [...new Array(histMonths.length).fill(null), ...predictions.value.map(p => p.confidence_high)]

  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['实际', '移动平均', '线性回归', '季节性', '置信区间'], top: 0 },
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: allMonths, axisLabel: { rotate: 45, fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { formatter: v => v >= 10000 ? (v / 10000) + '万' : v } },
    series: [
      { name: '实际', type: 'line', data: [...histAmounts, ...new Array(predMonths.length).fill(null)], itemStyle: { color: '#1d1d1f' }, lineWidth: 2 },
      { name: '移动平均', type: 'line', data: maData, itemStyle: { color: '#0071e3' }, lineStyle: { type: 'dashed' } },
      { name: '线性回归', type: 'line', data: lrData, itemStyle: { color: '#34c759' }, lineStyle: { type: 'dashed' } },
      { name: '季节性', type: 'line', data: seasonData, itemStyle: { color: '#ff9500' }, lineStyle: { type: 'dashed' } },
      { name: '置信区间', type: 'line', data: confHigh, itemStyle: { color: 'transparent' }, areaStyle: { opacity: 0 }, lineStyle: { width: 0 } }
    ]
  })
}

watch(monthsAhead, () => { fetchData() })
onMounted(() => { fetchData() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.card-title { font-size: 15px; font-weight: 600; }
.chart-container { height: 360px; }
.model-desc { font-size: 13px; color: var(--color-text-secondary); line-height: 1.6; margin-bottom: 12px; }
.model-param { font-size: 13px; color: var(--color-text); margin-bottom: 4px; }
</style>
