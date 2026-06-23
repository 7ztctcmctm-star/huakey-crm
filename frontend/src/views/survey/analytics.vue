<template>
  <div class="page-container" v-loading="loading">
    <div class="page-header">
      <div>
        <el-button :icon="ArrowLeft" text @click="$router.push('/survey')">返回</el-button>
        <span class="page-title">{{ campaign.name }}</span>
        <el-tag :type="statusTag[campaign.status]" size="small" style="margin-left:8px">{{ statusName[campaign.status] }}</el-tag>
      </div>
      <div class="header-meta">
        <span>回复率：{{ campaign.response_rate || 0 }}%</span>
        <span>已回复：{{ campaign.total_responded || 0 }} / {{ campaign.total_sent || 0 }}</span>
      </div>
    </div>

    <!-- NPS 分析 -->
    <el-card v-if="campaign.survey_type === 'nps' || hasNps" shadow="never" class="section-card">
      <template #header><span class="card-title">NPS 分析</span></template>
      <el-row :gutter="20">
        <el-col :span="6">
          <div class="big-number">
            <div class="big-value" :class="npsData.value >= 50 ? 'good' : npsData.value >= 0 ? 'ok' : 'bad'">{{ npsData.value }}</div>
            <div class="big-label">NPS 值</div>
          </div>
          <div class="nps-breakdown">
            <div class="nps-row"><span class="nps-dot green"></span>推荐者(9-10)：{{ npsData.promoters }}人 ({{ npsPercent(npsData.promoters) }}%)</div>
            <div class="nps-row"><span class="nps-dot yellow"></span>被动者(7-8)：{{ npsData.passives }}人 ({{ npsPercent(npsData.passives) }}%)</div>
            <div class="nps-row"><span class="nps-dot red"></span>贬损者(0-6)：{{ npsData.detractors }}人 ({{ npsPercent(npsData.detractors) }}%)</div>
          </div>
        </el-col>
        <el-col :span="18">
          <div ref="npsChartRef" class="chart-container"></div>
        </el-col>
      </el-row>
    </el-card>

    <!-- CSAT 分析 -->
    <el-card v-if="campaign.survey_type === 'csat' || hasCsat" shadow="never" class="section-card">
      <template #header><span class="card-title">CSAT 满意度分析</span></template>
      <el-row :gutter="20">
        <el-col :span="6">
          <div class="big-number">
            <div class="big-value ok">{{ csatData.average }}</div>
            <div class="big-label">平均分（满分5分）</div>
          </div>
          <div class="star-breakdown">
            <div v-for="(count, idx) in csatData.distribution" :key="idx" class="star-row">
              <span class="star-label">{{ 5 - idx }}星</span>
              <el-progress :percentage="csatData.total > 0 ? Math.round(count / csatData.total * 100) : 0" :stroke-width="14" :show-text="false" style="flex:1" />
              <span class="star-count">{{ count }}人</span>
            </div>
          </div>
        </el-col>
        <el-col :span="18">
          <div ref="csatChartRef" class="chart-container"></div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 文本回答 -->
    <el-card v-if="textAnswers.length > 0" shadow="never" class="section-card">
      <template #header><span class="card-title">文本回答（{{ textAnswers.length }}）</span></template>
      <div v-for="(ta, idx) in textAnswers" :key="idx" class="text-answer">
        <div class="text-meta">{{ ta.name || '匿名' }} · {{ ta.time }}</div>
        <div v-for="(val, question) in ta.texts" :key="question" class="text-item">
          <div class="text-question">{{ question }}</div>
          <div class="text-value">{{ val }}</div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { getSurveyAnalytics } from '@/api/survey'
import echarts from '@/composables/useECharts'

const route = useRoute()
const statusName = { draft: '草稿', active: '进行中', closed: '已关闭' }
const statusTag = { draft: 'info', active: 'success', closed: '' }

const loading = ref(false)
const campaign = ref({})
const npsData = ref({ value: 0, promoters: 0, passives: 0, detractors: 0, distribution: [], total: 0 })
const csatData = ref({ average: 0, distribution: [0, 0, 0, 0, 0], total: 0 })
const textAnswers = ref([])

const npsChartRef = ref(null)
const csatChartRef = ref(null)

const hasNps = computed(() => npsData.value.total > 0)
const hasCsat = computed(() => csatData.value.total > 0)
const npsPercent = (n) => npsData.value.total > 0 ? Math.round(n / npsData.value.total * 100) : 0

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getSurveyAnalytics(route.params.id)
    if (res.code === 200) {
      campaign.value = res.data.campaign
      npsData.value = res.data.nps
      csatData.value = res.data.csat
      textAnswers.value = res.data.textAnswers || []
      await nextTick()
      renderCharts()
    }
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const renderCharts = () => {
  // NPS分布图
  if (npsChartRef.value && npsData.value.total > 0) {
    const chart = echarts.init(npsChartRef.value)
    chart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 20, bottom: 30 },
      xAxis: { type: 'category', data: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] },
      yAxis: { type: 'value' },
      series: [{
        type: 'bar', data: npsData.value.distribution.map((v, i) => ({
          value: v,
          itemStyle: { color: i <= 6 ? '#f56c6c' : i <= 8 ? '#e6a23c' : '#67c23a' }
        }))
      }]
    })
  }

  // CSAT分布图
  if (csatChartRef.value && csatData.value.total > 0) {
    const chart = echarts.init(csatChartRef.value)
    chart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 20, bottom: 30 },
      xAxis: { type: 'category', data: ['1星', '2星', '3星', '4星', '5星'] },
      yAxis: { type: 'value' },
      series: [{
        type: 'bar', data: csatData.value.distribution.map(v => ({
          value: v,
          itemStyle: { color: '#0071e3' }
        })),
        barWidth: '40%'
      }]
    })
  }
}

onMounted(() => { fetchData() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-title { font-size: 20px; font-weight: 600; color: var(--color-text); margin-left: 8px; }
.header-meta { font-size: 13px; color: var(--color-text-tertiary); display: flex; gap: 16px; }
.card-title { font-size: 15px; font-weight: 600; }
.section-card { margin-bottom: 20px; }

.big-number { text-align: center; margin-bottom: 20px; }
.big-value { font-size: 48px; font-weight: 800; }
.big-value.good { color: #059669; }
.big-value.ok { color: #d97706; }
.big-value.bad { color: #dc2626; }
.big-label { font-size: 13px; color: var(--color-text-tertiary); margin-top: 4px; }

.nps-breakdown { margin-top: 16px; }
.nps-row { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 8px; }
.nps-dot { width: 10px; height: 10px; border-radius: 50%; }
.nps-dot.green { background: #67c23a; }
.nps-dot.yellow { background: #e6a23c; }
.nps-dot.red { background: #f56c6c; }

.star-breakdown { margin-top: 16px; }
.star-row { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 8px; }
.star-label { width: 30px; }
.star-count { width: 40px; text-align: right; color: var(--color-text-tertiary); }

.chart-container { height: 280px; }

.text-answer { padding: 12px 0; border-bottom: 1px solid var(--color-border); }
.text-answer:last-child { border-bottom: none; }
.text-meta { font-size: 12px; color: var(--color-text-tertiary); margin-bottom: 8px; }
.text-item { margin-bottom: 8px; }
.text-question { font-size: 13px; color: var(--color-text-secondary); margin-bottom: 2px; }
.text-value { font-size: 14px; color: var(--color-text); }
</style>
