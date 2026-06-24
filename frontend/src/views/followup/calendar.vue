<template>
  <div class="followup-calendar">
    <div class="page-header">
      <h2>跟进日历</h2>
      <p class="page-desc">按日历查看跟进记录和待跟进计划</p>
    </div>

    <!-- 视图切换 Tabs -->
    <el-card shadow="never" style="margin-bottom: 12px;">
      <el-tabs v-model="viewMode">
        <el-tab-pane label="日历视图" name="calendar" />
        <el-tab-pane label="计划列表" name="plan" />
      </el-tabs>
    </el-card>

    <!-- 日历视图 -->
    <el-card v-if="viewMode === 'calendar'" shadow="never">
      <el-calendar v-model="currentDate">
        <template #dateCell="{ data }">
          <div class="calendar-cell" @click="handleClick(data)">
            <span class="cell-day">{{ data.day.split('-')[2] }}</span>
            <div class="cell-tags">
              <el-tag
                v-if="getFollowCount(data.day) > 0"
                size="small"
                type=""
                effect="plain"
                class="cell-tag"
              >{{ getFollowCount(data.day) }}跟进</el-tag>
              <el-tag
                v-if="getPlanCount(data.day) > 0"
                size="small"
                type="warning"
                effect="plain"
                class="cell-tag"
              >{{ getPlanCount(data.day) }}待办</el-tag>
            </div>
          </div>
        </template>
      </el-calendar>
    </el-card>

    <!-- 计划列表视图 -->
    <el-card v-else shadow="never">
      <el-table :data="planList" stripe border v-loading="planLoading">
        <el-table-column prop="company_name" label="客户名称" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="link-text" @click="goToCustomer(row.customer_id)">{{ row.company_name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="contact_name" label="联系人" width="100" />
        <el-table-column prop="plan_content" label="计划内容" min-width="200" show-overflow-tooltip />
        <el-table-column prop="plan_time" label="计划时间" width="160">
          <template #default="{ row }">
            {{ row.plan_time ? formatTime(row.plan_time) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getPlanStatusType(row)" size="small">{{ getPlanStatusText(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button type="primary" link @click="goToCustomer(row.customer_id)">去跟进</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="planList.length === 0" style="text-align:center;padding:40px;color:#909399">暂无跟进计划</div>
    </el-card>

    <!-- 当日详情弹窗 -->
    <el-dialog v-model="dayDialogVisible" :title="selectedDate + ' 跟进记录'" width="600px">
      <template v-if="dayRecords.length === 0">
        <el-empty description="当日无跟进记录" />
      </template>
      <el-timeline v-else>
        <el-timeline-item
          v-for="item in dayRecords"
          :key="item.id"
          :timestamp="item.create_time?.slice(0, 16)"
          placement="top"
        >
          <div class="timeline-content">
            <div class="timeline-header">
              <el-tag size="small">{{ item.follow_type }}</el-tag>
              <el-tag v-if="item.is_plan" size="small" type="warning">待跟进</el-tag>
              <span class="timeline-company" @click="goToCustomer(item.customer_id)">{{ item.company_name }}</span>
              <span v-if="item.contact_name" class="timeline-contact">{{ item.contact_name }}</span>
            </div>
            <div class="timeline-body">{{ item.content }}</div>
          </div>
        </el-timeline-item>
      </el-timeline>
      <template #footer>
        <el-button @click="dayDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getFollowUpCalendar, getFollowUpPlans } from '@/api/customer'
import { formatTime } from '@/composables/useFormat'

const router = useRouter()
const viewMode = ref('calendar')
const currentDate = ref(new Date())
const records = ref([])
const loading = ref(false)
const dayDialogVisible = ref(false)
const selectedDate = ref('')
const dayRecords = ref([])

// 计划列表相关
const planList = ref([])
const planLoading = ref(false)

// 按日期分组的跟进记录
const followByDate = ref({})   // { '2025-01-15': { follows: [...], plans: [...] } }

const fetchCalendar = async () => {
  const d = currentDate.value
  const year = d.getFullYear()
  const month = d.getMonth() + 1

  loading.value = true
  try {
    const res = await getFollowUpCalendar({ year, month })
    if (res.code === 200) {
      records.value = res.data.list || []
      buildDateMap()
    }
  } catch { ElMessage.error('加载日历数据失败') }
  finally { loading.value = false }
}

const buildDateMap = () => {
  const map = {}
  records.value.forEach(r => {
    // 按实际跟进日期
    if (r.follow_date) {
      if (!map[r.follow_date]) map[r.follow_date] = { follows: [], plans: [] }
      map[r.follow_date].follows.push(r)
    }
    // 按计划跟进日期
    if (r.plan_date && r.plan_date !== r.follow_date) {
      if (!map[r.plan_date]) map[r.plan_date] = { follows: [], plans: [] }
      map[r.plan_date].plans.push({ ...r, is_plan: true })
    }
  })
  followByDate.value = map
}

const getFollowCount = (day) => {
  return followByDate.value[day]?.follows?.length || 0
}

const getPlanCount = (day) => {
  return followByDate.value[day]?.plans?.length || 0
}

// 点击日历单元格打开当日详情
const handleClick = (date) => {
  selectedDate.value = date.day
  const data = followByDate.value[date.day]
  dayRecords.value = [
    ...(data?.follows || []),
    ...(data?.plans || [])
  ]
  if (dayRecords.value.length > 0) {
    dayDialogVisible.value = true
  }
}

const goToCustomer = (id) => {
  if (id) {
    dayDialogVisible.value = false
    router.push(`/customer/detail/${id}`)
  }
}

// 获取计划列表
const fetchPlanList = async () => {
  planLoading.value = true
  try {
    const res = await getFollowUpPlans()
    if (res.code === 200) {
      planList.value = res.data.list || []
    }
  } catch { ElMessage.error('加载计划列表失败') }
  finally { planLoading.value = false }
}

// 计划状态判断
const getPlanStatusType = (row) => {
  if (!row.plan_time) return 'info'
  const now = new Date()
  const planTime = new Date(row.plan_time)
  if (planTime < now) return 'danger'
  const diff = planTime - now
  if (diff < 24 * 60 * 60 * 1000) return 'warning'
  return 'success'
}

const getPlanStatusText = (row) => {
  if (!row.plan_time) return '待定'
  const now = new Date()
  const planTime = new Date(row.plan_time)
  if (planTime < now) return '已逾期'
  const diff = planTime - now
  if (diff < 24 * 60 * 60 * 1000) return '今日'
  return '待跟进'
}

// 监听日历月份切换
watch(currentDate, (newVal, oldVal) => {
  if (newVal.getMonth() !== oldVal?.getMonth() || newVal.getFullYear() !== oldVal?.getFullYear()) {
    fetchCalendar()
  }
})

// 监听视图切换
watch(viewMode, (newVal) => {
  if (newVal === 'plan' && planList.value.length === 0) {
    fetchPlanList()
  }
})

onMounted(() => { fetchCalendar() })

// 暴露 handleClick 给模板 — 需要用点击事件绑定到每个日期单元格
</script>

<style scoped>
.followup-calendar { padding: 0; }
.page-header { margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.page-desc { margin: var(--space-1) 0 0; font-size: 13px; color: var(--color-text-tertiary); }

.calendar-cell {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
}

.cell-day {
  font-size: 14px;
  margin-bottom: var(--space-1);
}

.cell-tags {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cell-tag {
  transform: scale(0.85);
  cursor: pointer;
}

.timeline-content {
  padding: var(--space-1) 0;
}

.timeline-header {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-bottom: var(--space-1);
}

.timeline-company {
  font-weight: 600;
  color: var(--color-accent);
  cursor: pointer;
  font-size: 13px;
}

.timeline-company:hover {
  text-decoration: underline;
}

.timeline-contact {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.timeline-body {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.link-text {
  color: var(--color-accent);
  cursor: pointer;
}

.link-text:hover {
  text-decoration: underline;
}
</style>
