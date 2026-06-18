<template>
  <el-table
    v-loading="loading"
    :data="customers"
    stripe
    border
    style="width: 100%"
    @selection-change="$emit('selection-change', $event)"
    :row-class-name="tableRowClass"
  >
    <el-table-column type="selection" width="50" />
    <el-table-column prop="company_name" label="客户名称" min-width="180" show-overflow-tooltip>
      <template #default="{ row }">
        <el-link type="primary" @click="$emit('view-detail', row)">{{ row.company_name }}</el-link>
      </template>
    </el-table-column>
    <el-table-column prop="contact_name" label="联系人" width="100" />
    <el-table-column prop="phone" label="电话" width="130" />
    <el-table-column prop="source" label="来源" width="90">
      <template #default="{ row }">
        <el-tag size="small" :type="getSourceTag(row.source)">{{ row.source || '-' }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column prop="level" label="等级" width="80" align="center">
      <template #default="{ row }">
        <el-tag :type="getLevelTag(row.level)" size="small">{{ row.level || '-' }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column prop="status" label="状态" width="80" align="center">
      <template #default="{ row }">
        <el-tag :type="getStatusTag(row.status)" size="small">{{ getStatusText(row.status) }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column prop="owner_name" label="负责人" width="90" />
    <el-table-column prop="last_follow_time" label="最后跟进" width="150">
      <template #default="{ row }">
        <span :class="{ 'overdue-text': isOverdue(row.last_follow_time) }">
          {{ row.last_follow_time ? formatTime(row.last_follow_time) : '从未跟进' }}
        </span>
      </template>
    </el-table-column>
    <el-table-column prop="create_time" label="创建时间" width="150">
      <template #default="{ row }">
        {{ formatTime(row.create_time) }}
      </template>
    </el-table-column>
    <el-table-column label="操作" width="200" fixed="right">
      <template #default="{ row }">
        <el-button type="primary" link size="small" @click="$emit('view-detail', row)">查看</el-button>
        <el-button type="primary" link size="small" @click="$emit('edit', row)" v-if="canEdit(row)">编辑</el-button>
        <el-button type="primary" link size="small" @click="$emit('follow', row)">跟进</el-button>
        <el-button type="danger" link size="small" @click="$emit('delete', row)" v-if="canDelete(row)">删除</el-button>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup>
import { formatTime } from '@/composables/useFormat'

defineProps({
  customers: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  overdueDays: { type: Number, default: 15 }
})

defineEmits(['selection-change', 'view-detail', 'edit', 'follow', 'delete'])

const tableRowClass = ({ row }) => {
  if (row.status === 0) return 'deleted-row'
  return ''
}

const getSourceTag = (source) => {
  const map = { '线上': '', '线下': 'success', '转介绍': 'warning', '其他': 'info' }
  return map[source] || 'info'
}

const getLevelTag = (level) => {
  const map = { 'A': 'danger', 'B': 'warning', 'C': '', 'D': 'info' }
  return map[level] || 'info'
}

const getStatusTag = (status) => {
  const map = { 1: 'primary', 2: 'success', 3: 'danger', 0: 'info' }
  return map[status] || 'info'
}

const getStatusText = (status) => {
  const map = { 1: '潜客', 2: '成交', 3: '流失', 0: '已删除' }
  return map[status] || '-'
}

const isOverdue = (lastFollowTime) => {
  if (!lastFollowTime) return true
  const days = 15
  const diff = (Date.now() - new Date(lastFollowTime).getTime()) / 86400000
  return diff > days
}

const canEdit = (row) => row.status !== 0
const canDelete = (row) => row.status !== 0
</script>

<style scoped>
.overdue-text {
  color: var(--color-danger);
  font-weight: 500;
}

:deep(.deleted-row) {
  opacity: 0.5;
}
</style>
