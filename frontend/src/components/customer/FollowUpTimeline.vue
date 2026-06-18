<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header">
        <span class="card-title">跟进记录</span>
        <el-button type="primary" size="small" @click="$emit('add-follow')">添加跟进</el-button>
      </div>
    </template>

    <div v-loading="loading">
      <el-timeline v-if="records.length > 0">
        <el-timeline-item
          v-for="item in records"
          :key="item.id"
          :timestamp="formatTime(item.create_time)"
          placement="top"
          :type="getTimelineType(item.follow_type)"
        >
          <el-card shadow="never" class="timeline-card">
            <div class="timeline-header">
              <el-tag :type="getFollowTypeTag(item.follow_type)" size="small">{{ item.follow_type }}</el-tag>
              <span class="timeline-user">{{ item.user_name || '未知' }}</span>
            </div>
            <div class="timeline-content">{{ item.content }}</div>
            <div v-if="item.next_time" class="timeline-next">
              下次跟进：{{ formatTime(item.next_time) }}
            </div>
          </el-card>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-else description="暂无跟进记录" :image-size="60" />
    </div>
  </el-card>
</template>

<script setup>
import { formatTime } from '@/composables/useFormat'

defineProps({
  records: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})

defineEmits(['add-follow'])

const getTimelineType = (type) => {
  const map = { '电话': 'warning', '拜访': 'success', '微信': '', '邮件': 'info' }
  return map[type] || ''
}

const getFollowTypeTag = (type) => {
  const map = { '电话': 'warning', '拜访': 'success', '微信': '', '邮件': 'info', '其他': '' }
  return map[type] || ''
}
</script>

<style scoped>
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
}

.timeline-card {
  margin-bottom: 0;
}

.timeline-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.timeline-user {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.timeline-content {
  font-size: 14px;
  color: var(--color-text);
  line-height: 1.6;
}

.timeline-next {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-top: 8px;
}
</style>
