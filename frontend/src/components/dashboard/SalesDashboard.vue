<template>
  <div class="sales-dashboard">
    <StatsCards
      :overview="overview"
      :finance-data="financeData"
      :purchase-data="purchaseData"
      :service-data="serviceData"
      :quick-stats="quickStats"
      :task-stats="taskStats"
      :follow-stats="followStats"
      :overdue-count="overdueCount"
      :overdue-days="overdueDays"
      :is-admin="false"
      :is-sales="true"
      @quick-action="handleQuickAction"
      @go-tasks="goToTasks"
    />

    <el-row :gutter="24" style="margin-top: 16px">
      <el-col :span="24">
        <el-card shadow="never">
          <template #header>
            <div class="section-header">
              <span class="section-title">
                <el-icon><TrendCharts /></el-icon> 本月业绩进度
              </span>
            </div>
          </template>
          <div class="progress-body">
            <div class="progress-info">
              <span>已成交 ¥{{ formatAmount(overview.month_sales) }}</span>
              <span>目标/商机总额 ¥{{ formatAmount(monthTarget) }}</span>
            </div>
            <el-progress :percentage="achievementRate" :stroke-width="18" status="success" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <PendingTasks
      :today-tasks="todayTasks"
      :follow-loading="followLoading"
      :service-loading="serviceLoading"
      :overdue-count="overdueCount"
      @go-customer="goCustomer"
      @go-follow="goFollow"
      @go-service="goService"
      @handle-service="goService"
    />

    <SalesChart @quick-action="handleQuickAction" />

    <QuickFollowDialog v-model="quickFollowVisible" @success="fetchTodayTasks" />
    <BatchFollowDialog v-model="batchFollowVisible" @success="fetchTodayTasks" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { TrendCharts } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import StatsCards from '@/components/dashboard/StatsCards.vue'
import PendingTasks from '@/components/dashboard/PendingTasks.vue'
import SalesChart from '@/components/dashboard/SalesChart.vue'
import QuickFollowDialog from '@/components/dashboard/QuickFollowDialog.vue'
import BatchFollowDialog from '@/components/dashboard/BatchFollowDialog.vue'
import { formatAmount } from '@/composables/useFormat'
import { getReportOverview, getReportQuickStats, getReportTodayTasks, getReportOverdueStats } from '@/api/report'
import { getFollowUpTaskStats, getOverdueCustomers, getNearRecycleCustomers } from '@/api/customer'

const router = useRouter()

const financeData = reactive({ month_plan: 0, month_paid: 0, month_rate: 0, overdue_amount: 0 })
const purchaseData = reactive({ month_amount: 0, pending_approval: 0, stock_alerts: 0 })
const serviceData = reactive({ pending: 0, overtime: 0, today_new: 0, satisfaction: 0 })
const overview = reactive({ month_sales: '0', month_customers: 0, month_contracts: 0, month_payments: '0', opportunity_amount: '0' })
const quickStats = reactive({ customer_pool: 0, pending_contract: 0, pending_payment: 0 })
const todayTasks = reactive({ follow_list: [], follow_count: 0, service_list: [], service_count: 0 })
const taskStats = reactive({ today_count: 0, tomorrow_count: 0, overdue_count: 0 })
const followStats = reactive({ today_follow: 0, overdue: 0, near_recycle: 0 })
const followLoading = ref(false), serviceLoading = ref(false)
const overdueCount = ref(0), overdueDays = ref(15)
const quickFollowVisible = ref(false), batchFollowVisible = ref(false)

const monthTarget = computed(() => {
  const sales = parseFloat(overview.month_sales) || 0
  const opps = parseFloat(overview.opportunity_amount) || 0
  return sales + opps
})

const achievementRate = computed(() => {
  const target = monthTarget.value
  const sales = parseFloat(overview.month_sales) || 0
  return target > 0 ? Math.min(100, Math.round((sales / target) * 100)) : 0
})

const goCustomer = (id) => router.push(`/customer/detail/${id}`)
const goFollow = (item) => router.push(`/customer/detail/${item.customer_id}`)
const goService = () => router.push('/service')
const goToTasks = (type) => {
  const routes = { today: '/follow-up/today', tomorrow: '/follow-up/tomorrow', overdue: '/follow-up/today' }
  router.push(routes[type] || '/follow-up/today')
}

const handleQuickAction = (action) => {
  if (action === 'add_follow') { quickFollowVisible.value = true; return }
  if (action === 'batch_follow') { batchFollowVisible.value = true; return }
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

const fetchTodayTasks = async () => {
  followLoading.value = true
  serviceLoading.value = true
  try {
    const res = await getReportTodayTasks()
    if (res.code === 200) Object.assign(todayTasks, res.data)
  } catch (e) { console.error('获取今日待办失败:', e) }
  finally { followLoading.value = false; serviceLoading.value = false }
}

const fetchOverdueStats = async () => {
  try {
    const res = await getReportOverdueStats()
    if (res.code === 200) {
      overdueCount.value = res.data.overdue_count
      if (res.data.overdue_days) overdueDays.value = res.data.overdue_days
    }
  } catch { ElMessage.error('加载逾期数据失败') }
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

const fetchFollowStats = async () => {
  try {
    const [taskRes, overdueRes, nearRes] = await Promise.all([
      getFollowUpTaskStats(),
      getOverdueCustomers({ page: 1, pageSize: 1 }),
      getNearRecycleCustomers({ page: 1, pageSize: 1 })
    ])
    if (taskRes.code === 200) {
      followStats.today_follow = taskRes.data.today_count || 0
    }
    if (overdueRes.code === 200) {
      followStats.overdue = overdueRes.data.total || 0
    }
    if (nearRes.code === 200) {
      followStats.near_recycle = nearRes.data.total || 0
    }
  } catch { /* */ }
}

const load = () => {
  fetchOverview()
  fetchQuickStats()
  fetchTodayTasks()
  fetchOverdueStats()
  fetchTaskStats()
  fetchFollowStats()
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
.progress-body {
  padding: 8px 0;
}
.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--color-text-secondary);
}
</style>
