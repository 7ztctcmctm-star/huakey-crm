<template>
  <div class="dashboard">
    <el-row :gutter="24">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card" @click="handleQuickAction('sales')">
          <div class="stat-body">
            <div class="stat-icon" style="background: #eff6ff; color: #1a56db">
              <el-icon :size="28"><TrendCharts /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">¥{{ formatAmount(overview.month_sales) }}</div>
              <div class="stat-label">本月销售额</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card" @click="handleQuickAction('customer')">
          <div class="stat-body">
            <div class="stat-icon" style="background: #eff6ff; color: #1a56db">
              <el-icon :size="28"><Plus /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ overview.month_customers }}</div>
              <div class="stat-label">本月新增客户</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card" @click="handleQuickAction('contract')">
          <div class="stat-body">
            <div class="stat-icon" style="background: #eff6ff; color: #1a56db">
              <el-icon :size="28"><Document /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ overview.month_contracts }}</div>
              <div class="stat-label">本月合同数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card" @click="handleQuickAction('payment')">
          <div class="stat-body">
            <div class="stat-icon" style="background: #fef2f2; color: #dc2626">
              <el-icon :size="28"><ShoppingCart /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">¥{{ formatAmount(overview.month_payments) }}</div>
              <div class="stat-label">本月回款</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="24" style="margin-top: 16px">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card mini">
          <div class="stat-body">
            <div class="stat-icon small" style="background: #eff6ff; color: #1a56db">
              <el-icon :size="20"><DocumentChecked /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value small">¥{{ formatAmount(overview.opportunity_amount) }}</div>
              <div class="stat-label">进行中商机</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card mini">
          <div class="stat-body">
            <div class="stat-icon small" style="background: #fef2f2; color: #dc2626">
              <el-icon :size="20"><Service /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value small danger">{{ quickStats.pending_payment }}</div>
              <div class="stat-label">待回款计划</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card mini" @click="$router.push({ path: '/customer/list', query: { overdue: 'true' } })">
          <div class="stat-body">
            <div class="stat-icon small" :style="{ background: overdueCount > 0 ? 'var(--c-accent-bg)' : '#f0f9eb', color: overdueCount > 0 ? 'var(--c-accent)' : 'var(--c-primary)' }">
              <el-icon :size="20"><Clock /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value small danger">{{ overdueCount }}</div>
              <div class="stat-label">逾期跟进 (>{{ overdueDays }}天)</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card mini">
          <div class="stat-body">
            <div class="stat-icon small" style="background: #eff6ff; color: #1a56db">
              <el-icon :size="20"><Document /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value small">{{ quickStats.pending_contract }}</div>
              <div class="stat-label">待执行合同</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="24" style="margin-top: 24px">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="section-header">
              <span class="section-title">
                <el-icon><Bell /></el-icon> 今日待办
              </span>
              <el-badge :value="todayTasks.follow_count + todayTasks.service_count" :hidden="todayTasks.follow_count + todayTasks.service_count === 0">
                <el-tag type="warning">{{ todayTasks.follow_count }} 跟进 / {{ todayTasks.service_count }} 工单</el-tag>
              </el-badge>
            </div>
          </template>
          <el-tabs v-model="activeTab" class="todo-tabs">
            <el-tab-pane label="待跟进" name="follow">
              <div v-if="followLoading" v-loading="followLoading" style="min-height: 200px" />
              <div v-else-if="todayTasks.follow_list && todayTasks.follow_list.length > 0">
                <div v-for="item in todayTasks.follow_list" :key="'f-' + item.id" class="todo-item" @click="goCustomer(item.customer_id)">
                  <div class="todo-item-left">
                    <el-tag :type="followTypeTag(item.follow_type)" size="small">{{ item.follow_type }}</el-tag>
                    <span class="todo-customer">{{ item.company_name || '未知客户' }}</span>
                  </div>
                  <div class="todo-item-right">
                    <span class="todo-time">{{ formatTimeShort(item.next_time) }}</span>
                    <el-button type="primary" link size="small" @click.stop="goFollow(item)">跟进</el-button>
                  </div>
                </div>
              </div>
              <el-empty v-else description="今日没有待跟进任务" :image-size="80" />
            </el-tab-pane>
            <el-tab-pane label="待处理工单" name="service">
              <div v-if="serviceLoading" v-loading="serviceLoading" style="min-height: 200px" />
              <div v-else-if="todayTasks.service_list && todayTasks.service_list.length > 0">
                <div v-for="item in todayTasks.service_list" :key="'s-' + item.id" class="todo-item" @click="goService(item.id)">
                  <div class="todo-item-left">
                    <el-tag :type="getPriorityTag(item.priority)" size="small">{{ getPriorityText(item.priority) }}</el-tag>
                    <span class="todo-title">{{ item.title }}</span>
                  </div>
                  <div class="todo-item-right">
                    <el-tag size="small">{{ getServiceStatus(item.status) }}</el-tag>
                    <el-button type="primary" link size="small" @click.stop="handleService(item)">处理</el-button>
                  </div>
                </div>
              </div>
              <el-empty v-else description="没有待处理工单" :image-size="80" />
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="section-header">
              <span class="section-title">
                <el-icon><Setting /></el-icon> 快捷操作
              </span>
            </div>
          </template>
          <div class="quick-actions">
            <div class="action-item" @click="handleQuickAction('add_customer')">
              <div class="action-icon" style="background: #eff6ff; color: #1a56db">
                <el-icon :size="24"><Plus /></el-icon>
              </div>
              <span>新建客户</span>
            </div>
            <div class="action-item" @click="handleQuickAction('add_follow')">
              <div class="action-icon" style="background: #eff6ff; color: #1a56db">
                <el-icon :size="24"><ArrowDown /></el-icon>
              </div>
              <span>添加跟进</span>
            </div>
            <div class="action-item" @click="handleQuickAction('add_opportunity')">
              <div class="action-icon" style="background: #eff6ff; color: #1a56db">
                <el-icon :size="24"><Star /></el-icon>
              </div>
              <span>新建商机</span>
            </div>
            <div class="action-item" @click="handleQuickAction('add_contract')">
              <div class="action-icon" style="background: #eff6ff; color: #dc2626">
                <el-icon :size="24"><Document /></el-icon>
              </div>
              <span>新建合同</span>
            </div>
            <div class="action-item" @click="handleQuickAction('add_service')">
              <div class="action-icon" style="background: #eff6ff; color: #1a56db">
                <el-icon :size="24"><Service /></el-icon>
              </div>
              <span>创建工单</span>
            </div>
            <div class="action-item" @click="handleQuickAction('report')">
              <div class="action-icon" style="background: #eff6ff; color: #1a56db">
                <el-icon :size="24"><Histogram /></el-icon>
              </div>
              <span>数据报表</span>
            </div>
            <div class="action-item" @click="handleQuickAction('batch_follow')">
              <div class="action-icon" style="background: #f0fdf4; color: #16a34a">
                <el-icon :size="24"><List /></el-icon>
              </div>
              <span>批量跟进</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="24" style="margin-top: 24px">
      <el-col :span="14">
        <el-card shadow="never">
          <template #header>
            <div class="section-header">
              <span class="section-title">
                <el-icon><TrendCharts /></el-icon> 销售趋势
              </span>
            </div>
          </template>
          <div ref="trendChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card shadow="never">
          <template #header>
            <div class="section-header">
              <span class="section-title">
                <el-icon><PieChart /></el-icon> 客户来源分布
              </span>
            </div>
          </template>
          <div ref="sourceChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="24" style="margin-top: 24px">
      <el-col :span="14">
        <el-card shadow="never">
          <template #header>
            <div class="section-header">
              <span class="section-title">
                <el-icon><Search /></el-icon> 销售漏斗
              </span>
            </div>
          </template>
          <div ref="funnelChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card shadow="never">
          <template #header>
            <div class="section-header">
              <span class="section-title">
                <el-icon><Trophy /></el-icon> 销售业绩排行
              </span>
            </div>
          </template>
          <div v-if="rankLoading" v-loading="rankLoading" style="min-height: 260px" />
          <el-table v-else :data="performanceRank" stripe size="small">
            <el-table-column type="index" label="排名" width="60" align="center" />
            <el-table-column prop="name" label="销售" min-width="80" />
            <el-table-column prop="contract_amount" label="成交金额" width="100" align="right">
              <template #default="{ row }">
                <span class="amount-text">¥{{ formatAmount(row.contract_amount) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="payment_amount" label="回款金额" width="100" align="right">
              <template #default="{ row }">
                <span class="amount-text">¥{{ formatAmount(row.payment_amount) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

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
import { ref, reactive, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  TrendCharts, Plus, Document, ShoppingCart, DocumentChecked, Service, User,
  Bell, Setting, ArrowDown, Star, Histogram,
  PieChart, Search, Trophy, Clock, List, Delete
} from '@element-plus/icons-vue'
import request from '@/utils/request'
import { useChart } from '@/composables/useChart'
import { formatAmount } from '@/composables/useFormat'
import { PARENT_SOURCE_COLORS } from '@/constants/source'

const router = useRouter()
const activeTab = ref('follow')
const overview = reactive({
  month_sales: '0',
  month_customers: 0,
  month_contracts: 0,
  month_payments: '0',
  opportunity_amount: '0'
})
const quickStats = reactive({
  customer_pool: 0,
  pending_contract: 0,
  pending_payment: 0
})
const todayTasks = reactive({
  follow_list: [],
  follow_count: 0,
  service_list: [],
  service_count: 0
})
const performanceRank = ref([])

const followLoading = ref(false)
const serviceLoading = ref(false)
const overdueCount = ref(0)
const overdueDays = ref(15)
const rankLoading = ref(false)

const { refs: { trendChartRef, sourceChartRef, funnelChartRef }, echarts, initChart } = useChart('trendChartRef', 'sourceChartRef', 'funnelChartRef')

const followTypeTag = (type) => {
  const map = { '电话': 'warning', '拜访': '', '微信': 'success', '邮件': 'info', '其他': '' }
  return map[type] || ''
}

const getPriorityTag = (priority) => {
  const map = { 1: 'danger', 2: 'warning', 3: '', 4: 'info' }
  return map[priority] || ''
}

const getPriorityText = (priority) => {
  const map = { 1: '紧急', 2: '高', 3: '中', 4: '低' }
  return map[priority] || ''
}

const getServiceStatus = (status) => {
  const map = { 1: '待分配', 2: '已分配', 3: '处理中', 4: '待确认', 5: '已完成' }
  return map[status] || ''
}

const formatTimeShort = (time) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

const goCustomer = (id) => {
  router.push(`/customer/detail/${id}`)
}

const goFollow = (item) => {
  router.push(`/customer/detail/${item.customer_id}`)
}

const goService = (id) => {
  router.push('/service')
}

const handleService = (item) => {
  router.push('/service')
}

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
    sales: '/report',
    customer: '/customer/list',
    contract: '/contract',
    payment: '/payment',
    add_customer: '/customer/list?action=add',
    add_opportunity: '/opportunity?action=add',
    add_contract: '/contract?action=add',
    add_service: '/service?action=add',
    report: '/report'
  }
  router.push(routes[action] || '/')
}

// 快速跟进
const quickFollowVisible = ref(false)
const followCustomerLoading = ref(false)
const followCustomerOptions = ref([])
const quickFollowForm = ref({
  customer_id: null,
  follow_type: '电话',
  content: '',
  next_time: ''
})
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
    const res = await request.post('/customer/list', { page: 1, pageSize: 50, owner_id: userId || undefined })
    if (res.code === 200) followCustomerOptions.value = res.data.list || []
  } catch { /* ignore */ }
  finally { followCustomerLoading.value = false }
}

