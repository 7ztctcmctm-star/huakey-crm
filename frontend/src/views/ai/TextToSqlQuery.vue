<template>
  <el-card class="query-card" shadow="never">
    <template #header>
      <div class="query-card-header">
        <span class="query-title">自然语言查询（Text-to-SQL）</span>
        <el-tag v-if="statusKnown" :type="statusOnline ? 'success' : 'info'" size="small">
          {{ statusOnline ? 'AI 服务在线' : 'AI 服务离线' }}
        </el-tag>
      </div>
    </template>

    <!-- PRD §4.3 安全提示：仅查询权限范围内的数据 -->
    <el-alert
      class="safety-hint"
      type="warning"
      :closable="false"
      show-icon
      title="仅查询你权限范围内的数据"
      description="AI 查询仅限「商机 / 客户（只读）/ 合同」维度，且仅支持 SELECT；生成非查询语句将自动降级。"
    />

    <div class="query-input">
      <el-input
        v-model="question"
        placeholder="例如：本季度签单金额最高的前 10 个合同"
        :disabled="querying"
        @keyup.enter="handleQuery"
      />
      <el-button type="primary" :loading="querying" :disabled="!question.trim()" @click="handleQuery">
        查询
      </el-button>
    </div>

    <!-- 异常 / 降级提示 -->
    <el-alert
      v-if="queryError"
      class="result-alert"
      type="error"
      :closable="false"
      show-icon
      :title="queryError"
    />
    <!-- 降级（有提示语但无 SQL） -->
    <el-alert
      v-else-if="queryResult && !queryResult.sql && queryResult.answer"
      class="result-alert"
      type="info"
      :closable="false"
      show-icon
      :title="queryResult.answer"
    />

    <template v-if="queryResult && queryResult.sql">
      <!-- 生成的 SQL 可折叠 -->
      <el-collapse v-model="sqlCollapsed" class="sql-collapse">
        <el-collapse-item name="sql">
          <template #title>
            <span class="sql-title">生成的 SQL
              <el-tag size="small" type="success" effect="plain">SELECT</el-tag>
            </span>
          </template>
          <pre class="sql-block">{{ queryResult.sql }}</pre>
        </el-collapse-item>
      </el-collapse>

      <!-- 图表建议 -->
      <el-alert
        v-if="chartSuggestion"
        class="result-alert"
        :type="chartSuggestion.type === 'table' ? 'info' : 'success'"
        :closable="false"
        show-icon
        :title="'图表建议：' + chartTypeLabel"
        :description="chartSuggestion.reason"
      />

      <!-- 图表预览（仅 bar/pie/line） -->
      <div v-if="showChart" :ref="el => setChartRef(el)" class="result-chart"></div>

      <!-- 结果表格 -->
      <div v-if="resultColumns.length" class="result-table">
        <el-table :data="queryResult.rows" size="small" border max-height="360" stripe>
          <el-table-column
            v-for="col in resultColumns"
            :key="col"
            :prop="col"
            :label="col"
            show-overflow-tooltip
          />
        </el-table>
        <div class="result-meta">共 {{ queryResult.total || queryResult.rows.length }} 条（预览前 {{ queryResult.rows.length }} 条）</div>
      </div>
      <div v-else class="empty-result">（查询结果为空）</div>
    </template>
  </el-card>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { aiQuery, getAiStatus } from '@/api/ai'
import { reportError } from '@/utils/error'
import { useChart } from '@/composables/useChart'
import { chartPalette } from '@/utils/chartTheme'

const { refs, initChart } = useChart('resultChartRef')

const question = ref('')
const querying = ref(false)
const queryError = ref('')
const queryResult = ref(null)
const sqlCollapsed = ref(['sql'])

const statusOnline = ref(false)
const statusKnown = ref(false)

const resultColumns = computed(() =>
  queryResult.value?.rows?.length ? Object.keys(queryResult.value.rows[0]) : []
)

const chartSuggestion = computed(() => queryResult.value?.chartSuggestion || null)

