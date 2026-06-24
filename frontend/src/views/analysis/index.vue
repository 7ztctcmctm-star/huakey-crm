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

    <!-- 销售漏斗 + RFM分类汇总 -->
    <el-row :gutter="24" style="margin-top: 24px">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span class="section-title">销售漏斗</span></template>
          <div ref="funnelChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span class="section-title">RFM 客户价值分类</span></template>
          <div ref="rfmChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- RFM 客户明细 -->
    <el-row :gutter="24" style="margin-top: 24px">
      <el-col :span="24">
        <el-card shadow="never">
          <template #header><span class="section-title">RFM 客户价值明细（Top 20）</span></template>
          <el-table :data="rfmData.list.slice(0, 20)" stripe border size="small" max-height="400" v-loading="rfmLoading" empty-text="暂无数据">
            <el-table-column type="index" label="#" width="50" />
            <el-table-column prop="company_name" label="客户名称" min-width="160" show-overflow-tooltip />
            <el-table-column prop="recency" label="最近跟进(天)" width="110" align="center" />
            <el-table-column prop="frequency" label="跟进次数" width="90" align="center" />
            <el-table-column label="合同金额" width="120" align="right">
              <template #default="{ row }">¥{{ row.monetary.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="r_score" label="R" width="50" align="center" />
            <el-table-column prop="f_score" label="F" width="50" align="center" />
            <el-table-column prop="m_score" label="M" width="50" align="center" />
            <el-table-column prop="total_score" label="总分" width="60" align="center" />
            <el-table-column label="等级" width="70" align="center">
              <template #default="{ row }">
                <el-tag :type="row.level === 'A' ? 'success' : row.level === 'B' ? 'primary' : row.level === 'C' ? 'warning' : 'info'" size="small">{{ row.level }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- 销售排行榜 -->
    <el-row :gutter="24" style="margin-top: 24px">
      <el-col :span="24">
        <el-card shadow="never">
          <template #header><span class="section-title">销售排行榜（赢单金额 Top 10）</span></template>
          <div ref="rankingChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { getPrediction, getWinRate, getAnomaly, getAnalysisFunnel, getRfm, getAnalysisRanking, getChurnAlert } from '@/api/report'
import request from '@/utils/request'
import { useChart } from '@/composables/useChart'

const loading = ref(false)
const churnLoading = ref(false)
const churnData = ref({ list: [], total: 0 })
const churnPage = ref(1)
const rfmData = ref({ list: [], summary: { A: 0, B: 0, C: 0, D: 0 } })
const rfmLoading = ref(false)

const { refs: { predictionChartRef, winRateChartRef, anomalyChartRef, funnelChartRef, rfmChartRef, rankingChartRef }, echarts, initChart } = useChart('predictionChartRef', 'winRateChartRef', 'anomalyChartRef', 'funnelChartRef', 'rfmChartRef', 'rankingChartRef')

const fetchAll = () => {
  loading.value = true
  Promise.all([
    fetchPrediction(),
    fetchWinRate(),
    fetchAnomaly(),
    fetchChurnAlert(),
    fetchFunnel(),
    fetchRfm(),
    fetchRanking()
  ]).finally(() => { loading.value = false })
}

// 销售预测
const fetchPrediction = async () => {
  try {
    const res = await getPrediction()
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
    const res = await getWinRate()
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
    const res = await getAnomaly()
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
    const res = await getChurnAlert({ page: churnPage.value, pageSize: 20 })
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

// 销售漏斗
const fetchFunnel = async () => {
  try {
    const res = await getAnalysisFunnel()
    if (res.code === 200) renderFunnelChart(res.data)
  } catch (e) { console.error('获取漏斗数据失败:', e) }
}

const renderFunnelChart = (data) => {
  const colors = ['#0071e3', '#34aadc', '#5ac8fa', '#ff9f0a', '#30d158', '#ff453a']
  initChart('funnelChartRef', {
    tooltip: { trigger: 'item', formatter: '{b}: {c}个' },
    series: [{
      type: 'funnel',
      left: '10%',
      top: 20,
      bottom: 20,
      width: '80%',
      min: 0,
      max: Math.max(...data.map(d => d.count), 1),
      minSize: '0%',
      maxSize: '100%',
      sort: 'descending',
      gap: 2,
      label: { show: true, position: 'inside', formatter: '{b}\n{c}个' },
      data: data.map((d, i) => ({ value: d.count, name: d.name, itemStyle: { color: colors[i] } }))
    }]
  })
}

// RFM 客户价值评分
const fetchRfm = async () => {
  rfmLoading.value = true
  try {
    const res = await getRfm()
    if (res.code === 200) {
      rfmData.value = res.data
      renderRfmChart(res.data.summary)
    }
  } catch (e) { console.error('获取RFM数据失败:', e) }
  finally { rfmLoading.value = false }
}

const renderRfmChart = (summary) => {
  const levelColors = { A: '#30d158', B: '#0071e3', C: '#ff9f0a', D: '#86868b' }
  initChart('rfmChartRef', {
    tooltip: { trigger: 'item', formatter: '{b}: {c}个 ({d}%)' },
    legend: { bottom: 10, data: ['A (优质)', 'B (良好)', 'C (一般)', 'D (流失)'] },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      label: { show: true, formatter: '{b}\n{c}个' },
      data: [
        { value: summary.A, name: 'A (优质)', itemStyle: { color: levelColors.A } },
        { value: summary.B, name: 'B (良好)', itemStyle: { color: levelColors.B } },
        { value: summary.C, name: 'C (一般)', itemStyle: { color: levelColors.C } },
        { value: summary.D, name: 'D (流失)', itemStyle: { color: levelColors.D } }
      ]
    }]
  })
}

// 销售排行榜
const fetchRanking = async () => {
  try {
    const res = await getAnalysisRanking()
    if (res.code === 200) renderRankingChart(res.data)
  } catch (e) { console.error('获取排行榜数据失败:', e) }
}

const renderRankingChart = (data) => {
  const top10 = data.slice(0, 10)
  initChart('rankingChartRef', {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => `${p[0].name}<br/>赢单金额: ¥${p[0].value.toLocaleString()}<br/>赢单数: ${top10[p[0].dataIndex].win_count}单` },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: top10.map(d => d.real_name), axisLabel: { rotate: 0 } },
    yAxis: { type: 'value', name: '赢单金额', axisLabel: { formatter: v => v >= 10000 ? (v / 10000).toFixed(0) + '万' : v } },
    series: [{
      type: 'bar',
      data: top10.map((d, i) => ({
        value: d.win_amount,
        itemStyle: { color: i === 0 ? '#0071e3' : i < 3 ? '#34aadc' : '#86868b', borderRadius: [4, 4, 0, 0] }
      })),
      barWidth: '50%',
      label: { show: true, position: 'top', formatter: p => p.value > 0 ? '¥' + (p.value / 10000).toFixed(1) + '万' : '' }
    }]
  })
}

onMounted(() => { fetchAll() })
</script>

<style scoped>
.analysis-page { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.section-title { font-size: 16px; font-weight: 600; color: var(--color-text); }
.chart-container { height: 300px; }
.card-header-row { display: flex; justify-content: space-between; align-items: center; }
.table-footer { text-align: center; padding-top: var(--space-2); }
</style>
