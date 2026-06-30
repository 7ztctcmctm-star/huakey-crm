<template>
  <div class="dashboard">
    <StatsCards
      :overview="overview"
      :finance-data="financeData"
      :purchase-data="purchaseData"
      :service-data="serviceData"
      :quick-stats="quickStats"
      :task-stats="taskStats"
      :overdue-count="overdueCount"
      :overdue-days="overdueDays"
      :is-admin="isAdmin"
      :is-sales="isSales"
      :is-finance="isFinance"
      :is-purchase="isPurchase"
      :is-service="isService"
      @quick-action="handleQuickAction"
      @go-tasks="goToTasks"
    />
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
    <SalesChart v-if="isAdmin || isSales" @quick-action="handleQuickAction" />
    <QuickFollowDialog v-model="quickFollowVisible" @success="fetchTodayTasks" />
    <BatchFollowDialog v-model="batchFollowVisible" @success="fetchTodayTasks" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getPaymentList } from '@/api/contract'
import { getInventoryAlerts, getProcurementStats } from '@/api/product'
import { getReportOverview, getReportQuickStats, getReportTodayTasks, getReportOverdueStats } from '@/api/report'
import { getFollowUpTaskStats } from '@/api/customer'
import StatsCards from '@/components/dashboard/StatsCards.vue'
import PendingTasks from '@/components/dashboard/PendingTasks.vue'
import SalesChart from '@/components/dashboard/SalesChart.vue'
import QuickFollowDialog from '@/components/dashboard/QuickFollowDialog.vue'
import BatchFollowDialog from '@/components/dashboard/BatchFollowDialog.vue'

const router = useRouter()

const userInfo = computed(() => {
  try { return JSON.parse(localStorage.getItem('userInfo') || '{}') } catch { return {} }
})
const roleId = computed(() => userInfo.value.roleId || 0)
const isAdmin = computed(() => roleId.value === 1 || roleId.value === 2)
const isSales = computed(() => roleId.value === 3)
const isFinance = computed(() => roleId.value === 4)
const isPurchase = computed(() => roleId.value === 5)
const isService = computed(() => roleId.value === 6)

const financeData = reactive({ month_plan: 0, month_paid: 0, month_rate: 0, overdue_amount: 0 })
const purchaseData = reactive({ month_amount: 0, pending_approval: 0, stock_alerts: 0 })
const serviceData = reactive({ pending: 0, overtime: 0, today_new: 0, satisfaction: 0 })
const overview = reactive({ month_sales: '0', month_customers: 0, month_contracts: 0, month_payments: '0', opportunity_amount: '0' })
const quickStats = reactive({ customer_pool: 0, pending_contract: 0, pending_payment: 0 })
const todayTasks = reactive({ follow_list: [], follow_count: 0, service_list: [], service_count: 0 })
const taskStats = reactive({ today_count: 0, tomorrow_count: 0, overdue_count: 0 })
const followLoading = ref(false), serviceLoading = ref(false)
const overdueCount = ref(0), overdueDays = ref(15)
const quickFollowVisible = ref(false), batchFollowVisible = ref(false)

const goCustomer = (id) => router.push(`/customer/detail/${id}`)
const goFollow = (item) => router.push(`/customer/detail/${item.customer_id}`)
const goService = () => router.push('/service')

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

const goToTasks = (type) => {
  const routes = { today: '/follow-up/today', tomorrow: '/follow-up/tomorrow', overdue: '/follow-up/today' }
  router.push(routes[type] || '/follow-up/today')
}

const fetchOverview = async () => {
  try {
    const res = await getReportOverview()
    if (res.code === 200) Object.assign(overview, res.data)
  } catch (error) { console.error('获取概览数据失败:', error) }
}

const fetchQuickStats = async () => {
  try {
    const res = await getReportQuickStats()
    if (res.code === 200) Object.assign(quickStats, res.data)
  } catch (error) { console.error('获取快捷统计失败:', error) }
}

const fetchTodayTasks = async () => {
  followLoading.value = true
  serviceLoading.value = true
  try {
    const res = await getReportTodayTasks()
    if (res.code === 200) Object.assign(todayTasks, res.data)
  } catch (error) { console.error('获取今日待办失败:', error) }
  finally { followLoading.value = false; serviceLoading.value = false }
}

const fetchOverdueStats = async () => {
  try {
    const res = await getReportOverdueStats()
    if (res.code === 200) {
      overdueCount.value = res.data.overdue_count
      if (res.data.overdue_days) overdueDays.value = res.data.overdue_days
    }
  } catch { ElMessage.error('加载数据失败') }
}

const fetchTaskStats = async () => {
  try {
    const res = await getFollowUpTaskStats()
    if (res.code === 200) {
      taskStats.today_count = res.data.today_count || 0
      taskStats.tomorrow_count = res.data.tomorrow_count || 0
      taskStats.overdue_count = res.data.overdue_count || 0
    }
  } catch { /* 静默失败 */ }
}

const fetchFinanceDashboard = async () => {
  try {
    const res = await getPaymentList({ page: 1, pageSize: 1, tab: 'summary' })
    if (res.code === 200 && res.data.summary) {
      financeData.month_plan = res.data.summary.month_plan_total || 0
      financeData.month_paid = res.data.summary.month_paid_total || 0
      financeData.month_rate = res.data.summary.month_rate || 0
    }
    const overdueRes = await getPaymentList({ page: 1, pageSize: 1, tab: 'overdue' })
    if (overdueRes.code === 200) financeData.overdue_amount = overdueRes.data.total || 0
  } catch { /* */ }
}

const fetchPurchaseDashboard = async () => {
  try {
    const statsRes = await getProcurementStats()
    if (statsRes.code === 200) purchaseData.pending_approval = statsRes.data.submitted || 0
    const alertRes = await getInventoryAlerts()
    if (alertRes.code === 200) purchaseData.stock_alerts = alertRes.data?.length || 0
  } catch { /* */ }
}

const fetchServiceDashboard = async () => {
  try {
    const res = await getReportTodayTasks()
    if (res.code === 200) serviceData.pending = res.data.service_count || 0
  } catch { /* */ }
}

const loadDashboardData = () => {
  fetchTodayTasks()
  fetchOverdueStats()
  fetchTaskStats()
  if (isAdmin.value || isSales.value) {
    Promise.all([fetchOverview(), fetchQuickStats()])
  } else if (isFinance.value) {
    fetchFinanceDashboard()
  } else if (isPurchase.value) {
    fetchPurchaseDashboard()
  } else if (isService.value) {
    fetchServiceDashboard()
  }
}

onMounted(() => { loadDashboardData() })
onActivated(() => { loadDashboardData() })
</script>

<style scoped>
.dashboard { padding: 0; }
</style>
