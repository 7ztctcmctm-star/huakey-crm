<template>
  <div class="sales-analytics">
    <!-- 加载/错误/空状态 -->
    <el-alert v-if="error" type="error" :title="error" show-icon closable @close="error = ''" style="margin-bottom: 12px" />
    <div v-loading="loading">
      <EmptyState v-if="!loading && empty" title="暂无销售分析数据" />
      <template v-else>
        <!-- 1. 商机漏斗（ECharts；PRD R-05：stage 1→6 转化，配色取自 chartTheme，点击下钻商机列表） -->
        <el-card class="analytics-card">
          <template #header>
            <div class="section-header">
              <span class="section-title"><el-icon><TrendCharts /></el-icon> 商机漏斗</span>
              <span class="section-hint">点击某一阶段可下钻查看对应商机（只读）</span>
            </div>
          </template>
          <el-row :gutter="16">
            <el-col :span="8">
              <div class="kpi-item"><div class="kpi-label">商机总数</div><div class="kpi-value">{{ totalCount }}</div></div>
            </el-col>
            <el-col :span="8">
              <div class="kpi-item"><div class="kpi-label">商机金额</div><div class="kpi-value">¥{{ formatAmount(totalAmount) }}</div></div>
            </el-col>
            <el-col :span="8">
              <div class="kpi-item"><div class="kpi-label">Win Rate</div><div class="kpi-value">{{ winRate }}%</div></div>
            </el-col>
          </el-row>
          <div v-show="funnelStages.length" ref="funnelChartRef" class="funnel-chart" />
          <EmptyState v-if="!funnelStages.length" title="暂无漏斗数据" />
        </el-card>

        <!-- 2. 合同收入 -->
        <el-card class="analytics-card">
          <template #header>
            <div class="section-header">
              <span class="section-title"><el-icon><Document /></el-icon> 合同收入</span>
            </div>
          </template>
          <el-descriptions :column="4" size="small">
            <el-descriptions-item label="合同总额">¥{{ formatAmount(revenue.total_amount) }}</el-descriptions-item>
            <el-descriptions-item label="生效金额">¥{{ formatAmount(revenue.active_amount) }}</el-descriptions-item>
            <el-descriptions-item label="完成金额">¥{{ formatAmount(revenue.completed_amount) }}</el-descriptions-item>
            <el-descriptions-item label="取消金额">¥{{ formatAmount(revenue.cancelled_amount) }}</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <!-- 3. 回款情况 -->
        <el-card class="analytics-card">
          <template #header>
            <div class="section-header">
              <span class="section-title"><el-icon><Wallet /></el-icon> 回款情况</span>
            </div>
          </template>
          <el-row :gutter="16">
            <el-col :span="6"><div class="kpi-item"><div class="kpi-label">应收</div><div class="kpi-value">¥{{ formatAmount(collection.receivable_amount) }}</div></div></el-col>
            <el-col :span="6"><div class="kpi-item"><div class="kpi-label">已收</div><div class="kpi-value text-success">¥{{ formatAmount(collection.received_amount) }}</div></div></el-col>
            <el-col :span="6"><div class="kpi-item"><div class="kpi-label">未收</div><div class="kpi-value">¥{{ formatAmount(collection.outstanding_amount) }}</div></div></el-col>
            <el-col :span="6"><div class="kpi-item"><div class="kpi-label">逾期</div><div class="kpi-value text-danger">¥{{ formatAmount(collection.overdue_amount) }}</div></div></el-col>
          </el-row>
          <div class="collection-rate" style="margin-top: 12px">
            <span>回款率 {{ collection.collection_rate || 0 }}%</span>
            <el-progress :percentage="Number(collection.collection_rate) || 0" :stroke-width="12" status="success" />
          </div>
        </el-card>
      </template>
    </div>
  </div>
</template>

<script setup>
import EmptyState from '@/components/common/EmptyState.vue'
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { TrendCharts, Document, Wallet } from '@element-plus/icons-vue'
import { getAnalyticsOverview, getAnalyticsFunnel, getAnalyticsContractRevenue, getAnalyticsPaymentCollection } from '@/api/analytics'
import { formatAmount } from '@/composables/useFormat'
import { useChart } from '@/composables/useChart'
import { chartColors, presetColors, cssVar } from '@/utils/chartTheme'

