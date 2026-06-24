<template>
  <div class="dashboard">
    <!-- 统计卡片 -->
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

    <!-- 今日待办 -->
    <PendingTasks
      :today-tasks="todayTasks"
      :follow-loading="followLoading"
      :service-loading="serviceLoading"
      :overdue-count="overdueCount"
      @go-customer="goCustomer"
      @go-follow="goFollow"
      @go-service="goService"
      @handle-service="handleService"
    />

    <!-- 图表和快捷操作（管理员/销售） -->
    <SalesChart
      v-if="isAdmin || isSales"
      ref="salesChartRef"
      :performance-rank="performanceRank"
      :rank-loading="rankLoading"
      @quick-action="handleQuickAction"
    />

    <!-- 快速跟进弹窗 -->
    <el-dialog v-model="quickFollowVisible" title="快速跟进" width="500px" @close="resetQuickFollow">
      <el-form ref="quickFollowFormRef" :model="quickFollowForm" :rules="quickFollowRules" label-width="90px">
        <el-form-item label="客户" prop="customer_id">
          <el-select
            v-model="quickFollowForm.customer_id"
            filterable
            placeholder="选择我的客户（可输入筛选）"
            :loading="followCustomerLoading"
            style="width: 100%"
          >
            <el-option
              v-for="item in followCustomerOptions"
              :key="item.id"
              :label="item.company_name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="跟进方式" prop="follow_type">
          <el-select v-model="quickFollowForm.follow_type" style="width: 100%">
            <el-option label="电话" value="电话" />
            <el-option label="微信" value="微信" />
            <el-option label="拜访" value="拜访" />
            <el-option label="邮件" value="邮件" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="跟进内容" prop="content">
          <el-input v-model="quickFollowForm.content" type="textarea" :rows="3" placeholder="请输入跟进内容" />
        </el-form-item>
        <el-form-item label="下次跟进">
          <el-date-picker v-model="quickFollowForm.next_time" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="选择日期时间" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="quickFollowVisible = false">取消</el-button>
        <el-button type="primary" @click="submitQuickFollow">提交</el-button>
      </template>
    </el-dialog>

    <!-- 批量跟进弹窗 -->
    <el-dialog v-model="batchFollowVisible" title="批量跟进" width="680px">
      <div v-for="(row, index) in batchRows" :key="index" class="batch-row">
        <el-select
          v-model="row.customer_id"
          filterable remote reserve-keyword
          placeholder="搜索客户"
          :remote-method="searchBatchCustomer"
          :loading="batchCustomerSearchLoading"
          style="width: 200px"
        >
          <el-option v-for="c in batchCustomerOptions" :key="c.id" :label="c.company_name" :value="c.id" />
        </el-select>
        <el-select v-model="row.follow_type" style="width: 90px">
          <el-option label="电话" value="电话" />
          <el-option label="微信" value="微信" />
          <el-option label="拜访" value="拜访" />
          <el-option label="邮件" value="邮件" />
          <el-option label="其他" value="其他" />
        </el-select>
        <el-input v-model="row.content" placeholder="跟进内容" style="flex: 1" />
        <el-button type="danger" link :icon="Delete" @click="removeBatchRow(index)" v-if="batchRows.length > 1" />
      </div>
      <el-button type="primary" link @click="addBatchRow" style="margin-top: 8px;">+ 添加一行</el-button>
      <template #footer>
        <el-button @click="batchFollowVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchFollowLoading" @click="submitBatchFollow">批量提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onActivated, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import { getCustomerList } from '@/api/customer'
import { getPaymentList } from '@/api/contract'
import { getInventoryAlerts } from '@/api/product'
import { getReportOverview, getReportQuickStats, getReportTodayTasks, getReportPerformance, getReportSalesTrend, getReportCustomerAnalysis, getReportSalesFunnel, getReportOverdueStats } from '@/api/report'
import { addFollowUp, batchAddFollowUp, getFollowUpTaskStats } from '@/api/customer'
import { getProcurementStats } from '@/api/product'
import { useChart } from '@/composables/useChart'
import { PARENT_SOURCE_COLORS } from '@/constants/source'
import StatsCards from '@/components/dashboard/StatsCards.vue'
import PendingTasks from '@/components/dashboard/PendingTasks.vue'
import SalesChart from '@/components/dashboard/SalesChart.vue'

const router = useRouter()

// 角色检测
const userInfo = computed(() => {
  try { return JSON.parse(localStorage.getItem('userInfo') || '{}') } catch { return {} }
})
const roleId = computed(() => userInfo.value.roleId || 0)
const isAdmin = computed(() => roleId.value === 1 || roleId.value === 2)
const isSales = computed(() => roleId.value === 3)
const isFinance = computed(() => roleId.value === 4)
const isPurchase = computed(() => roleId.value === 5)
const isService = computed(() => roleId.value === 6)

