<template>
  <div class="opportunity-detail" v-loading="loading">
    <el-page-header @back="goBack" :content="detail ? detail.name : '商机详情'" />

    <div v-if="detail" class="detail-content">
      <!-- 基本信息 -->
      <el-card class="info-card" shadow="never">
        <template #header>
          <span class="card-title">基本信息</span>
        </template>
        <el-descriptions :column="3" border>
          <el-descriptions-item label="商机名称">{{ detail.name }}</el-descriptions-item>
          <el-descriptions-item label="客户名称">{{ detail.customer_name }}</el-descriptions-item>
          <el-descriptions-item label="负责人">{{ detail.owner_name }}</el-descriptions-item>
          <el-descriptions-item label="预计金额">¥{{ formatAmount(detail.expected_amount) }}</el-descriptions-item>
          <el-descriptions-item label="预计成交日">{{ detail.expected_date || '-' }}</el-descriptions-item>
          <el-descriptions-item label="阶段">
            <el-tag :type="stageTagType(detail.stage)">{{ stageName(detail.stage) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="赢单率">
            <el-progress :percentage="detail.win_rate" :stroke-width="14" />
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatTime(detail.create_time) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatTime(detail.update_time) }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="3">{{ detail.remark || '-' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 销售时间轴 -->
      <el-card class="timeline-card" shadow="never">
        <template #header>
          <span class="card-title">销售时间轴</span>
        </template>
        <el-timeline v-if="timeline.length > 0">
          <el-timeline-item
            v-for="(event, index) in timeline"
            :key="index"
            :timestamp="formatTime(event.event_time)"
            :type="timelineEventType(event.type)"
          >
            <div class="timeline-content">
              <el-tag size="small" :type="timelineEventType(event.type)">
                {{ eventTypeLabel(event.type) }}
              </el-tag>
              <span class="timeline-desc">{{ eventDescription(event) }}</span>
              <span class="timeline-user" v-if="event.user_name">— {{ event.user_name }}</span>
            </div>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="暂无时间轴数据" />
      </el-card>

      <!-- 阶段变更日志 -->
      <el-card class="stage-log-card" shadow="never">
        <template #header>
          <span class="card-title">阶段变更日志</span>
        </template>
        <el-table :data="stageLogs" stripe v-if="stageLogs.length > 0">
          <el-table-column label="变更时间" width="170">
            <template #default="{ row }">{{ formatTime(row.changed_at) }}</template>
          </el-table-column>
          <el-table-column label="阶段变化" width="200">
            <template #default="{ row }">
              <el-tag size="small" type="info">{{ stageName(row.from_stage) }}</el-tag>
              →
              <el-tag size="small" :type="stageTagType(row.to_stage)">{{ stageName(row.to_stage) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="变更原因" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ row.change_reason || '-' }}</template>
          </el-table-column>
          <el-table-column label="操作人" width="120">
            <template #default="{ row }">{{ row.changed_by_name || '-' }}</template>
          </el-table-column>
          <el-table-column label="停留时长" width="120" align="center">
            <template #default="{ row }">
              {{ row.hours_in_stage ? row.hours_in_stage + '小时' : '-' }}
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="暂无阶段变更记录" />
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getOpportunityDetail, getOpportunityStageLog, getOpportunityTimeline } from '@/api/opportunity'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const detail = ref(null)
const stageLogs = ref([])
const timeline = ref([])

const STAGE_MAP = {
  1: '询盘',
  2: '需求确认',
  3: '方案报价',
  4: '谈判',
  5: '成交',
  6: '失败'
}

const STAGE_TAG_TYPE = {
  1: 'info',
  2: '',
  3: 'warning',
  4: 'warning',
  5: 'success',
  6: 'danger'
}

const stageName = (stage) => STAGE_MAP[stage] || '未知'
const stageTagType = (stage) => STAGE_TAG_TYPE[stage] || 'info'

const formatAmount = (val) => {
  if (!val) return '0.00'
  return Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatTime = (val) => {
  if (!val) return '-'
  return new Date(val).toLocaleString('zh-CN', { hour12: false })
}

const timelineEventType = (type) => {
  const map = { stage_change: 'primary', quote: 'warning', contract: 'success' }
  return map[type] || 'info'
}

const eventTypeLabel = (type) => {
  const map = { stage_change: '阶段变更', quote: '报价单', contract: '合同' }
  return map[type] || type
}

const eventDescription = (event) => {
  if (event.type === 'stage_change') {
    return `${stageName(event.from_stage)} → ${stageName(event.to_stage)}`
  }
  if (event.type === 'quote') {
    return `报价单 ${event.quote_no} ¥${formatAmount(event.final_amount || event.amount)}`
  }
  if (event.type === 'contract') {
    return `合同 ${event.contract_no} ¥${formatAmount(event.amount)}`
  }
  return ''
}

const goBack = () => {
  router.push('/opportunity')
}

const loadDetail = async () => {
  loading.value = true
  try {
    const id = route.params.id
    const [detailRes, logRes, timelineRes] = await Promise.all([
      getOpportunityDetail(id),
      getOpportunityStageLog(id),
      getOpportunityTimeline(id)
    ])
    if (detailRes.code === 200) detail.value = detailRes.data
    if (logRes.code === 200) stageLogs.value = logRes.data
    if (timelineRes.code === 200) timeline.value = timelineRes.data
  } catch {
    ElMessage.error('加载商机详情失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadDetail)
</script>

<style scoped>
.opportunity-detail {
  padding: 20px;
}

.detail-content {
  margin-top: 20px;
}

.info-card,
.timeline-card,
.stage-log-card {
  margin-bottom: 20px;
}

.card-title {
  font-weight: bold;
  font-size: 16px;
}

.timeline-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timeline-desc {
  margin-left: 8px;
}

.timeline-user {
  color: #909399;
  font-size: 13px;
}
</style>
