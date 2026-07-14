<template>
  <div class="sales-timeline">
    <el-timeline v-if="events.length > 0">
      <el-timeline-item
        v-for="event in events"
        :key="`${event.type}-${event.id}`"
        :timestamp="formatTime(event.event_time)"
        placement="top"
        :type="timelineType(event.type)"
      >
        <div class="timeline-content">
          <el-tag :type="timelineType(event.type)" size="small" effect="dark">
            {{ typeLabel(event.type) }}
          </el-tag>

          <!-- 阶段变更 -->
          <template v-if="event.type === 'stage_change'">
            <span class="stage-transition">
              {{ stageMap[event.from_stage] || '初始' }} → {{ stageMap[event.to_stage] || event.to_stage }}
            </span>
            <span v-if="event.user_name" class="user-name">{{ event.user_name }}</span>
          </template>

          <!-- 报价单 -->
          <template v-if="event.type === 'quote'">
            <span class="item-no">{{ event.quote_no }}</span>
            <span class="item-amount">¥{{ formatAmount(event.final_amount || event.amount) }}</span>
            <el-tag :type="quoteStatusType(event.status)" size="small">{{ quoteStatusLabel(event.status) }}</el-tag>
          </template>

          <!-- 合同 -->
          <template v-if="event.type === 'contract'">
            <span class="item-no">{{ event.contract_no }}</span>
            <span class="item-amount">¥{{ formatAmount(event.amount) }}</span>
            <el-tag :type="contractStatusType(event.status)" size="small">{{ contractStatusLabel(event.status) }}</el-tag>
          </template>

          <span v-if="event.user_name && event.type !== 'stage_change'" class="user-name">{{ event.user_name }}</span>
        </div>
      </el-timeline-item>
    </el-timeline>
    <el-empty v-else description="暂无销售时间轴数据" />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getOpportunityTimeline } from '@/api/opportunity'
import { formatTime, formatAmount } from '@/composables/useFormat'

const props = defineProps({
  opportunityId: { type: [Number, String], default: null }
})

const events = ref([])
const loading = ref(false)

const stageMap = { 1: '询盘', 2: '需求确认', 3: '方案报价', 4: '谈判', 5: '成交', 6: '失败' }

const typeLabel = (type) => {
  const map = { stage_change: '阶段变更', quote: '报价单', contract: '合同' }
  return map[type] || type
}

const timelineType = (type) => {
  const map = { stage_change: 'primary', quote: 'warning', contract: 'success' }
  return map[type] || 'info'
}

const quoteStatusLabel = (status) => {
  const map = { 1: '草稿', 2: '已发送', 3: '已确认', 4: '已失效' }
  return map[status] || '未知'
}

const quoteStatusType = (status) => {
  const map = { 1: 'info', 2: 'warning', 3: 'success', 4: 'danger' }
  return map[status] || 'info'
}

const contractStatusLabel = (status) => {
  const map = { 1: '待执行', 2: '执行中', 3: '已完成', 4: '已取消' }
  return map[status] || '未知'
}

const contractStatusType = (status) => {
  const map = { 1: 'info', 2: 'warning', 3: 'success', 4: 'danger' }
  return map[status] || 'info'
}

const fetchTimeline = async () => {
  if (!props.opportunityId) return
  loading.value = true
  try {
    const res = await getOpportunityTimeline(props.opportunityId)
    if (res.code === 200) {
      events.value = res.data
    }
  } catch (error) {
    console.error('获取时间轴失败:', error)
    ElMessage.error('获取时间轴失败')
  } finally {
    loading.value = false
  }
}

watch(() => props.opportunityId, () => fetchTimeline(), { immediate: true })

defineExpose({ loading })
</script>

<style scoped>
.sales-timeline {
  padding: 8px 0;
}

.timeline-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.stage-transition {
  font-weight: 600;
  color: var(--color-text);
}

.item-no {
  font-weight: 500;
  color: var(--color-text);
}

.item-amount {
  color: var(--color-text-secondary);
  font-weight: 600;
}

.user-name {
  color: var(--color-text-tertiary);
  font-size: 12px;
}
</style>
