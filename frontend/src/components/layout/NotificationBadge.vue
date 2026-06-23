<template>
  <el-popover trigger="click" width="380" :show-after="0" @show="fetchNotificationCenter" placement="bottom-end">
    <template #reference>
      <el-badge :value="centerUnreadCount" :hidden="centerUnreadCount === 0" :max="99" class="reminder-bell">
        <el-button link>
          <el-icon :size="20"><Bell /></el-icon>
        </el-button>
      </el-badge>
    </template>
    <div class="notify-panel">
      <div class="notify-tabs">
        <span :class="['notify-tab', { active: notifyTab === 'todo' }]" @click="notifyTab = 'todo'">待办</span>
        <span :class="['notify-tab', { active: notifyTab === 'system' }]" @click="notifyTab = 'system'">系统</span>
      </div>
      <div class="notify-body" v-loading="notifyLoading">
        <!-- 待办Tab -->
        <div v-if="notifyTab === 'todo'">
          <div v-if="centerData.todo?.approvals?.length" class="notify-group">
            <div class="notify-group-title">审批待处理</div>
            <div v-for="item in centerData.todo.approvals" :key="'a'+item.id" class="notify-item" @click="$router.push(item.link)">
              <div class="notify-dot" />
              <div class="notify-content">
                <div class="notify-title">{{ item.title }}</div>
                <div class="notify-time">{{ item.time }}</div>
              </div>
            </div>
          </div>
          <div v-if="centerData.todo?.followups?.length" class="notify-group">
            <div class="notify-group-title">今日待跟进</div>
            <div v-for="item in centerData.todo.followups" :key="'f'+item.id" class="notify-item" @click="$router.push(item.link)">
              <div class="notify-dot" />
              <div class="notify-content">
                <div class="notify-title">{{ item.title }}</div>
                <div class="notify-time">{{ item.time }}</div>
              </div>
            </div>
          </div>
          <div v-if="centerData.todo?.stock_alerts?.length" class="notify-group">
            <div class="notify-group-title">库存预警</div>
            <div v-for="item in centerData.todo.stock_alerts" :key="'s'+item.id" class="notify-item" @click="$router.push(item.link)">
              <div class="notify-dot" />
              <div class="notify-content">
                <div class="notify-title">{{ item.title }}</div>
                <div class="notify-time">{{ item.time }}</div>
              </div>
            </div>
          </div>
          <div v-if="centerData.todo?.payment_overdue?.length" class="notify-group">
            <div class="notify-group-title">回款逾期</div>
            <div v-for="item in centerData.todo.payment_overdue" :key="'p'+item.id" class="notify-item" @click="$router.push(item.link)">
              <div class="notify-dot warn" />
              <div class="notify-content">
                <div class="notify-title">{{ item.title }}</div>
                <div class="notify-time">{{ item.time }}</div>
              </div>
            </div>
          </div>
          <el-empty v-if="!notifyLoading && !hasTodoItems" description="暂无待办" :image-size="48" />
        </div>
        <!-- 系统Tab -->
        <div v-if="notifyTab === 'system'">
          <div v-for="item in centerData.system" :key="'n'+item.id" class="notify-item" :class="{ read: item.is_read }" @click="handleNotifyClick(item)">
            <div :class="['notify-dot', { hide: item.is_read }]" />
            <div class="notify-content">
              <div class="notify-title">{{ item.title }}</div>
              <div class="notify-desc">{{ item.content }}</div>
              <div class="notify-time">{{ item.time }}</div>
            </div>
          </div>
          <el-empty v-if="!notifyLoading && centerData.system?.length === 0" description="暂无通知" :image-size="48" />
        </div>
      </div>
      <div class="notify-footer">
        <el-button link size="small" @click="markCenterAllRead">全部已读</el-button>
        <el-button link size="small" type="primary" @click="$router.push('/notification')">查看全部</el-button>
      </div>
    </div>
  </el-popover>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Bell } from '@element-plus/icons-vue'
import { markAllRead, getReminderCenter } from '@/api/notification'

const router = useRouter()

const notifyTab = ref('todo')
const notifyLoading = ref(false)
const centerData = ref({ todo: { approvals: [], followups: [], stock_alerts: [], payment_overdue: [] }, system: [], unread_count: 0 })
const centerUnreadCount = computed(() => centerData.value.unread_count || 0)
const hasTodoItems = computed(() => {
  const t = centerData.value.todo
  return t && (t.approvals?.length || t.followups?.length || t.stock_alerts?.length || t.payment_overdue?.length)
})

const fetchNotificationCenter = async () => {
  notifyLoading.value = true
  try {
    const res = await getReminderCenter()
    if (res.code === 200) centerData.value = res.data
  } catch { /* */ }
  finally { notifyLoading.value = false }
}

const markCenterAllRead = async () => {
  try {
    await markAllRead()
    centerData.value.unread_count = 0
    centerData.value.system?.forEach(n => n.is_read = 1)
  } catch { /* */ }
}

const handleNotifyClick = (item) => {
  if (!item.is_read) item.is_read = 1
  if (item.link) router.push(item.link)
}
</script>

<style scoped>
.notify-panel {
  max-height: 500px;
}

.notify-tabs {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
  padding-bottom: 8px;
}

.notify-tab {
  cursor: pointer;
  font-size: 14px;
  color: #909399;
  padding-bottom: 4px;
}

.notify-tab.active {
  color: #303133;
  font-weight: 600;
  border-bottom: 2px solid #409eff;
}

.notify-body {
  max-height: 350px;
  overflow-y: auto;
}

.notify-group {
  margin-bottom: 12px;
}

.notify-group-title {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
  font-weight: 600;
}

.notify-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;
}

.notify-item:hover {
  background: #f5f7fa;
}

.notify-item.read {
  opacity: 0.6;
}

.notify-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #409eff;
  margin-top: 6px;
  flex-shrink: 0;
}

.notify-dot.warn {
  background: #e6a23c;
}

.notify-dot.hide {
  background: transparent;
}

.notify-content {
  flex: 1;
  min-width: 0;
}

.notify-title {
  font-size: 13px;
  color: #303133;
  line-height: 1.4;
}

.notify-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notify-time {
  font-size: 11px;
  color: #c0c4cc;
  margin-top: 2px;
}

.notify-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}
</style>