const chartTypeLabel = computed(() => {
  const map = { bar: '柱状图', pie: '饼图', line: '折线图', table: '表格' }
  return chartSuggestion.value ? (map[chartSuggestion.value.type] || '表格') : ''
})

const showChart = computed(() =>
  chartSuggestion.value &&
  ['bar', 'pie', 'line'].includes(chartSuggestion.value.type) &&
  resultColumns.value.length > 0
)

function setChartRef(el) {
  if (el) refs.resultChartRef.value = el
}

function buildChartOption(result) {
  const rows = result.rows
  const cols = resultColumns.value
  const numericCols = cols.filter(c => rows.every(r => r[c] == null || /^-?\d+(\.\d+)?$/.test(String(r[c]))))
  const dim = cols.find(c => !numericCols.includes(c)) || cols[0]
  const measure = numericCols[0] || cols[1] || cols[0]
  const palette = chartPalette()
  const categories = rows.map(r => String(r[dim]))
  const values = rows.map(r => Number(r[measure]) || 0)
  const type = chartSuggestion.value?.type

  if (type === 'pie') {
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [{
        type: 'pie',
        radius: '60%',
        data: rows.map((r, i) => ({ name: String(r[dim]), value: Number(r[measure]) || 0, itemStyle: { color: palette[i % palette.length] } }))
      }]
    }
  }
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 48, right: 16, top: 24, bottom: 32 },
    xAxis: { type: 'category', data: categories },
    yAxis: { type: 'value' },
    series: [{
      type: type === 'line' ? 'line' : 'bar',
      data: values,
      itemStyle: { color: palette[0] },
      areaStyle: type === 'line' ? { color: palette[0] } : undefined
    }]
  }
}

watch(showChart, async (visible) => {
  if (visible && queryResult.value) {
    await nextTick()
    initChart('resultChartRef', buildChartOption(queryResult.value))
  }
})

const handleQuery = async () => {
  const q = question.value.trim()
  if (!q) {
    queryError.value = '请输入查询问题'
    return
  }
  querying.value = true
  queryError.value = ''
  queryResult.value = null
  try {
    const res = await aiQuery({ question: q })
    if (res && res.code === 200 && res.data) {
      queryResult.value = res.data
      if (!res.data.sql && res.data.answer) {
        queryError.value = '' // 降级信息由 info alert 展示
      }
    } else {
      queryError.value = (res && res.message) || '查询失败，请稍后重试'
    }
  } catch (e) {
    // 503 / 网络异常 → 降级提示
    queryError.value =
      (e && e.response && e.response.data && e.response.data.message) ||
      (e && e.message) ||
      'AI 查询服务暂时不可用，请稍后重试'
    reportError(e)
  } finally {
    querying.value = false
  }
}

onMounted(async () => {
  try {
    const res = await getAiStatus()
    statusKnown.value = true
    statusOnline.value = !!(res && res.data && res.data.online)
  } catch {
    statusKnown.value = true
    statusOnline.value = false
  }
})
</script>

<style scoped>
.query-card { margin-bottom: var(--space-5); }
.query-card-header { display: flex; align-items: center; justify-content: space-between; }
.query-title { font-weight: 600; font-size: 16px; color: var(--color-text); }
.safety-hint { margin-bottom: var(--space-4); }
.query-input { display: flex; gap: var(--space-2); margin-bottom: var(--space-3); }
.query-input .el-input { flex: 1; }
.result-alert { margin-top: var(--space-3); }
.sql-collapse { margin-top: var(--space-3); }
.sql-title { font-weight: 500; display: flex; align-items: center; gap: 8px; }
.sql-block {
  margin: 0;
  padding: var(--space-3);
  background: var(--color-bg);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  font-family: monospace;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--color-text-secondary);
}
.result-chart { width: 100%; height: 280px; margin-top: var(--space-3); }
.result-table { margin-top: var(--space-3); }
.result-meta { margin-top: 8px; font-size: 12px; color: var(--color-text-tertiary); }
.empty-result { margin-top: var(--space-3); color: var(--color-text-tertiary); font-size: 13px; }
</style>
