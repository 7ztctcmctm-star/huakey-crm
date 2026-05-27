<template>
  <div class="analysis-page">
    <div class="page-header">
      <h2>数据分析</h2>
      <div class="header-actions">
        <el-button type="primary" :icon="Refresh" @click="fetchAll" :loading="loading">刷新数据</el-button>
      </div>
    </div>

    <!-- 销售预测 -->
    <el-row :gutter="24">
      <el-col :span="16">
        <el-card shadow="never">
          <template #header><span class="section-title">销售预测（移动平均法）</span></template>
          <div ref="predictionChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never">
          <template #header><span class="section-title">赢单率分析</span></template>
          <div ref="winRateChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 异常检测 + 流失预警 -->
    <el-row :gutter="24" style="margin-top: 24px">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span class="section-title">异常检测（近30天合同金额）</span></template>
          <div ref="anomalyChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="card-header-row">
              <span class="section-title">客户流失预警</span>
              <el-tag type="danger" v-if="churnData.total > 0">{{ churnData.total }}个客户</el-tag>
            </div>
          </template>
          <el-table :data="churnData.list" stripe border size="small" max-height="300" v-loading="churnLoading" empty-text="暂无预警">
            <el-table-column prop="company_name" label="公司名称" min-width="140" show-overflow-tooltip />
            <el-table-column prop="owner_name" label="负责人" width="80" />
            <el-table-column prop="overdue_days" label="逾期天数" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.overdue_days > 60 ? 'danger' : 'warning'" size="small">{{ row.overdue_days }}天</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80" align="center">
              <template #default="{ row }">
                <el-button type="primary" size="small" link @click="$router.push(`/customer/detail/${row.id}`)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="churnData.total > 20" class="table-footer">
            <el-button type="primary" size="small" link @click="loadMoreChurn">加载更多...</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { useChart } from '@/composables/useChart'

const loading = ref(false)
const churnLoading = ref(false)
const churnData = ref({ list: [], total: 0 })
const churnPage = ref(1)

const { refs: { predictionChartRef, winRateChartRef, anomalyChartRef }, echarts, initChart } = useChart('predictionChartRef', 'winRateChartRef', 'anomalyChartRef')

const fetchAll = () => {
  loading.value = true
  Promise.all([
    fetchPrediction(),
    fetchWinRate(),
    fetchAnomaly(),
    fetchChurnAlert()
  ]).finally(() => { loading.value = false })
}

// 销售预测
const fetchPrediction = async () => {
  try {
    const res = await request.get('/analysis/prediction')
    if (res.code === 200) renderPredictionChart(res.data)
  } catch (e) { console.error('获取预测数据失败:', e) }
}

const renderPredictionChart = (data) => {
  const allMonths = [...data.history.map(h => h.month), ...data.prediction.map(p => p.month)]
  const historyAmounts = data.history.map(h => h.amount)
  const predictionAmounts = [
    ...new Array(data.history.length - 1).fill(null),
    historyAmounts[historyAmounts.length - 1],
    ...data.prediction.map(p => p.amount)
  ]
  const fullHistory = [...historyAmounts, ...new Array(data.prediction.length).fill(null)]

  initChart('predictionChartRef', {
    tooltip: { trigger: 'axis' },
    legend: { data: ['历史数据', '预测数据'], bottom: 10 },
    grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
    xAxis: { type: 'category', data: allMonths, axisLabel: { rotate: 30 } },
    yAxis: { type: 'value', name: '合同金额', axisLabel: { formatter: v => '¥' + (v / 10000).toFixed(0) + '万' } },
    series: [
      {
        name: '历史数据',
        type: 'line',
        data: fullHistory,
        smooth: true,
        itemStyle: { color: '#2563eb' },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(37,99,235,0.3)' }, { offset: 1, color: 'rgba(37,99,235,0.02)' }]) }
      },
      {
        name: '预测数据',
        type: 'line',
        data: predictionAmounts,
        smooth: true,
        lineStyle: { type: 'dashed', color: '#f59e0b' },
        itemStyle: { color: '#f59e0b' }
      }
    ]
  })
}

// 赢单率分析
const fetchWinRate = async () => {
  try {
    const res = await request.get('/analysis/win-rate')
    if (res.code === 200) renderWinRateChart(res.data)
  } catch (e) { console.error('获取赢单率失败:', e) }
}

const renderWinRateChart = (data) => {
  const names = data.map(d => d.name)
  const counts = data.map(d => d.count)
  const stageColors = ['#94a3b8', '#60a5fa', '#3b82f6', '#2563eb', '#67c23a', '#f56c6c']

  initChart('winRateChartRef', {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: names.reverse() },
    series: [{
      type: 'bar',
      data: counts.reverse().map((v, i) => ({
        value: v,
        itemStyle: { color: stageColors[5 - i], borderRadius: [0, 4, 4, 0] }
      })),
      barWidth: '60%',
      label: { show: true, position: 'right', formatter: '{c}个' }
    }]
  })
}

// 异常检测
const fetchAnomaly = async () => {
  try {
    const res = await request.get('/analysis/anomaly')
    if (res.code === 200) renderAnomalyChart(res.data)
  } catch (e) { console.error('获取异常数据失败:', e) }
}

const renderAnomalyChart = (data) => {
  const dates = data.daily.map(d => d.date.slice(5))
  const amounts = data.daily.map(d => d.amount)
  const mean = data.stats.mean

  initChart('anomalyChartRef', {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: dates, axisLabel: { rotate: 45 } },
    yAxis: { type: 'value', name: '合同金额' },
    series: [{
      type: 'bar',
      data: amounts.map((v, i) => ({
        value: v,
        itemStyle: {
          color: data.daily[i].is_anomaly ? '#f56c6c' : '#3b82f6',
          borderRadius: [2, 2, 0, 0]
        }
      })),
      barWidth: '60%',
      markLine: {
        silent: true,
        lineStyle: { color: '#f59e0b', type: 'dashed' },
        data: [{ yAxis: mean, label: { formatter: '均值: ¥{c}' } }]
      }
    }]
  })
}

// 客户流失预警
const fetchChurnAlert = async () => {
  churnLoading.value = true
  try {
    const res = await request.get(`/analysis/churn-alert?page=${churnPage.value}&pageSize=20`)
    if (res.code === 200) {
      churnData.value = res.data
    }
  } catch (e) { console.error('获取流失预警失败:', e) }
  finally { churnLoading.value = false }
}

const loadMoreChurn = () => {
  churnPage.value++
  fetchChurnAlert()
}

onMounted(() => { fetchAll() })
</script>

<style scoped>
.analysis-page { padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.page-header h2 { margin: 0; font-size: 22px; color: var(--c-text); }
.section-title { font-size: 16px; font-weight: bold; color: var(--c-text); }
.chart-container { height: 300px; }
.card-header-row { display: flex; justify-content: space-between; align-items: center; }
.table-footer { text-align: center; padding-top: 8px; }
</style>
