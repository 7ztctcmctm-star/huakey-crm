<template>
  <el-row :gutter="24" style="margin-top: 16px">
    <el-col :span="24">
      <el-card shadow="never" class="todo-card" :class="{ 'has-overdue': overdueCount > 0 }">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              <el-icon><Bell /></el-icon> 今日待办
              <el-badge v-if="todayTasks.follow_count > 0" :value="todayTasks.follow_count" class="todo-badge" type="danger" />
            </span>
            <div class="todo-summary">
              <el-tag v-if="todayTasks.follow_count > 0" type="warning" effect="dark">
                {{ todayTasks.follow_count }} 个待跟进
              </el-tag>
              <el-tag v-if="todayTasks.service_count > 0" type="danger" effect="dark" style="margin-left: 8px">
                {{ todayTasks.service_count }} 个待处理工单
              </el-tag>
              <el-tag v-if="overdueCount > 0" type="danger" effect="plain" style="margin-left: 8px">
                {{ overdueCount }} 个逾期跟进
              </el-tag>
            </div>
          </div>
        </template>
        <el-tabs v-model="activeTab" class="todo-tabs">
          <el-tab-pane label="待跟进" name="follow">
            <div v-if="followLoading" v-loading="followLoading" style="min-height: 100px" />
            <div v-else-if="todayTasks.follow_list && todayTasks.follow_list.length > 0" class="todo-list">
              <div v-for="item in todayTasks.follow_list" :key="'f-' + item.id"
                   class="todo-item" :class="{ 'overdue': isOverdue(item.next_time) }"
                   @click="$emit('go-customer', item.customer_id)">
                <div class="todo-item-left">
                  <el-tag :type="followTypeTag(item.follow_type)" size="small">{{ item.follow_type }}</el-tag>
                  <span class="todo-customer">{{ item.company_name || '未知客户' }}</span>
                  <el-tag v-if="isOverdue(item.next_time)" type="danger" size="small" effect="dark">逾期</el-tag>
                </div>
                <div class="todo-item-right">
                  <span class="todo-time">{{ formatTimeShort(item.next_time) }}</span>
                  <el-button type="primary" link size="small" @click.stop="$emit('go-follow', item)">跟进</el-button>
                </div>
              </div>
            </div>
            <el-empty v-else description="今日没有待跟进任务" :image-size="60" />
          </el-tab-pane>
          <el-tab-pane label="待处理工单" name="service">
            <div v-if="serviceLoading" v-loading="serviceLoading" style="min-height: 100px" />
            <div v-else-if="todayTasks.service_list && todayTasks.service_list.length > 0" class="todo-list">
              <div v-for="item in todayTasks.service_list" :key="'s-' + item.id" class="todo-item" @click="$emit('go-service', item.id)">
                <div class="todo-item-left">
                  <el-tag :type="getPriorityTag(item.priority)" size="small">{{ getPriorityText(item.priority) }}</el-tag>
                  <span class="todo-title">{{ item.title }}</span>
                </div>
                <div class="todo-item-right">
                  <el-tag size="small">{{ getServiceStatus(item.status) }}</el-tag>
                  <el-button type="primary" link size="small" @click.stop="$emit('handle-service', item)">处理</el-button>
                </div>
              </div>
            </div>
            <el-empty v-else description="没有待处理工单" :image-size="60" />
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </el-col>
  </el-row>
</template>

<script setup>
import { ref } from 'vue'
import { Bell } from '@element-plus/icons-vue'

defineProps({
  todayTasks: { type: Object, required: true },
  followLoading: { type: Boolean, default: false },
  serviceLoading: { type: Boolean, default: false },
  overdueCount: { type: Number, default: 0 }
})

defineEmits(['go-customer', 'go-follow', 'go-service', 'handle-service'])

const activeTab = ref('follow')

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
  return new Date(time).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const isOverdue = (nextTime) => {
  if (!nextTime) return false
  return new Date(nextTime) < new Date()
}
</script>

<style scoped>
.todo-card {
  border-left: 4px solid var(--color-accent);
  border-radius: var(--radius-lg);
}

.todo-card.has-overdue {
  border-left: 4px solid var(--color-danger);
}

.todo-badge {
  margin-left: 8px;
}

.todo-summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.todo-tabs :deep(.el-tabs__header) {
  margin-bottom: 8px;
}

.todo-list {
  max-height: 300px;
  overflow-y: auto;
}

.todo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  transition: background 0.2s var(--ease-out);
  border-radius: var(--radius-sm);
}

.todo-item:hover {
  background: var(--color-bg-secondary);
}

.todo-item:last-child {
  border-bottom: none;
}

.todo-item.overdue {
  background: var(--color-danger-bg);
  border-left: 3px solid var(--color-danger);
}

.todo-item.overdue:hover {
  background: rgba(255, 69, 58, 0.12);
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
  color: var(--color-text);
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
  color: var(--color-text-secondary);
}
</style>
