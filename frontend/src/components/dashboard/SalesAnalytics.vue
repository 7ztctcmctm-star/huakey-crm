<template>
  <div class="sales-analytics">
    <!-- 加载/错误/空状态 -->
    <el-alert v-if="error" type="error" :title="error" show-icon closable @close="error = ''" style="margin-bottom: 12px" />
    <div v-loading="loading">
      <el-empty v-if="!loading && empty" description="暂无销售分析数据" />
      <template v-else>
        <!-- 1. 销售漏斗 -->
        <el-card shadow="never" class="analytics-card">
          <template #header>
            <div class="section-header">
              <span class="section-title"><el-icon><TrendCharts /></el-icon> 销售漏斗</span>
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
          <div v-for="s in funnelStages" :key="s.stage" class="funnel-row">
            <span class="funnel-stage">{{ s.stage_name }}</span>
            <span class="funnel-count">{{ s.count }}</span>
            <span class="funnel-amount">¥{{ formatAmount(s.amount) }}</span>
          </div>
        </el-card>

        <!-- 2. 合同收入 -->
        <el-card shadow="never" class="analytics-card">
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
        <el-card shadow="never" class="analytics-card">
          <template #header>
            <div class="section-header">
              <span class="section-title"><el-icon><Wallet /></el-icon> 回款情况</span>
            </div>
          </template>
          <el-row :gutter="16">
            <el-col :span="6"><div class="kpi-item"><div class="kpi-label">应收</div><div class="kpi-value">¥{{ formatAmount(collection.receivable_amount) }}</div></div></el-col>
            <el-col :span="6"><div class="kpi-item"><div class="kpi-label">已收</div><div class="kpi-value" style="color:#67c23a">¥{{ formatAmount(collection.received_amount) }}</div></div></el-col>
            <el-col :span="6"><div class="kpi-item"><div class="kpi-label">未收</div><div class="kpi-value">¥{{ formatAmount(collection.outstanding_amount) }}</div></div></el-col>
            <el-col :span="6"><div class="kpi-item"><div class="kpi-label">逾期</div><div class="kpi-value" style="color:#f56c6c">¥{{ formatAmount(collection.overdue_amount) }}</div></div></el-col>
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
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { TrendCharts, Document, Wallet } from '@element-plus/icons-vue'
import { getAnalyticsOverview, getAnalyticsFunnel, getAnalyticsContractRevenue, getAnalyticsPaymentCollection } from '@/api/analytics'
import { formatAmount } from '@/composables/useFormat'

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
  } catch (e) {
    error.value = e?.response?.data?.message || e?.message || '销售分析加载失败'
    console.error('[Analytics] fetch failed:', e)
  } finally {
    loading.value = false
  }
}

onMounted(fetchAll)
defineExpose({ fetchAll })
</script>

<style scoped>
.analytics-card { margin-bottom: 16px; }
.section-header { display: flex; align-items: center; }
.section-title { font-weight: 600; display: flex; align-items: center; gap: 6px; }
.kpi-item { text-align: center; padding: 8px 0; }
.kpi-label { font-size: 12px; color: #909399; margin-bottom: 4px; }
.kpi-value { font-size: 20px; font-weight: 600; }
.collection-rate { display: flex; align-items: center; gap: 12px; }
.collection-rate span { min-width: 100px; font-size: 13px; color: #606266; }
.funnel-row { display: flex; padding: 8px 4px; border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5); align-items: center; }
.funnel-row:last-child { border-bottom: none; }
.funnel-stage { flex: 1; font-size: 13px; color: #606266; }
.funnel-count { width: 60px; text-align: right; font-weight: 600; margin-right: 16px; }
.funnel-amount { width: 120px; text-align: right; color: #303133; }
</style>