const router = useRouter()
// ⚠️ 必须解构出 ref（项目既定可用写法）：Vue 3 的字符串 ref 只在「同名 setup 绑定」上赋值，
// 若只拿 `refs` 对象再写 ref="funnelChartRef"，元素不会写回 refs[name].value，
// initChart 拿到 null → 图表静默不渲染（本组件首版即踩此坑，浏览器实测 canvas=0）。
const { refs: { funnelChartRef }, initChart, getChart } = useChart('funnelChartRef')

const loading = ref(false)
const error = ref('')
const overview = ref({})
const funnel = ref({ stages: [], win_rate: 0 })
const revenue = ref({})
const collection = ref({})

const totalCount = computed(() => funnel.value.stages?.reduce((s, r) => s + (r.count || 0), 0) || 0)
const totalAmount = computed(() => funnel.value.stages?.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0) || 0)
const winRate = computed(() => funnel.value.win_rate ?? 0)
const funnelStages = computed(() => funnel.value.stages || [])
const empty = computed(() => !overview.value.opportunity_amount && !revenue.value.total_amount && !collection.value.receivable_amount)

/**
 * 渲染商机漏斗（ECharts）
 * 约定：配色全部来自 chartTheme（R-05 验收：组件内不得写死 HEX）；
 *      数据顺序保持 stage 1→6，故 sort: 'none'（不按数值重排，业务语义上从宽到窄递减）。
 */
function renderFunnel() {
  const stages = funnelStages.value
  if (!stages.length) return

  const option = {
    color: presetColors(Math.max(stages.length, 1)),
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const amount = p.data?.amount
        return `${p.name}<br/>商机数 ${p.value} 个<br/>金额 ¥${formatAmount(amount)}`
      }
    },
    series: [
      {
        type: 'funnel',
        left: '8%',
        right: '8%',
        top: 8,
        bottom: 8,
        minSize: '24%',
        maxSize: '100%',
        sort: 'none',
        gap: 2,
        label: {
          show: true,
          position: 'inside',
          color: cssVar('--color-white', '#ffffff'),
          formatter: (p) => `${p.name}  ${p.value}`
        },
        itemStyle: { borderColor: chartColors.bg, borderWidth: 2 },
        emphasis: { label: { fontWeight: 'bold' } },
        data: stages.map((s) => ({
          name: s.stage_name,
          value: s.count,
          amount: s.amount,
          stage: s.stage
        }))
      }
    ]
  }

  const chart = initChart('funnelChartRef', option)
  // 点击阶段下钻到商机列表（预置阶段筛选，只读；数据范围仍由后端强制）
  // 兼容两种事件载荷：优先取 data.stage，缺失时按 dataIndex 回查（不同 ECharts 版本 data 可能为空）
  chart?.off('click')
  chart?.on('click', (params) => {
    const stage = params?.data?.stage ?? stages[params?.dataIndex]?.stage
    if (stage) router.push({ path: '/opportunity', query: { stage } })
  })
}

async function fetchAll() {
  loading.value = true
  error.value = ''
  try {
    const [ov, fu, rev, col] = await Promise.all([
      getAnalyticsOverview(), getAnalyticsFunnel(), getAnalyticsContractRevenue(), getAnalyticsPaymentCollection()
    ])
    overview.value = ov.data || {}
    funnel.value = fu.data || { stages: [], win_rate: 0 }
    revenue.value = rev.data || {}
    collection.value = col.data || {}
    await nextTick()
    renderFunnel()
  } catch (e) {
    error.value = e?.response?.data?.message || e?.message || '销售分析加载失败'
    /* log ignored */
  } finally {
    loading.value = false
  }
}

onMounted(fetchAll)
defineExpose({ fetchAll, getChart })
</script>

<style scoped>
.analytics-card { margin-bottom: 16px; }
.section-header { display: flex; align-items: center; gap: 12px; }
.section-title { font-weight: 600; display: flex; align-items: center; gap: 6px; }
.section-hint { font-size: 12px; color: var(--color-text-secondary); }
.kpi-item { text-align: center; padding: 8px 0; }
.kpi-label { font-size: 12px; color: var(--color-text-secondary); margin-bottom: 4px; }
.kpi-value { font-size: 20px; font-weight: 600; }
.collection-rate { display: flex; align-items: center; gap: 12px; }
.collection-rate span { min-width: 100px; font-size: 13px; color: var(--color-text-secondary); }
.funnel-chart { width: 100%; height: 260px; margin-top: 8px; }
</style>
