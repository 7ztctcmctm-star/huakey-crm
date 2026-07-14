<template>
  <el-card shadow="never">
    <template #header>
      <div class="quality-header">
        <span>数据质量检查</span>
        <el-button type="primary" size="small" :loading="checking" @click="runCheck">
          开始检查
        </el-button>
      </div>
    </template>

    <div v-if="!report && !checking" class="quality-empty">
      <el-empty description="暂无检查记录" :image-size="60">
        <el-button type="primary" size="small" @click="runCheck">立即检查</el-button>
      </el-empty>
    </div>

    <template v-else-if="report">
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="总记录数">{{ report.total_count }}</el-descriptions-item>
        <el-descriptions-item label="重复记录">
          <span :style="{ color: report.duplicate_count > 0 ? '#e6a23c' : '' }">{{ report.duplicate_count }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="无效记录">
          <span :style="{ color: report.invalid_count > 0 ? '#f56c6c' : '' }">{{ report.invalid_count }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="缺失关键字段">
          <span :style="{ color: report.missing_count > 0 ? '#f56c6c' : '' }">{{ report.missing_count }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="质量评分" :span="2">
          <div class="score-row">
            <el-progress
              :percentage="report.quality_score"
              :stroke-width="14"
              :color="scoreColor"
              style="flex:1"
            />
            <span class="score-label">{{ scoreLabel }}</span>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="检查时间" :span="2">
          {{ report.check_time || '-' }}
        </el-descriptions-item>
      </el-descriptions>

      <!-- 重复明细 -->
      <div v-if="report.duplicate_details && report.duplicate_details.length > 0" style="margin-top: 16px;">
        <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 8px;">
          以下客户名称存在重复记录，建议清理合并
        </el-alert>
        <el-table :data="report.duplicate_details" border size="small" max-height="250">
          <el-table-column prop="name" label="重复名称" min-width="160" show-overflow-tooltip />
          <el-table-column prop="count" label="数量" width="60" align="center">
            <template #default="{ row }">
              <el-tag type="warning" size="small">{{ row.count }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="ids" label="客户ID" width="200">
            <template #default="{ row }">
              {{ row.ids.join(', ') }}
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>
  </el-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { qualityCheck, qualityReport } from '@/api/dataQuality'

const props = defineProps({
  table: { type: String, default: 'crm_customer' }
})

const report = ref(null)
const checking = ref(false)

const scoreColor = [
  { color: '#f56c6c', percentage: 60 },
  { color: '#e6a23c', percentage: 80 },
  { color: '#67c23a', percentage: 100 }
]

const scoreLabel = computed(() => {
  const s = report.value?.quality_score || 0
  if (s >= 90) return '优秀'
  if (s >= 70) return '良好'
  if (s >= 50) return '一般'
  return '较差'
})

const fetchReport = async () => {
  try {
    const res = await qualityReport({ table: props.table })
    if (res.code === 200 && res.data) {
      report.value = res.data
    }
  } catch (e) { console.error('[DataQualityCheck] 获取质量报告失败:', e) }
}

const runCheck = async () => {
  checking.value = true
  try {
    const res = await qualityCheck({ table: props.table })
    if (res.code === 200) {
      report.value = res.data
      ElMessage.success('数据质量检查完成')
    }
  } catch {
    ElMessage.error('检查失败')
  } finally {
    checking.value = false
  }
}

onMounted(() => { fetchReport() })
</script>

<style scoped>
.quality-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.quality-empty {
  padding: 20px 0;
}
.score-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.score-label {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
</style>
