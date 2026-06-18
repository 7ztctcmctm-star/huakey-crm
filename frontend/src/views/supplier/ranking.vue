<template>
  <div class="page-container">
    <div class="page-header"><h2>供应商评估排行</h2></div>

    <!-- 排名表格 -->
    <el-card shadow="never" style="margin-bottom:20px">
      <template #header><span class="card-title">综合排名</span></template>
      <el-table :data="rankingList" stripe border v-loading="loading">
        <el-table-column label="排名" width="70" align="center">
          <template #default="{ $index }">
            <span :class="['rank-badge', $index < 3 ? 'top' : '']">{{ $index + 1 }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="供应商名称" min-width="160">
          <template #default="{ row }"><span class="link-text" @click="$router.push(`/supplier/detail/${row.id}`)">{{ row.name }}</span></template>
        </el-table-column>
        <el-table-column prop="category" label="分类" width="100" />
        <el-table-column prop="rating" label="等级" width="80" align="center">
          <template #default="{ row }"><el-rate :model-value="row.rating" disabled :max="5" /></template>
        </el-table-column>
        <el-table-column label="综合评分" width="100" align="center">
          <template #default="{ row }"><span class="score-value">{{ row.total_score || '-' }}</span></template>
        </el-table-column>
        <el-table-column label="质量" width="80" align="center">
          <template #default="{ row }">{{ row.quality_score || '-' }}</template>
        </el-table-column>
        <el-table-column label="交期" width="80" align="center">
          <template #default="{ row }">{{ row.delivery_score || '-' }}</template>
        </el-table-column>
        <el-table-column label="服务" width="80" align="center">
          <template #default="{ row }">{{ row.service_score || '-' }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 供应商对比 -->
    <el-card shadow="never">
      <template #header>
        <div class="compare-header">
          <span class="card-title">供应商对比</span>
          <div>
            <el-select v-model="compareIds" multiple :multiple-limit="4" placeholder="选择供应商（最多4个）" style="width:400px" @change="fetchCompare">
              <el-option v-for="s in rankingList" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
          </div>
        </div>
      </template>
      <div ref="radarRef" class="chart-container" v-if="compareIds.length > 0"></div>
      <el-empty v-else description="请选择供应商进行对比" :image-size="60" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import request from '@/utils/request'
import echarts from '@/composables/useECharts'

const loading = ref(false)
const rankingList = ref([])
const compareIds = ref([])
const compareData = ref([])
const radarRef = ref(null)

const fetchRanking = async () => {
  loading.value = true
  try {
    const res = await request.get('/supplier/ranking')
    if (res.code === 200) rankingList.value = res.data
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const fetchCompare = async () => {
  if (compareIds.value.length === 0) { compareData.value = []; return }
  try {
    const res = await request.get('/supplier/compare', { params: { ids: compareIds.value.join(',') } })
    if (res.code === 200) {
      compareData.value = res.data
      await nextTick()
      renderRadar()
    }
  } catch (e) { /* */ }
}

const renderRadar = () => {
  if (!radarRef.value || compareData.value.length === 0) return
  const chart = echarts.init(radarRef.value)
  const colors = ['#0071e3', '#34c759', '#ff9500', '#af52de']

  chart.setOption({
    tooltip: {},
    legend: { data: compareData.value.map(s => s.name), bottom: 0 },
    radar: {
      indicator: [
        { name: '质量', max: 100 },
        { name: '交期', max: 100 },
        { name: '服务', max: 100 }
      ],
      radius: '65%'
    },
    series: [{
      type: 'radar',
      data: compareData.value.map((s, idx) => {
        const latest = s.ratings.length > 0 ? s.ratings[s.ratings.length - 1] : {}
        return {
          name: s.name,
          value: [latest.quality_score || 0, latest.delivery_score || 0, latest.service_score || 0],
          lineStyle: { color: colors[idx] },
          areaStyle: { opacity: 0.15, color: colors[idx] },
          itemStyle: { color: colors[idx] }
        }
      })
    }]
  })
}

onMounted(() => { fetchRanking() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.card-title { font-size: 15px; font-weight: 600; }
.compare-header { display: flex; justify-content: space-between; align-items: center; }
.chart-container { height: 380px; }
.rank-badge { display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; font-size: 13px; font-weight: 600; color: #909399; background: #f5f5f5; }
.rank-badge.top { color: #fff; background: linear-gradient(135deg, #f5a623, #f7c948); }
.score-value { font-size: 16px; font-weight: 700; color: var(--color-accent); }
.link-text { color: var(--color-accent); cursor: pointer; }
.link-text:hover { text-decoration: underline; }
</style>
