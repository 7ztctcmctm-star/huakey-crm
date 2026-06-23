<template>
  <div class="page-container">
    <div class="page-header"><h2>经营分析看板</h2></div>

    <!-- KPI 卡片 -->
    <div class="kpi-grid">
      <div class="kpi-card" v-for="k in kpiCards" :key="k.key">
        <div class="kpi-label">{{ k.label }}</div>
        <div class="kpi-value">{{ k.value }}</div>
        <div class="kpi-change" v-if="k.change !== undefined">
          <span :class="k.change >= 0 ? 'up' : 'down'">{{ k.change >= 0 ? '↑' : '↓' }}{{ Math.abs(k.change) }}%</span>
          <span class="kpi-change-label">环比</span>
        </div>
      </div>
    </div>

    <!-- 趋势图 -->
    <el-row :gutter="20" style="margin-bottom:20px">
      <el-col :span="8">
        <el-card shadow="never"><template #header><span class="card-title">客户增长</span></template><div ref="customerTrendRef" class="chart-sm"></div></el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never"><template #header><span class="card-title">合同增长</span></template><div ref="contractTrendRef" class="chart-sm"></div></el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never"><template #header><span class="card-title">回款增长</span></template><div ref="paymentTrendRef" class="chart-sm"></div></el-card>
      </el-col>
    </el-row>

    <!-- 客户分布 + 销售排名 -->
    <el-row :gutter="20" style="margin-bottom:20px">
      <el-col :span="10">
        <el-card shadow="never"><template #header><span class="card-title">客户等级分布</span></template><div ref="levelDistRef" class="chart-md"></div></el-card>
      </el-col>
      <el-col :span="14">
        <el-card shadow="never"><template #header><span class="card-title">销售团队排名（本月）</span></template><div ref="rankingRef" class="chart-md"></div></el-card>
      </el-col>
    </el-row>

    <!-- 销售员业绩明细 -->
    <el-card shadow="never" style="margin-bottom:20px">
      <template #header><span class="card-title">销售员业绩明细（本月）</span></template>
      <el-table :data="sellerDetails" stripe size="small" @sort-change="handleSellerSort">
        <el-table-column prop="real_name" label="销售员" width="100">
          <template #default="{ row }">
            <el-link type="primary" @click="$router.push({ path: '/customer/list', query: { owner_id: row.id } })">{{ row.real_name }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="contract_amount" label="签单额" width="120" align="right" sortable="custom">
          <template #default="{ row }">¥{{ Number(row.contract_amount || 0).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="payment_amount" label="回款额" width="120" align="right" sortable="custom">
          <template #default="{ row }">¥{{ Number(row.payment_amount || 0).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="customer_count" label="客户数" width="80" align="center" />
        <el-table-column prop="opp_count" label="商机数" width="80" align="center" />
        <el-table-column label="目标完成率" width="120" align="center">
          <template #default="{ row }">
            <el-progress :percentage="Math.min(Math.round((row.contract_amount || 0) / (row.target_amount || 1) * 100), 999)" :stroke-width="14" :text-inside="true" :show-text="false" style="width:80px;display:inline-block" />
            <span style="font-size:12px;margin-left:4px">{{ Math.round((row.contract_amount || 0) / (row.target_amount || 1) * 100) }}%</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 预警信息 -->
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span class="card-title">逾期未回款</span></template>
          <el-table :data="warnings.overdue_payments || []" stripe size="small" max-height="300">
            <el-table-column prop="contract_no" label="合同编号" width="130" />
            <el-table-column prop="company_name" label="客户" min-width="120" show-overflow-tooltip />
            <el-table-column prop="unpaid" label="未回款" width="100" align="right">
              <template #default="{ row }">¥{{ Number(row.unpaid).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="days" label="天数" width="70" align="center">
              <template #default="{ row }"><el-tag type="danger" size="small">{{ row.days }}</el-tag></template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span class="card-title">长期未跟进客户</span></template>
          <el-table :data="warnings.overdue_customers || []" stripe size="small" max-height="300">
            <el-table-column prop="company_name" label="客户名称" min-width="140">
              <template #default="{ row }"><span class="link-text" @click="$router.push(`/customer/detail/${row.id}`)">{{ row.company_name }}</span></template>
            </el-table-column>
            <el-table-column prop="last_follow_time" label="最后跟进" width="140">
              <template #default="{ row }">{{ row.last_follow_time || '从未跟进' }}</template>
            </el-table-column>
            <el-table-column prop="days" label="天数" width="70" align="center">
              <template #default="{ row }"><el-tag type="warning" size="small">{{ row.days || '30+' }}</el-tag></template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { getReportBusiness } from '@/api/report'
import echarts from '@/composables/useECharts'

const data = ref({ kpi: {}, teamRanking: [], distribution: { level: [], industry: [] }, trends: { customer: [], contract: [], payment: [] }, warnings: {} })
const customerTrendRef = ref(null)
const contractTrendRef = ref(null)
const paymentTrendRef = ref(null)
const levelDistRef = ref(null)
const rankingRef = ref(null)

const kpiCards = computed(() => {
  const k = data.value.kpi
  return [
    { key: 'customer_total', label: '客户总数', value: k.customer_total || 0, change: k.customer_new_change },
    { key: 'customer_new', label: '本月新增', value: k.customer_new || 0, change: k.customer_new_change },
    { key: 'contract_amount', label: '本月合同', value: '¥' + Number(k.contract_amount || 0).toLocaleString(), change: k.contract_amount_change },
    { key: 'payment_rate', label: '回款率', value: (k.payment_rate || 0) + '%' },
    { key: 'avg_price', label: '客单价', value: '¥' + Number(k.avg_unit_price || 0).toLocaleString() },
    { key: 'conversion', label: '转化率', value: (k.conversion_rate || 0) + '%' }
  ]
})

const warnings = computed(() => data.value.warnings || {})
const sellerDetails = ref([])

const handleSellerSort = ({ prop, order }) => {
  if (!prop) return
  sellerDetails.value.sort((a, b) => {
    const va = Number(a[prop] || 0), vb = Number(b[prop] || 0)
    return order === 'ascending' ? va - vb : vb - va
  })
}

const fetchData = async () => {
  try {
    const res = await getReportBusiness()
    if (res.code === 200) {
      data.value = res.data
      sellerDetails.value = res.data.sellerDetails || []
      await nextTick()
      renderCharts()
    }
  } catch (e) { /* */ }
}

const renderSmallTrend = (el, items, color, name) => {
  if (!el) return
  const chart = echarts.init(el)
  chart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 10, top: 10, bottom: 20 },
    xAxis: { type: 'category', data: items.map(i => i.month), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
    series: [{ name, type: 'line', smooth: true, data: items.map(i => i.count || i.amount || 0), areaStyle: { opacity: 0.15 }, itemStyle: { color } }]
  })
}