// 数据
const financeData = reactive({ month_plan: 0, month_paid: 0, month_rate: 0, overdue_amount: 0 })
const purchaseData = reactive({ month_amount: 0, pending_approval: 0, stock_alerts: 0 })
const serviceData = reactive({ pending: 0, overtime: 0, today_new: 0, satisfaction: 0 })
const overview = reactive({
  month_sales: '0', month_customers: 0, month_contracts: 0, month_payments: '0', opportunity_amount: '0'
})
const quickStats = reactive({ customer_pool: 0, pending_contract: 0, pending_payment: 0 })
const todayTasks = reactive({ follow_list: [], follow_count: 0, service_list: [], service_count: 0 })
const taskStats = reactive({ today_count: 0, tomorrow_count: 0, overdue_count: 0 })
const performanceRank = ref([])
const followLoading = ref(false)
const serviceLoading = ref(false)
const overdueCount = ref(0)
const overdueDays = ref(15)
const rankLoading = ref(false)

// 图表
const salesChartRef = ref(null)
const { refs, echarts, initChart } = useChart('trendChartRef', 'sourceChartRef', 'funnelChartRef')

// 监听子组件图表ref变化
const initChartsFromChild = () => {
  nextTick(() => {
    if (salesChartRef.value) {
      const { trendChartRef, trendChartRef2, sourceChartRef, funnelChartRef } = salesChartRef.value
      if (trendChartRef) initChart('trendChartRef', undefined)
      if (sourceChartRef) initChart('sourceChartRef', undefined)
      if (funnelChartRef) initChart('funnelChartRef', undefined)
    }
  })
}

const goCustomer = (id) => router.push(`/customer/detail/${id}`)
const goFollow = (item) => router.push(`/customer/detail/${item.customer_id}`)
const goService = (id) => router.push('/service')
const handleService = (item) => router.push('/service')

const handleQuickAction = (action) => {
  if (action === 'add_follow') {
    quickFollowVisible.value = true
    loadMyCustomers()
    return
  }
  if (action === 'batch_follow') {
    openBatchFollow()
    return
  }
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

// 快速跟进
const quickFollowVisible = ref(false)
const followCustomerLoading = ref(false)
const followCustomerOptions = ref([])
const quickFollowForm = ref({ customer_id: null, follow_type: '电话', content: '', next_time: '' })
const quickFollowFormRef = ref(null)
const quickFollowRules = {
  customer_id: [{ required: true, message: '请选择客户', trigger: 'change' }],
  content: [{ required: true, message: '请填写跟进内容', trigger: 'blur' }]
}

const loadMyCustomers = async () => {
  followCustomerLoading.value = true
  try {
    const stored = localStorage.getItem('userInfo')
    const userId = stored ? JSON.parse(stored).id : null
    const res = await getCustomerList({ page: 1, pageSize: 50, owner_id: userId || undefined })
    if (res.code === 200) followCustomerOptions.value = res.data.list || []
  } catch { /* ignore */ }
  finally { followCustomerLoading.value = false }
}

const resetQuickFollow = () => {
  quickFollowForm.value = { customer_id: null, follow_type: '电话', content: '', next_time: '' }
  quickFollowFormRef.value?.resetFields()
}

const submitQuickFollow = async () => {
  const valid = await quickFollowFormRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    const body = {
      customer_id: quickFollowForm.value.customer_id,
      follow_type: quickFollowForm.value.follow_type,
      content: quickFollowForm.value.content,
      next_time: quickFollowForm.value.next_time || undefined
    }
    await addFollowUp(body)
    ElMessage.success('跟进记录已保存')
    quickFollowVisible.value = false
    fetchTodayTasks()
  } catch { /* error handled by interceptor */ }
}

// 批量跟进
const batchFollowVisible = ref(false)
const batchFollowLoading = ref(false)
const batchCustomerOptions = ref([])
const batchCustomerSearchLoading = ref(false)
const batchRows = ref([{ customer_id: null, follow_type: '电话', content: '' }])

const searchBatchCustomer = async (query) => {
  if (!query || query.length < 1) { batchCustomerOptions.value = []; return }
  batchCustomerSearchLoading.value = true
  try {
    const res = await getCustomerList({ page: 1, pageSize: 10, company_name: query })
    if (res.code === 200) batchCustomerOptions.value = res.data.list || []
  } catch { /* ignore */ }
  finally { batchCustomerSearchLoading.value = false }
}

const openBatchFollow = () => {
  batchRows.value = [{ customer_id: null, follow_type: '电话', content: '' }]
  batchFollowVisible.value = true
}

