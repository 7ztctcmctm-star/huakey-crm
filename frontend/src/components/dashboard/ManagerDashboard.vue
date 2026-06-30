<template>
  <div class="manager-dashboard">
    <StatsCards
      :overview="overview"
      :finance-data="financeData"
      :purchase-data="purchaseData"
      :service-data="serviceData"
      :quick-stats="quickStats"
      :task-stats="taskStats"
      :overdue-count="overdueCount"
      :overdue-days="overdueDays"
      :is-admin="true"
      :is-sales="false"
      @quick-action="handleQuickAction"
      @go-tasks="goToTasks"
    />

    <el-row :gutter="24" style="margin-top: 16px">
      <el-col :span="24">
        <el-card shadow="never">
          <template #header>
            <div class="section-header">
              <span class="section-title">
                <el-icon><Trophy /></el-icon> 团队业绩排行
              </span>
            </div>
          </template>
          <el-table :data="ranking" stripe size="small" v-loading="rankingLoading">
            <el-table-column type="index" label="排名" width="60" align="center" />
            <el-table-column prop="real_name" label="销售" min-width="100" />
            <el-table-column prop="dept_name" label="部门" min-width="100" />
            <el-table-column prop="customer_count" label="客户数" width="90" align="right" />
            <el-table-column prop="contract_amount" label="本月合同额" width="130" align="right">
              <template #default="{ row }">¥{{ formatAmount(row.contract_amount) }}</template>
            </el-table-column>
            <el-table-column prop="payment_amount" label="本月回款" width="130" align="right">
              <template #default="{ row }">¥{{ formatAmount(row.payment_amount) }}</template>
            </el-table-column>
            <el-table-column prop="target_achievement" label="目标达成" width="110" align="right">
              <template #default="{ row }">
                <span :class="row.target_achievement >= 100 ? 'success' : 'warning'">{{ row.target_achievement }}%</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { Trophy } from '@element-plus/icons-vue'
import StatsCards from '@/components/dashboard/StatsCards.vue'
import { formatAmount } from '@/composables/useFormat'
import { getReportOverview, getReportQuickStats, getReportTodayTasks, getReportOverdueStats } from '@/api/report'
import { getFollowUpTaskStats } from '@/api/customer'
import { getTeamOverview, getSalesBreakdown } from '@/api/system'

const router = useRouter()

const financeData = reactive({ month_plan: 0, month_paid: 0, month_rate: 0, overdue_amount: 0 })
const purchaseData = reactive({ month_amount: 0, pending_approval: 0, stock_alerts: 0 })
const serviceData = reactive({ pending: 0, overtime: 0, today_new: 0, satisfaction: 0 })
const overview = reactive({ month_sales: '0', month_customers: 0, month_contracts: 0, month_payments: '0', opportunity_amount: '0' })
const quickStats = reactive({ customer_pool: 0, pending_contract: 0, pending_payment: 0 })
const taskStats = reactive({ today_count: 0, tomorrow_count: 0, overdue_count: 0 })
const overdueCount = ref(0), overdueDays = ref(15)
const ranking = ref([])
const rankingLoading = ref(false)

const goToTasks = (type) => {
  const routes = { today: '/follow-up/today', tomorrow: '/follow-up/tomorrow', overdue: '/follow-up/today' }
  router.push(routes[type] || '/follow-up/today')
}

const handleQuickAction = (action) => {
  const routes = {
    sales: '/report', customer: '/customer/list', contract: '/contract', payment: '/payment',
    add_customer: '/customer/list?action=add', add_opportunity: '/opportunity?action=add',
    add_contract: '/contract?action=add', add_service: '/service?action=add', report: '/report'
  }
  router.push(routes[action] || '/')
}

const fetchOverview = async () => {
  try {
    const res = await getReportOverview()
    if (res.code === 200) Object.assign(overview, res.data)
  } catch (e) { console.error('获取概览失败:', e) }
}

const fetchQuickStats = async () => {
  try {
    const res = await getReportQuickStats()
    if (res.code === 200) Object.assign(quickStats, res.data)
  } catch (e) { console.error('获取快捷统计失败:', e) }
}

const fetchTaskStats = async () => {
  try {
    const res = await getFollowUpTaskStats()
    if (res.code === 200) {
      taskStats.today_count = res.data.today_count || 0
      taskStats.tomorrow_count = res.data.tomorrow_count || 0
      taskStats.overdue_count = res.data.overdue_count || 0
    }
  } catch { /* */ }
}

const fetchOverdueStats = async () => {
  try {
    const res = await getReportOverdueStats()
    if (res.code === 200) {
      overdueCount.value = res.data.overdue_count
      if (res.data.overdue_days) overdueDays.value = res.data.overdue_days
    }
  } catch { /* */ }
}

const fetchTeamRanking = async () => {
  rankingLoading.value = true
  try {
    const res = await getSalesBreakdown()
    if (res.code === 200) {
      ranking.value = (res.data || [])
        .slice()
        .sort((a, b) => b.contract_amount - a.contract_amount)
        .slice(0, 10)
    }
  } catch (e) { console.error('获取团队排行失败:', e) }
  finally { rankingLoading.value = false }
}

const load = () => {
  fetchOverview()
  fetchQuickStats()
  fetchTaskStats()
  fetchOverdueStats()
  fetchTeamRanking()
}

onMounted(() => load())
onActivated(() => load())
</script>

<style scoped>
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
}
.success { color: var(--color-success); font-weight: 600; }
.warning { color: var(--color-warning); font-weight: 600; }
</style>
