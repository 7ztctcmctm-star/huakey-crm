<template>
  <el-header class="header">
    <div class="header-left">
      <el-button
        link
        class="collapse-btn"
        @click="$emit('toggle-collapse')"
      >
        <el-icon :size="20">
          <Fold v-if="!isCollapse" />
          <Expand v-else />
        </el-icon>
      </el-button>
      <el-breadcrumb separator="/">
        <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
        <el-breadcrumb-item v-for="item in currentBreadcrumb" :key="item.name">
          {{ item.name }}
        </el-breadcrumb-item>
      </el-breadcrumb>

      <!-- 全局搜索 -->
      <SearchOverlay />

      <!-- 最近访问 -->
      <el-popover placement="bottom-start" :width="300" trigger="click" popper-class="recent-visit-popover">
        <template #reference>
          <el-button link class="recent-visit-btn" title="最近访问">
            <el-icon :size="18"><Clock /></el-icon>
          </el-button>
        </template>
        <div style="font-size:14px;font-weight:600;margin-bottom:8px">最近访问</div>
        <div v-if="recentVisits.length === 0" style="text-align:center;padding:20px;color:#909399;font-size:13px">暂无访问记录</div>
        <div v-for="item in recentVisits" :key="item.type + item.id" class="recent-visit-item" @click="goToVisit(item)">
          <el-tag size="small" :type="item.type === 'customer' ? 'primary' : 'success'" style="margin-right:8px">{{ getVisitTypeLabel(item.type) }}</el-tag>
          <span class="recent-visit-name">{{ item.name }}</span>
          <span class="recent-visit-time">{{ relativeTime(item.time) }}</span>
        </div>
      </el-popover>
    </div>

    <div class="header-right">
      <!-- 快捷创建 -->
      <QuickActions />

      <!-- 通知中心 -->
      <NotificationBadge />

      <!-- 回收站 -->
      <el-button v-if="isAdmin" link class="recycle-btn" @click="$emit('open-recycle-bin')" v-permission="'recycle_bin:view'">
        <el-icon :size="18"><Delete /></el-icon>
      </el-button>

      <!-- 老板看板入口 -->
      <el-button v-if="isBoss" link class="boss-dashboard-btn" @click="$router.push('/team-dashboard')">
        <el-icon :size="18"><DataBoard /></el-icon>
        <span>团队看板</span>
      </el-button>

      <UserDropdown :user-info="userInfo" />
    </div>
  </el-header>

  <!-- 逾期提醒弹窗 -->
  <el-dialog :model-value="showReminderDialog" @update:model-value="$emit('update:showReminderDialog', $event)" title="待办提醒" width="700px">
    <el-tabs :model-value="reminderTab" @update:model-value="$emit('update:reminderTab', $event)">
      <el-tab-pane :label="`今日待跟进 (${todayList.length})`" name="today">
        <el-table :data="todayList" stripe border max-height="400">
          <el-table-column prop="company_name" label="公司名称" min-width="150" show-overflow-tooltip />
          <el-table-column prop="plan_content" label="计划内容" min-width="200" show-overflow-tooltip />
          <el-table-column prop="plan_time" label="计划时间" width="160">
            <template #default="{ row }">
              {{ row.plan_time ? formatTime(row.plan_time) : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="80" align="center">
            <template #default>
              <el-tag type="primary" size="small">待跟进</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button type="primary" link @click="$emit('go-to-customer', row.customer_id)">去跟进</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="todayList.length === 0" style="text-align:center;padding:20px;color:#909399">今天没有待跟进的客户</div>
      </el-tab-pane>
      <el-tab-pane :label="`明日待跟进 (${upcomingList.length})`" name="upcoming">
        <el-table :data="upcomingList" stripe border max-height="400">
          <el-table-column prop="company_name" label="公司名称" min-width="150" show-overflow-tooltip />
          <el-table-column prop="plan_content" label="计划内容" min-width="200" show-overflow-tooltip />
          <el-table-column prop="plan_time" label="计划时间" width="160">
            <template #default="{ row }">
              {{ row.plan_time ? formatTime(row.plan_time) : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="80" align="center">
            <template #default>
              <el-tag type="warning" size="small">即将到期</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button type="primary" link @click="$emit('go-to-customer', row.customer_id)">去跟进</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="upcomingList.length === 0" style="text-align:center;padding:20px;color:#909399">明天没有待跟进的客户</div>
      </el-tab-pane>
      <el-tab-pane label="逾期跟进" name="follow">
        <el-table :data="reminderList" stripe border max-height="400" v-loading="reminderLoading">
          <el-table-column prop="company_name" label="公司名称" min-width="150" show-overflow-tooltip />
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
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button type="primary" link @click="$emit('go-to-customer', row.customer_id)">去跟进</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane :label="`接近逾期 (${preWarningList.length})`" name="preWarning">
        <el-table :data="preWarningList" stripe border max-height="400">
          <el-table-column prop="company_name" label="公司名称" min-width="150" show-overflow-tooltip />
          <el-table-column prop="overdue_days" label="距逾期天数" width="110" align="center">
            <template #default="{ row }">
              <el-tag type="warning">还剩{{ overdueDaysConfig - row.overdue_days }}天</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="last_follow_time" label="最后跟进" width="160">
            <template #default="{ row }">
              {{ row.last_follow_time ? formatTime(row.last_follow_time) : '从未跟进' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button type="primary" link @click="$emit('go-to-customer', row.customer_id)">去跟进</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="preWarningList.length === 0" style="text-align:center;padding:20px;color:#909399">暂无接近逾期的客户</div>
      </el-tab-pane>
      <el-tab-pane :label="`回款提醒 (${paymentOverdueList.length + paymentUpcomingList.length})`" name="payment">
        <div v-if="paymentUpcomingList.length > 0" style="margin-bottom: 16px">
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px; color: #e6a23c">即将到期</div>
          <el-table :data="paymentUpcomingList" stripe border max-height="200">
            <el-table-column prop="customer_name" label="客户名称" min-width="140" show-overflow-tooltip />
            <el-table-column prop="contract_no" label="合同编号" width="140" />
            <el-table-column prop="plan_date" label="计划日期" width="110" />
            <el-table-column label="未回金额" width="120" align="right">
              <template #default="{ row }">¥{{ fmt(row.plan_amount - row.paid_amount) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }">
                <el-tag type="warning" size="small">还剩{{ row.days_left }}天</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button type="primary" link @click="$emit('go-to-contract', row.contract_id)">查看合同</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div v-if="paymentUpcomingList.length === 0" style="text-align:center;padding:10px;color:#909399;font-size:13px">近期无即将到期的回款</div>
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px; color: #f56c6c">已逾期</div>
        <el-table :data="paymentOverdueList" stripe border max-height="250" v-loading="paymentOverdueLoading">
          <el-table-column prop="customer_name" label="客户名称" min-width="140" show-overflow-tooltip />
          <el-table-column prop="contract_no" label="合同编号" width="140" />
          <el-table-column prop="plan_date" label="计划日期" width="110" />
          <el-table-column label="未回金额" width="120" align="right">
            <template #default="{ row }">¥{{ fmt(row.plan_amount - row.paid_amount) }}</template>
          </el-table-column>
          <el-table-column prop="overdue_days" label="逾期天数" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.overdue_days > 30 ? 'danger' : 'warning'">{{ row.overdue_days }}天</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button type="primary" link @click="$emit('go-to-contract', row.contract_id)">查看合同</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="paymentOverdueList.length === 0" style="text-align:center;padding:10px;color:#909399;font-size:13px">暂无逾期回款</div>
      </el-tab-pane>
      <el-tab-pane :label="`审批待办 (${pendingApprovals.length})`" name="approval">
        <el-table :data="pendingApprovals" stripe border max-height="400">
          <el-table-column prop="title" label="类型" width="130">
            <template #default="{ row }">
              <el-tag :type="row.type === 'quote_approval' ? 'warning' : 'success'" size="small">
                {{ row.type === 'quote_approval' ? '报价审批' : '合同审批' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="content" label="内容" min-width="250" show-overflow-tooltip />
          <el-table-column prop="from_user_name" label="提交人" width="100" />
          <el-table-column prop="create_time" label="时间" width="160">
            <template #default="{ row }">
              {{ formatTime(row.create_time) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button type="primary" link @click="$emit('go-to-approval', row)">去审批</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="pendingApprovals.length === 0" style="text-align:center;padding:20px;color:#909399">暂无待审批事项</div>
      </el-tab-pane>
      <el-tab-pane :label="`催办通知 (${urgeNotifications.length})`" name="urge">
        <el-table :data="urgeNotifications" stripe border max-height="400">
          <el-table-column prop="content" label="催办内容" min-width="300" show-overflow-tooltip />
          <el-table-column prop="from_user_name" label="催办人" width="100" />
          <el-table-column prop="create_time" label="时间" width="160">
            <template #default="{ row }">
              {{ formatTime(row.create_time) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button type="primary" link @click="$emit('go-to-urge-customer', row)">去跟进</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="urgeNotifications.length === 0" style="text-align:center;padding:20px;color:#909399">暂无催办通知</div>
      </el-tab-pane>
      <el-tab-pane :label="`新工单 (${newServiceNotifications.length})`" name="newService">
        <el-table :data="newServiceNotifications" stripe border max-height="400">
          <el-table-column prop="content" label="工单信息" min-width="300" show-overflow-tooltip />
          <el-table-column prop="from_user_name" label="分配人" width="100" />
          <el-table-column prop="create_time" label="时间" width="160">
            <template #default="{ row }">
              {{ formatTime(row.create_time) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button type="primary" link @click="$emit('go-to-new-service', row)">去处理</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="newServiceNotifications.length === 0" style="text-align:center;padding:20px;color:#909399">暂无新工单</div>
      </el-tab-pane>
      <el-tab-pane :label="`超时工单 (${overdueServices.length})`" name="overdueService">
        <el-table :data="overdueServices" stripe border max-height="400">
          <el-table-column prop="order_no" label="工单号" width="140" />
          <el-table-column prop="customer_name" label="客户" min-width="140" show-overflow-tooltip />
          <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
          <el-table-column label="优先级" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="row.priority === 1 ? 'danger' : 'warning'" size="small">{{ row.priority === 1 ? '紧急' : '高' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="超时" width="100" align="center">
            <template #default="{ row }">
              <el-tag type="danger" size="small">{{ row.overdue_hours }}小时</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button type="primary" link @click="$emit('go-to-service', row)">去处理</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="overdueServices.length === 0" style="text-align:center;padding:20px;color:#909399">暂无超时工单</div>
      </el-tab-pane>
    </el-tabs>
    <template #footer>
      <el-button @click="$router.push('/notification')">查看全部</el-button>
      <el-button @click="$emit('update:showReminderDialog', false)">关闭</el-button>
      <el-button type="primary" @click="$emit('mark-all-read')">全部已读</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Fold, Expand, Delete, DataBoard, Clock } from '@element-plus/icons-vue'
import SearchOverlay from '@/components/layout/SearchOverlay.vue'
import QuickActions from '@/components/QuickActions.vue'
import NotificationBadge from '@/components/layout/NotificationBadge.vue'
import UserDropdown from '@/components/layout/UserDropdown.vue'
import { formatTime } from '@/composables/useFormat'
import { getVisits, getVisitPath, getVisitTypeLabel } from '@/composables/useRecentVisit'
import { relativeTime } from '@/composables/useRelativeTime'

const props = defineProps({
  isCollapse: { type: Boolean, default: false },
  userInfo: { type: Object, default: () => ({}) },
  showReminderDialog: { type: Boolean, default: false },
  reminderTab: { type: String, default: 'follow' },
  reminderList: { type: Array, default: () => [] },
  todayList: { type: Array, default: () => [] },
  upcomingList: { type: Array, default: () => [] },
  preWarningList: { type: Array, default: () => [] },
  pendingApprovals: { type: Array, default: () => [] },
  paymentOverdueList: { type: Array, default: () => [] },
  paymentUpcomingList: { type: Array, default: () => [] },
  urgeNotifications: { type: Array, default: () => [] },
  overdueServices: { type: Array, default: () => [] },
  newServiceNotifications: { type: Array, default: () => [] },
  reminderLoading: { type: Boolean, default: false },
  paymentOverdueLoading: { type: Boolean, default: false },
  overdueDaysConfig: { type: Number, default: 15 }
})

const emit = defineEmits([
  'toggle-collapse',
  'open-recycle-bin',
  'update:showReminderDialog',
  'update:reminderTab',
  'mark-all-read',
  'go-to-customer',
  'go-to-contract',
  'go-to-approval',
  'go-to-urge-customer',
  'go-to-service',
  'go-to-new-service'
])

const route = useRoute()
const router = useRouter()

const currentBreadcrumb = computed(() => {
  return route.matched
    .filter(r => r.meta?.title && r.meta.title !== '首页')
    .map(r => ({ name: r.meta.title }))
})

// 统一使用 manageAll/viewAll，禁止依赖固定数字 roleId
const isAdmin = computed(() => props.userInfo.manageAll === true)
const isBoss = computed(() => props.userInfo.viewAll === true)

const recentVisits = ref(getVisits())
watch(() => route.path, () => { recentVisits.value = getVisits() })

const goToVisit = (item) => {
  router.push(getVisitPath(item))
  recentVisits.value = getVisits()
}

const fmt = (v) => {
  if (!v && v !== 0) return '0.00'
  return parseFloat(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })
}
</script>

<style scoped>
.header {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid var(--color-border);
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}

.header-left {
  display: flex;
  align-items: center;
}

.collapse-btn {
  margin-right: 16px;
  color: var(--color-text-secondary);
}

.recent-visit-btn {
  margin-left: 8px;
  color: var(--color-text-secondary);
}

.recent-visit-btn:hover {
  color: var(--color-accent);
}

.recent-visit-item {
  display: flex;
  align-items: center;
  padding: 6px 4px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.recent-visit-item:hover {
  background: var(--color-bg-secondary);
}

.recent-visit-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-visit-time {
  color: var(--color-text-tertiary);
  font-size: 12px;
  margin-left: 8px;
  flex-shrink: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.boss-dashboard-btn {
  margin-right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: var(--color-accent);
}
</style>
