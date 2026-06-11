<template>
  <div class="page-container">
    <div class="page-header"><h2>满意度总览</h2></div>

    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card" v-for="s in statCards" :key="s.key">
        <div class="stat-value">{{ s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </div>
    </div>

    <!-- 趋势图 -->
    <el-row :gutter="20" style="margin-bottom:20px">
      <el-col :span="12">
        <el-card shadow="never"><template #header><span class="card-title">NPS 趋势（近6个月）</span></template><div ref="npsTrendRef" class="chart-container"></div></el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never"><template #header><span class="card-title">CSAT 趋势（近6个月）</span></template><div ref="csatTrendRef" class="chart-container"></div></el-card>
      </el-col>
    </el-row>

    <!-- 回复率对比 + 最新调查 -->
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card shadow="never"><template #header><span class="card-title">各活动回复率</span></template><div ref="responseRateRef" class="chart-container"></div></el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span class="card-title">最新调查数据</span></template>
          <div v-if="latestData" class="latest-data">
            <div class="latest-name">{{ latestData.name }}</div>
            <div class="latest-meta">{{ typeName[latestData.survey_type] }} · {{ latestData.total_responded }} 人回复</div>
            <div class="latest-scores">
              <div class="latest-score" v-if="latestData.avg_nps !== null">
                <div class="score-value" :class="latestData.avg_nps >= 9 ? 'good' : latestData.avg_nps >= 7 ? 'ok' : 'bad'">{{ latestData.avg_nps }}</div>
                <div class="score-label">NPS 均值</div>
              </div>
              <div class="latest-score" v-if="latestData.avg_csat !== null">
                <div class="score-value ok">{{ latestData.avg_csat }}</div>
                <div class="score-label">CSAT 均分</div>
              </div>
            </div>
          </div>
          <el-empty v-else description="暂无已关闭的调查" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import request from '@/utils/request'
import * as echarts from 'echarts'

const typeName = { nps: 'NPS', csat: 'CSAT', custom: '自定义' }

const data = ref({ stats: {}, npsTrend: [], csatTrend: [], campaignStats: [], latestData: null })
const npsTrendRef = ref(null)
const csatTrendRef = ref(null)
const responseRateRef = ref(null)

const statCards = computed(() => [
  { key: 'total', label: '总调查数', value: data.value.stats.total_campaigns || 0 },
  { key: 'active', label: '进行中', value: data.value.stats.active_campaigns || 0 },
  { key: 'responses', label: '总回复数', value: data.value.stats.total_responses || 0 },
  { key: 'nps', label: '平均NPS', value: data.value.stats.avg_nps || 0 }
])

const latestData = computed(() => data.value.latestData)

const fetchData = async () => {
  try {
    const res = await request.get('/survey/analytics/overview')
    if (res.code === 200) {
      data.value = res.data
      await nextTick()
      renderCharts()
    }
  } catch (e) { /* */ }
}

const renderCharts = () => {
  const d = data.value

  // NPS趋势
  if (npsTrendRef.value && d.npsTrend.length > 0) {
    const chart = echarts.init(npsTrendRef.value)
    chart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 20, bottom: 30 },
      xAxis: { type: 'category', data: d.npsTrend.map(t => t.month) },
      yAxis: { type: 'value', min: 0, max: 10 },
      series: [{ type: 'line', smooth: true, data: d.npsTrend.map(t => Math.round(t.avg_nps)), areaStyle: { opacity: 0.15 }, itemStyle: { color: '#0071e3' } }]
    })
  }

  // CSAT趋势
  if (csatTrendRef.value && d.csatTrend.length > 0) {
    const chart = echarts.init(csatTrendRef.value)
    chart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 20, bottom: 30 },
      xAxis: { type: 'category', data: d.csatTrend.map(t => t.month) },
      yAxis: { type: 'value', min: 0, max: 5 },
      series: [{ type: 'line', smooth: true, data: d.csatTrend.map(t => parseFloat(t.avg_csat).toFixed(1)), areaStyle: { opacity: 0.15 }, itemStyle: { color: '#34c759' } }]
    })
  }

  // 回复率对比
  if (responseRateRef.value && d.campaignStats.length > 0) {
    const chart = echarts.init(responseRateRef.value)
    const stats = d.campaignStats.reverse()
    chart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 120, right: 20, top: 10, bottom: 20 },
      xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
      yAxis: { type: 'category', data: stats.map(s => s.name) },
      series: [{ type: 'bar', data: stats.map(s => s.response_rate), itemStyle: { color: '#0071e3', borderRadius: [0, 4, 4, 0] } }]
    })
  }
}

onMounted(() => { fetchData() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
.stat-card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--color-text); }
.stat-label { font-size: 13px; color: var(--color-text-tertiary); margin-top: 4px; }
.card-title { font-size: 15px; font-weight: 600; }
.chart-container { height: 280px; }

.latest-data { padding: 8px 0; }
.latest-name { font-size: 16px; font-weight: 600; color: var(--color-text); margin-bottom: 4px; }
.latest-meta { font-size: 13px; color: var(--color-text-tertiary); margin-bottom: 16px; }
.latest-scores { display: flex; gap: 32px; }
.latest-score { text-align: center; }
.score-value { font-size: 36px; font-weight: 800; }
.score-value.good { color: #059669; }
.score-value.ok { color: #d97706; }
.score-value.bad { color: #dc2626; }
.score-label { font-size: 12px; color: var(--color-text-tertiary); margin-top: 4px; }
</style>