const searchFollowCustomer = async (query) => {
  if (!query || query.length < 1) { followCustomerOptions.value = []; return }
  followCustomerLoading.value = true
  try {
    const res = await request.post('/customer/list', { page: 1, pageSize: 10, company_name: query })
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
    await request.post('/follow-up/add', body)
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
const batchRows = ref([
  { customer_id: null, follow_type: '电话', content: '' }
])

const searchBatchCustomer = async (query) => {
  if (!query || query.length < 1) { batchCustomerOptions.value = []; return }
  batchCustomerSearchLoading.value = true
  try {
    const res = await request.post('/customer/list', { page: 1, pageSize: 10, company_name: query })
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
    const res = await request.post('/follow-up/batch-add', { items })
    if (res.code === 200) {
      ElMessage.success(res.message)
      batchFollowVisible.value = false
      fetchTodayTasks()
    }
  } catch { /* error handled by interceptor */ }
  finally { batchFollowLoading.value = false }
}

const fetchOverview = async () => {
  try {
    const res = await request.get('/report/overview')
    if (res.code === 200) {
      Object.assign(overview, res.data)
    }
  } catch (error) {
    console.error('获取概览数据失败:', error)
  }
}

const fetchQuickStats = async () => {
  try {
    const res = await request.get('/report/quick-stats')
    if (res.code === 200) {
      Object.assign(quickStats, res.data)
    }
  } catch (error) {
    console.error('获取快捷统计失败:', error)
  }
}

const fetchTodayTasks = async () => {
  followLoading.value = true
  serviceLoading.value = true
  try {
    const res = await request.get('/report/today-tasks')
    if (res.code === 200) {
      Object.assign(todayTasks, res.data)
    }
  } catch (error) {
    console.error('获取今日待办失败:', error)
  } finally {
    followLoading.value = false
    serviceLoading.value = false
  }
}

const fetchPerformanceRank = async () => {
  rankLoading.value = true
  try {
    const res = await request.get('/report/performance')
    if (res.code === 200) {
      performanceRank.value = res.data.filter(item => item.contract_amount > 0).slice(0, 5)
    }
  } catch (error) {
    console.error('获取业绩排行失败:', error)
  } finally {
    rankLoading.value = false
  }
}

const initCharts = () => {
  Promise.all([fetchSalesTrend(), fetchCustomerSource(), fetchSalesFunnel()])
}

const fetchSalesTrend = async () => {
  try {
    const res = await request.get('/report/sales-trend')
    if (res.code === 200) {
      renderTrendChart(res.data)
    }
  } catch (error) {
    console.error('获取销售趋势失败:', error)
  }
}

const renderTrendChart = (data) => {
  const months = data.map(item => item.month)
  const amounts = data.map(item => parseFloat(item.amount))
  initChart('trendChartRef', {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: months,
      axisLabel: { rotate: 30 }
    },
    yAxis: { type: 'value', axisLabel: { formatter: '¥{value}' } },
    series: [{
      name: '销售额',
      type: 'line',
      smooth: true,
      data: amounts,
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(26, 86, 219, 0.15)' },
          { offset: 1, color: 'rgba(26, 86, 219, 0.03)' }
        ])
      },
      lineStyle: { color: '#1a56db', width: 2 },
      itemStyle: { color: '#1a56db' }
    }]
  })
}

