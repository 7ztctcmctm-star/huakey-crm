<template>
  <div class="team-dashboard">
    <div class="page-header">
      <div class="page-header-top">
        <div>
          <h2>团队跟单全景视图</h2>
          <p class="page-desc">实时查看每位销售的客户跟进情况，点击数字可下钻查看详情</p>
        </div>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 260px"
          @change="handleDateChange"
        />
      </div>
    </div>

    <!-- 顶部总览卡片 -->
    <el-row :gutter="16" class="overview-row">
      <el-col :span="4">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ overview.total_customers }}</div>
          <div class="stat-label">团队总客户数</div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num green">{{ overview.week_new }}</div>
          <div class="stat-label">本周新增</div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num blue">{{ overview.active_opportunities }}</div>
          <div class="stat-label">活跃商机数</div>
          <div class="stat-sub">共 ¥{{ formatAmount(overview.active_opportunity_amount) }}</div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num" :class="{ red: overview.overdue_count > 0 }">{{ overview.overdue_count }}</div>
          <div class="stat-label">即将逾期任务</div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num green">¥{{ formatAmount(overview.contract_amount) }}</div>
          <div class="stat-label">合同额</div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num blue">¥{{ formatAmount(overview.payment_amount) }}</div>
          <div class="stat-label">回款额</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 卡住商机区域 -->
    <el-card shadow="never" class="stuck-card" v-if="stuckList.length > 0">
      <template #header>
        <span class="card-title stuck-title">
          商机长期未推进（超过{{ stuckDays }}天）
          <el-badge :value="stuckList.length" :max="99" type="danger" />
        </span>
      </template>
      <el-table :data="stuckList" stripe border size="small" max-height="300">
        <el-table-column prop="name" label="商机名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="customer_name" label="客户名称" width="150" show-overflow-tooltip />
        <el-table-column label="当前阶段" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="stageTagType(row.stage)" size="small">{{ row.stage_name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="卡住天数" width="100" align="center">
          <template #default="{ row }">
            <span :class="row.stuck_days > 30 ? 'stuck-danger' : 'stuck-warning'">{{ row.stuck_days }}天</span>
          </template>
        </el-table-column>
        <el-table-column label="预期金额" width="130" align="right">
          <template #default="{ row }">¥{{ formatAmount(row.expected_amount) }}</template>
        </el-table-column>
        <el-table-column prop="owner_name" label="负责人" width="90" />
        <el-table-column label="操作" width="80" align="center">
          <template #default="{ row }">
            <el-button type="primary" size="small" link @click="$router.push('/opportunity')">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 待审批区域 -->
    <el-card shadow="never" class="pending-card" v-if="pendingApprovals.length > 0">
      <template #header>
        <span class="card-title">待审批 <el-badge :value="pendingApprovals.length" :max="99" /></span>
      </template>
      <el-table :data="pendingApprovals" stripe border size="small" max-height="250">
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.business_type === 'quote' ? 'warning' : 'success'" size="small">
              {{ row.business_type === 'quote' ? '报价审批' : '合同审批' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="biz_no" label="编号" width="160" />
        <el-table-column label="金额" width="130" align="right">
          <template #default="{ row }">¥{{ formatAmount(row.biz_amount) }}</template>
        </el-table-column>
        <el-table-column prop="from_user_name" label="提交人" width="100" />
        <el-table-column prop="create_time" label="时间" width="160">
          <template #default="{ row }">{{ formatTime(row.create_time) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center">
          <template #default="{ row }">
            <el-button type="success" size="small" link @click="handleApprove(row, 2)">通过</el-button>
            <el-button type="danger" size="small" link @click="handleApprove(row, 3)">拒绝</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 销售实况卡片列表 -->
    <el-card shadow="never" class="table-card" v-loading="loading">
      <template #header>
        <span class="card-title">销售实况</span>
      </template>
      <el-table :data="salesList" stripe border :header-cell-style="{ background: 'var(--color-bg)' }">
        <el-table-column prop="real_name" label="销售人员" width="100" />
        <el-table-column prop="dept_name" label="部门" width="100" />
        <el-table-column label="负责客户数" width="120" align="center">
          <template #default="{ row }">
            <el-button type="primary" link @click="showSalesCustomers(row)">
              {{ row.customer_count }}人
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="活跃商机" width="150" align="center">
          <template #default="{ row }">
            {{ row.active_opp_count }}个（¥{{ formatAmount(row.active_opp_amount) }}）
          </template>
        </el-table-column>
        <el-table-column label="今日待办" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.today_tasks > 0 ? 'warning' : 'info'" size="small">{{ row.today_tasks }}项</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="近期无跟进" width="140" align="center">
          <template #default="{ row }">
            <el-button
              :type="row.no_follow_count > 0 ? 'danger' : 'info'"
              :link="row.no_follow_count > 0"
              :disabled="row.no_follow_count === 0"
              @click="showOverdueCustomers(row)"
            >
              <strong>{{ row.no_follow_count }}个</strong>
              <span v-if="row.no_follow_count > 0" style="color:var(--color-accent)"> ⚠</span>
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="合同额" width="130" align="right">
          <template #default="{ row }">¥{{ formatAmount(row.contract_amount) }}</template>
        </el-table-column>
        <el-table-column label="回款额" width="130" align="right">
          <template #default="{ row }">¥{{ formatAmount(row.payment_amount) }}</template>
        </el-table-column>
        <el-table-column label="目标达成" width="150" align="center">
          <template #default="{ row }">
            <el-progress
              :percentage="row.target_achievement"
              :stroke-width="12"
              :color="row.target_achievement >= 100 ? '#67c23a' : row.target_achievement >= 60 ? '#e6a23c' : '#f56c6c'"
              :format="() => `${row.target_achievement}%`"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center">
          <template #default="{ row }">
            <el-button type="primary" size="small" link @click="showSalesCustomers(row)">查看客户</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 图表区域 -->
    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span class="card-title">销售合同额排行</span></template>
          <div ref="contractChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span class="card-title">目标达成率</span></template>
          <div ref="targetChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 下钻弹窗：销售的全部客户 -->
    <el-dialog v-model="customerDialogVisible" :title="`${selectedSales?.real_name} 的客户列表`" width="800px">
      <el-table :data="customerDetailList" stripe border max-height="400" v-loading="customerDetailLoading">
        <el-table-column prop="company_name" label="公司名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="contact_name" label="联系人" width="100" />
        <el-table-column prop="phone" label="电话" width="130" />
        <el-table-column prop="level" label="等级" width="70" />
        <el-table-column prop="last_follow_time" label="最后跟进" width="160">
          <template #default="{ row }">
            {{ row.last_follow_time ? formatTime(row.last_follow_time) : '从未跟进' }}
          </template>
        </el-table-column>
      </el-table>
      <div class="dialog-pagination">
        <el-pagination
          v-model:current-page="customerPage"
          v-model:page-size="customerPageSize"
          :total="customerTotal"
          layout="total, prev, pager, next"
          @current-change="loadCustomerDetail"
        />
      </div>
    </el-dialog>

    <!-- 下钻弹窗：逾期客户 -->
    <el-dialog v-model="overdueDialogVisible" :title="`${selectedSales?.real_name} 的逾期客户`" width="800px">
      <el-table :data="overdueDetailList" stripe border max-height="400" v-loading="overdueDetailLoading"
        :row-class-name="({ row }) => row.overdue_days > 30 ? 'overdue-danger' : ''">
        <el-table-column prop="company_name" label="公司名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="overdue_days" label="逾期天数" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.overdue_days > 30 ? 'danger' : 'warning'">{{ row.overdue_days }}天</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="last_follow_time" label="最后跟进" width="160">
          <template #default="{ row }">
            {{ row.last_follow_time ? formatTime(row.last_follow_time) : '从未跟进' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button type="primary" link @click="$router.push(`/customer/detail/${row.id}`)">去跟进</el-button>
            <el-button type="warning" link @click="urgeFollowup(row)">催办</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="dialog-pagination">
        <el-pagination
          v-model:current-page="overduePage"
          v-model:page-size="overduePageSize"
          :total="overdueTotal"
          layout="total, prev, pager, next"
          @current-change="loadOverdueDetail"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onActivated } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getTeamOverview, getSalesBreakdown, getStuckOpportunities, getPendingApprovals, getSalesCustomers, getSalesOverdueCustomers, urgeFollowup as urgeFollowupApi } from '@/api/system'
import { approveQuote } from '@/api/contract'
import { approveContract } from '@/api/contract'
import { formatTime, formatAmount } from '@/composables/useFormat'
import { useChart } from '@/composables/useChart'

const { refs: { contractChartRef, targetChartRef }, echarts, initChart } = useChart('contractChartRef', 'targetChartRef')

const loading = ref(false)
const salesList = ref([])
const today = new Date()
const firstDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
const lastDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()}`
const dateRange = ref([firstDay, lastDay])

const overview = reactive({
  total_customers: 0, week_new: 0,
  active_opportunities: 0, active_opportunity_amount: '0',
  overdue_count: 0, contract_amount: 0, payment_amount: 0, target_achievement: 0
})

const pendingApprovals = ref([])

// 卡住商机
const stuckList = ref([])
const stuckDays = ref(14)

const fetchStuckOpportunities = async () => {
  try {
    const res = await getStuckOpportunities()
    if (res.code === 200) {
      stuckList.value = res.data.list || []
      stuckDays.value = res.data.stuck_days || 14
    }
  } catch (e) { /* skip */ }
}

const stageTagType = (stage) => {
  const map = { 1: 'info', 2: 'warning', 3: '', 4: 'danger' }
  return map[stage] || 'info'
}

const fetchPendingApprovals = async () => {
  try {
    const res = await getPendingApprovals()
    if (res.code === 200) pendingApprovals.value = res.data || []
  } catch (e) { /* skip */ }
}

const handleApprove = async (row, status) => {
  const action = status === 2 ? '通过' : '拒绝'
  try {
    await ElMessageBox.confirm(`确定${action}该${row.business_type === 'quote' ? '报价' : '合同'}审批？`, '审批确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: status === 2 ? 'success' : 'warning'
    })
    if (row.business_type === 'quote') {
      await approveQuote({ id: row.business_id, approval_status: status })
    } else {
      await approveContract({ id: row.business_id, approval_status: status })
    }
    ElMessage.success(`已${action}`)
    fetchPendingApprovals()
  } catch (e) { /* cancel or error */ }
}


const getDateParams = () => {
  if (dateRange.value && dateRange.value[0] && dateRange.value[1]) {
    return { startDate: dateRange.value[0], endDate: dateRange.value[1] }
  }
  return {}
}

const fetchOverview = async () => {
  try {
    const res = await getTeamOverview(getDateParams())
    if (res.code === 200) Object.assign(overview, res.data)
  } catch (e) { console.error('获取概览失败:', e) }
}

const fetchSalesBreakdown = async () => {
  loading.value = true
  try {
    const res = await getSalesBreakdown(getDateParams())
    if (res.code === 200) {
      salesList.value = res.data
      renderContractChart(res.data)
      renderTargetChart(res.data)
    }
  } catch (e) { console.error('获取销售实况失败:', e) }
  finally { loading.value = false }
}

const renderContractChart = (data) => {
  const sorted = [...data].sort((a, b) => parseFloat(a.contract_amount || 0) - parseFloat(b.contract_amount || 0))
  const names = sorted.map(item => item.real_name)
  const amounts = sorted.map(item => parseFloat(item.contract_amount || 0))
  initChart('contractChartRef', {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: '{b}: ¥{c}' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value', axisLabel: { formatter: '¥{value}' } },
    yAxis: { type: 'category', data: names },
    series: [{
      type: 'bar',
      data: amounts,
      barWidth: '60%',
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#2563eb' },
          { offset: 1, color: '#60a5fa' }
        ]),
        borderRadius: [0, 4, 4, 0]
      }
    }]
  })
}

const renderTargetChart = (data) => {
  const sorted = [...data].sort((a, b) => (a.target_achievement || 0) - (b.target_achievement || 0))
  const names = sorted.map(item => item.real_name)
  const achievements = sorted.map(item => item.target_achievement || 0)
  initChart('targetChartRef', {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: '{b}: {c}%' },
    grid: { left: '3%', right: '8%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value', max: Math.max(120, ...achievements), axisLabel: { formatter: '{value}%' } },
    yAxis: { type: 'category', data: names },
    series: [
      {
        type: 'bar',
        data: achievements.map(v => ({
          value: v,
          itemStyle: { color: v >= 100 ? '#67c23a' : v >= 60 ? '#e6a23c' : '#f56c6c', borderRadius: [0, 4, 4, 0] }
        })),
        barWidth: '60%',
        label: { show: true, position: 'right', formatter: '{c}%' }
      },
      {
        type: 'line',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#f56c6c', type: 'dashed' },
          data: [{ xAxis: 100, label: { formatter: '100%', position: 'end' } }]
        }
      }
    ]
  })
}

// 下钻：销售客户列表
const customerDialogVisible = ref(false)
const customerDetailList = ref([])
const customerDetailLoading = ref(false)
const customerTotal = ref(0)
const customerPage = ref(1)
const customerPageSize = ref(20)
const selectedSales = ref(null)

const showSalesCustomers = (sales) => {
  selectedSales.value = sales
  customerPage.value = 1
  customerDialogVisible.value = true
  loadCustomerDetail()
}

const loadCustomerDetail = async () => {
  customerDetailLoading.value = true
  try {
    const res = await getSalesCustomers({
      user_id: selectedSales.value.user_id,
      page: customerPage.value,
      pageSize: customerPageSize.value
    })
    if (res.code === 200) {
      customerDetailList.value = res.data.list
      customerTotal.value = res.data.total
    }
  } catch (e) { console.error('加载客户列表失败:', e) }
  finally { customerDetailLoading.value = false }
}

// 下钻：逾期客户
const overdueDialogVisible = ref(false)
const overdueDetailList = ref([])
const overdueDetailLoading = ref(false)
const overdueTotal = ref(0)
const overduePage = ref(1)
const overduePageSize = ref(20)

const showOverdueCustomers = (sales) => {
  if (sales.no_follow_count === 0) return
  selectedSales.value = sales
  overduePage.value = 1
  overdueDialogVisible.value = true
  loadOverdueDetail()
}

const loadOverdueDetail = async () => {
  overdueDetailLoading.value = true
  try {
    const res = await getSalesOverdueCustomers({
      user_id: selectedSales.value.user_id,
      page: overduePage.value,
      pageSize: overduePageSize.value
    })
    if (res.code === 200) {
      overdueDetailList.value = res.data.list
      overdueTotal.value = res.data.total
    }
  } catch (e) { console.error('加载逾期客户失败:', e) }
  finally { overdueDetailLoading.value = false }
}

const urgeFollowup = async (row) => {
  try {
    const res = await urgeFollowupApi({
      customer_id: row.id,
      user_id: selectedSales.value.user_id
    })
    if (res.code === 200) {
      ElMessage.success('催办成功，已通知该销售员')
    }
  } catch (e) { /* error handled by interceptor */ }
}

const handleDateChange = () => {
  fetchOverview()
  fetchSalesBreakdown()
}

onMounted(() => {
  fetchOverview()
  fetchSalesBreakdown()
  fetchPendingApprovals()
  fetchStuckOpportunities()
})
onActivated(() => {
  fetchOverview()
  fetchSalesBreakdown()
  fetchPendingApprovals()
  fetchStuckOpportunities()
})
</script>

<style scoped>
.team-dashboard { padding: 0; }
.page-header { margin-bottom: var(--space-4); }
.page-header-top { display: flex; justify-content: space-between; align-items: flex-start; }
.page-header h2 { margin: 0 0 var(--space-1); font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.page-desc { margin: 0; font-size: 13px; color: var(--color-text-tertiary); }

.overview-row { margin-bottom: var(--space-4); }
.stat-card { text-align: center; cursor: default; }
.stat-num { font-size: 28px; font-weight: 700; color: var(--color-text); }
.stat-num.green { color: var(--color-success); }
.stat-num.blue { color: var(--color-accent); }
.stat-num.red { color: var(--color-danger); }
.stat-label { font-size: 13px; color: var(--color-text-tertiary); margin-top: var(--space-1); }
.stat-sub { font-size: 12px; color: var(--color-text-tertiary); margin-top: 2px; }

.table-card { min-height: 300px; }
.pending-card { margin-bottom: var(--space-4); }
.stuck-card { margin-bottom: var(--space-4); }
.card-title { font-size: 15px; font-weight: 600; }
.stuck-title { color: var(--color-accent); }
.stuck-danger { color: var(--color-danger); font-weight: 600; }
.stuck-warning { color: var(--color-warning); font-weight: 600; }

.dialog-pagination { margin-top: var(--space-4); display: flex; justify-content: flex-end; }
:deep(.overdue-danger) { background-color: var(--color-danger-bg); }
.chart-container { height: 300px; }
</style>