const addBatchRow = () => {
  if (batchRows.value.length >= 10) return ElMessage.warning('单次最多10条')
  batchRows.value.push({ customer_id: null, follow_type: '电话', content: '' })
}

const removeBatchRow = (index) => {
  if (batchRows.value.length <= 1) return
  batchRows.value.splice(index, 1)
}

const submitBatchFollow = async () => {
  const items = batchRows.value.filter(r => r.customer_id && r.content)
  if (items.length === 0) return ElMessage.warning('请至少填写一条完整的跟进记录')
  batchFollowLoading.value = true
  try {
    const res = await batchAddFollowUp(items)
    if (res.code === 200) {
      ElMessage.success(res.message)
      batchFollowVisible.value = false
      fetchTodayTasks()
    }
  } catch { /* error handled by interceptor */ }
  finally { batchFollowLoading.value = false }
}

// 数据获取
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

const fetchPerformanceRank = async () => {
  rankLoading.value = true
  try {
    const res = await getReportPerformance()
    if (res.code === 200) performanceRank.value = res.data.filter(item => item.contract_amount > 0).slice(0, 5)
  } catch (error) { console.error('获取业绩排行失败:', error) }
  finally { rankLoading.value = false }
}

const fetchSalesTrend = async () => {
  try {
    const res = await getReportSalesTrend()
    if (res.code === 200) renderTrendChart(res.data)
  } catch (error) { console.error('获取销售趋势失败:', error) }
}

const renderTrendChart = (data) => {
  const months = data.map(item => item.month)
  const amounts = data.map(item => parseFloat(item.amount))
  initChart('trendChartRef', {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: months, axisLabel: { rotate: 30 } },
    yAxis: { type: 'value', axisLabel: { formatter: '¥{value}' } },
    series: [{
      name: '销售额', type: 'line', smooth: true, data: amounts,
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(26, 86, 219, 0.15)' },
        { offset: 1, color: 'rgba(26, 86, 219, 0.03)' }
      ])},
      lineStyle: { color: '#1a56db', width: 2 },
      itemStyle: { color: '#1a56db' }
    }]
  })
}

const fetchCustomerSource = async () => {
  try {
    const res = await getReportCustomerAnalysis()
    if (res.code === 200) renderSourceChart(res.data.source_dist)
  } catch (error) { console.error('获取客户来源失败:', error) }
}

const renderSourceChart = (data) => {
  initChart('sourceChartRef', {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { orient: 'vertical', left: 'left', top: 'center' },
    series: [{
      type: 'pie', radius: ['40%', '70%'], center: ['60%', '50%'], avoidLabelOverlap: false,
      itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
      label: { show: false, position: 'center' },
      emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold' } },
      labelLine: { show: false },
      data: data.map((item) => ({
        value: item.count, name: item.source || '未知',
        itemStyle: { color: PARENT_SOURCE_COLORS[item.source] || 'var(--color-text-tertiary)' }
      }))
    }]
  })
}

const fetchSalesFunnel = async () => {
  try {
    const res = await getReportSalesFunnel()
    if (res.code === 200) renderFunnelChart(res.data)
  } catch (error) { console.error('获取销售漏斗失败:', error) }
}

const renderFunnelChart = (data) => {
  initChart('funnelChartRef', {
    tooltip: { trigger: 'item', formatter: '{b}: {c}个商机' },
    legend: { data: data.map(item => item.stage), bottom: 10 },
    series: [{
      name: '销售漏斗', type: 'funnel', left: '10%', top: '10%', bottom: '20%', width: '80%',
      min: 0, max: data[0]?.count || 10, minSize: '0%', maxSize: '100%', sort: 'descending', gap: 2,
      label: { show: true, position: 'inside' },
      labelLine: { length: 10, lineStyle: { width: 1, type: 'solid' } },
      itemStyle: { borderColor: '#fff', borderWidth: 1 },
      emphasis: { label: { fontSize: 14 } },
      data: data.map((item, index) => ({
        value: item.count, name: item.stage,
        itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: ['#1a56db', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#94a3b8'][index] },
          { offset: 1, color: ['#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#e2e8f0', '#cbd5e1'][index] }
        ])}
      }))
    }]
  })
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

const initCharts = () => {
  fetchSalesTrend()
  fetchCustomerSource()
  fetchSalesFunnel()
}

const loadDashboardData = () => {
  fetchTodayTasks()
  fetchOverdueStats()
  fetchTaskStats()
  if (isAdmin.value || isSales.value) {
    initCharts()
    Promise.all([fetchOverview(), fetchQuickStats(), fetchPerformanceRank()])
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
.dashboard {
  padding: 0;
}

.batch-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
</style>