const fetchCustomerSource = async () => {
  try {
    const res = await request.get('/report/customer')
    if (res.code === 200) {
      renderSourceChart(res.data.source_dist)
    }
  } catch (error) {
    console.error('获取客户来源失败:', error)
  }
}

const renderSourceChart = (data) => {
  initChart('sourceChartRef', {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { orient: 'vertical', left: 'left', top: 'center' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['60%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#fff',
        borderWidth: 2
      },
      label: { show: false, position: 'center' },
      emphasis: {
        label: { show: true, fontSize: 16, fontWeight: 'bold' }
      },
      labelLine: { show: false },
      data: data.map((item) => ({
        value: item.count,
        name: item.source || '未知',
        itemStyle: { color: PARENT_SOURCE_COLORS[item.source] || 'var(--c-text-tertiary)' }
      }))
    }]
  })
}

const fetchSalesFunnel = async () => {
  try {
    const res = await request.get('/report/sales-funnel')
    if (res.code === 200) {
      renderFunnelChart(res.data)
    }
  } catch (error) {
    console.error('获取销售漏斗失败:', error)
  }
}

const renderFunnelChart = (data) => {
  initChart('funnelChartRef', {
    tooltip: { trigger: 'item', formatter: '{b}: {c}个商机' },
    legend: { data: data.map(item => item.stage), bottom: 10 },
    series: [{
      name: '销售漏斗',
      type: 'funnel',
      left: '10%',
      top: '10%',
      bottom: '20%',
      width: '80%',
      min: 0,
      max: data[0]?.count || 10,
      minSize: '0%',
      maxSize: '100%',
      sort: 'descending',
      gap: 2,
      label: { show: true, position: 'inside' },
      labelLine: { length: 10, lineStyle: { width: 1, type: 'solid' } },
      itemStyle: { borderColor: '#fff', borderWidth: 1 },
      emphasis: { label: { fontSize: 14 } },
      data: data.map((item, index) => ({
        value: item.count,
        name: item.stage,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: ['#1a56db', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#94a3b8'][index] },
            { offset: 1, color: ['#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#e2e8f0', '#cbd5e1'][index] }
          ])
        }
      }))
    }]
  })
}