const renderCharts = () => {
  const t = data.value.trends
  renderSmallTrend(customerTrendRef.value, t.customer || [], '#0071e3', '客户')
  renderSmallTrend(contractTrendRef.value, (t.contract || []).map(c => ({ month: c.month, count: c.amount })), '#34c759', '合同金额')
  renderSmallTrend(paymentTrendRef.value, (t.payment || []).map(p => ({ month: p.month, count: p.amount })), '#ff9500', '回款金额')

  // 客户等级饼图
  if (levelDistRef.value) {
    const chart = echarts.init(levelDistRef.value)
    chart.setOption({
      tooltip: { trigger: 'item' },
      series: [{ type: 'pie', radius: ['40%', '70%'], data: data.value.distribution.level || [], label: { show: true, formatter: '{b}: {c}' } }]
    })
  }

  // 销售排名
  if (rankingRef.value) {
    const chart = echarts.init(rankingRef.value)
    const ranking = (data.value.teamRanking || []).reverse()
    chart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 80, right: 20, top: 10, bottom: 20 },
      xAxis: { type: 'value', axisLabel: { formatter: (v) => v >= 10000 ? (v / 10000) + '万' : v } },
      yAxis: { type: 'category', data: ranking.map(r => r.real_name) },
      series: [{ type: 'bar', data: ranking.map(r => r.contract_amount), itemStyle: { color: '#0071e3', borderRadius: [0, 4, 4, 0] } }]
    })
  }
}

onMounted(() => { fetchData() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }

.kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; margin-bottom: 20px; }
.kpi-card { background: #fff; border-radius: 16px; padding: 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.kpi-label { font-size: 12px; color: var(--color-text-tertiary); margin-bottom: 6px; }
.kpi-value { font-size: 22px; font-weight: 700; color: var(--color-text); margin-bottom: 4px; }
.kpi-change { font-size: 12px; display: flex; align-items: center; gap: 4px; }
.kpi-change .up { color: #34c759; }
.kpi-change .down { color: #f56c6c; }
.kpi-change-label { color: var(--color-text-tertiary); }

.card-title { font-size: 15px; font-weight: 600; }
.chart-sm { height: 200px; }
.chart-md { height: 280px; }
.link-text { color: var(--color-accent); cursor: pointer; }
.link-text:hover { text-decoration: underline; }

@media (max-width: 1200px) { .kpi-grid { grid-template-columns: repeat(3, 1fr); } }
</style>