const fetchOverdueStats = async () => {
  try {
    const res = await request.get('/report/overdue-stats')
    if (res.code === 200) {
      overdueCount.value = res.data.overdue_count
      if (res.data.overdue_days) overdueDays.value = res.data.overdue_days
    }
  } catch (e) { ElMessage.error('加载数据失败') }
}

onMounted(() => {
  initCharts()
  Promise.all([
    fetchOverview(), fetchQuickStats(), fetchTodayTasks(),
    fetchPerformanceRank(), fetchOverdueStats()
  ])
})

onActivated(() => {
  Promise.all([fetchOverview(), fetchQuickStats(), fetchTodayTasks(), fetchPerformanceRank(), fetchOverdueStats()])
})
</script>

<style scoped>
.dashboard {
  padding: 0;
}

.stat-card {
  cursor: pointer;
  border-radius: 8px;
  border: none;
  background: rgba(255,255,255,0.88);
}
.stat-card:hover {
}

.stat-card:hover {
}

.stat-card.mini {
  cursor: default;
}

.stat-card.mini:hover {
  transform: none;
}

.stat-body {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon.small {
  width: 44px;
  height: 44px;
  border-radius: 10px;
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: var(--c-text);
  line-height: 1.2;
}

.stat-value.small {
  font-size: 22px;
}

.stat-value.small.danger {
  color: #dc2626;
}

.stat-label {
  font-size: 14px;
  color: #1a56db;
  margin-top: 4px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: bold;
  color: var(--c-text);
}

.chart-container {
  height: 260px;
}

.todo-tabs :deep(.el-tabs__header) {
  margin-bottom: 8px;
}

.todo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px;
  border-bottom: 1px solid var(--c-border-light);
  cursor: pointer;
  transition: background 0.2s;
}

.todo-item:hover {
  background: var(--c-bg);
}

.todo-item:last-child {
  border-bottom: none;
}

.todo-item-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.todo-customer, .todo-title {
  font-size: 14px;
  color: var(--c-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-item-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.todo-time {
  font-size: 12px;
  color: #1a56db;
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 10px;
  border-radius: 8px;
  cursor: pointer;
}

.action-item:hover {
  background: var(--c-bg);
}

.action-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-item span {
  font-size: 13px;
  color: var(--c-text-secondary);
}

.amount-text {
  font-size: 13px;
  color: var(--c-text);
}

.batch-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
</style>