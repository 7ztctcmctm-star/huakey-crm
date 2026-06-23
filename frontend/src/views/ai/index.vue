<template>
  <div class="ai-page">
    <div class="page-header">
      <h2>AI建议</h2>
      <div class="header-actions">
        <el-select v-model="filterType" placeholder="类型筛选" clearable @change="fetchSuggestions" style="width: 120px; margin-right: 12px">
          <el-option label="全部" value="" />
          <el-option label="跟进提醒" value="follow_up" />
          <el-option label="商机推进" value="opportunity" />
          <el-option label="定价建议" value="pricing" />
        </el-select>
        <el-button type="primary" :icon="Refresh" @click="handleGenerate" :loading="generating">生成建议</el-button>
      </div>
    </div>

    <div v-loading="loading">
      <div v-if="suggestions.length === 0 && !loading" class="empty-state">
        <el-empty description="暂无AI建议，点击「生成建议」开始扫描">
          <el-button type="primary" @click="handleGenerate" :loading="generating">生成建议</el-button>
        </el-empty>
      </div>

      <div v-else class="suggestion-list">
        <div v-for="item in suggestions" :key="item.id" class="suggestion-card" :class="{ accepted: item.is_accepted === 1, ignored: item.is_accepted === 2 }">
          <div class="suggestion-header">
            <el-tag :type="getTypeTagType(item.type)" size="small">{{ getTypeLabel(item.type) }}</el-tag>
            <span class="suggestion-ref" @click="goToRef(item)">{{ item.ref_name || '未知' }}</span>
            <el-tag v-if="item.confidence" size="small" type="info">置信度 {{ Math.round(item.confidence * 100) }}%</el-tag>
          </div>
          <div class="suggestion-body">{{ item.suggestion }}</div>
          <div class="suggestion-footer">
            <span class="suggestion-time">{{ item.create_time }}</span>
            <div class="suggestion-actions" v-if="item.is_accepted === 0">
              <el-button type="primary" size="small" @click="handleFeedback(item.id, 1)">采纳</el-button>
              <el-button size="small" @click="handleFeedback(item.id, 2)">忽略</el-button>
            </div>
            <el-tag v-else-if="item.is_accepted === 1" type="success" size="small">已采纳</el-tag>
            <el-tag v-else type="info" size="small">已忽略</el-tag>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { getAiSuggestions, generateAiSuggestions, aiSuggestionFeedback } from '@/api/ai'
import request from '@/utils/request'

const router = useRouter()
const loading = ref(false)
const generating = ref(false)
const filterType = ref('')
const suggestions = ref([])

const getTypeLabel = (type) => ({ follow_up: '跟进提醒', opportunity: '商机推进', pricing: '定价建议', customer: '客户关注' }[type] || type)
const getTypeTagType = (type) => ({ follow_up: 'warning', opportunity: '', pricing: 'danger', customer: 'success' }[type] || 'info')

const fetchSuggestions = async () => {
  loading.value = true
  try {
    const params = filterType.value ? `?type=${filterType.value}` : ''
    const res = await getAiSuggestions(params)
    if (res.code === 200) suggestions.value = res.data.list
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

const handleGenerate = async () => {
  generating.value = true
  try {
    const res = await generateAiSuggestions()
    if (res.code === 200) {
      ElMessage.success(res.message)
      fetchSuggestions()
    }
  } catch (e) { console.error(e) }
  finally { generating.value = false }
}

const handleFeedback = async (id, isAccepted) => {
  try {
    const res = await aiSuggestionFeedback({ id, is_accepted: isAccepted })
    if (res.code === 200) {
      const item = suggestions.value.find(s => s.id === id)
      if (item) item.is_accepted = isAccepted
      ElMessage.success(isAccepted === 1 ? '已采纳' : '已忽略')
    }
  } catch (e) { console.error(e) }
}

const goToRef = (item) => {
  if ((item.type === 'follow_up' || item.type === 'customer') && item.ref_id) {
    router.push(`/customer/detail/${item.ref_id}`)
  } else if ((item.type === 'opportunity' || item.type === 'pricing') && item.ref_id) {
    router.push(`/opportunity`)
  }
}

onMounted(() => { fetchSuggestions() })
</script>

<style scoped>
.ai-page { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.header-actions { display: flex; align-items: center; }
.empty-state { padding: var(--space-7) 0; }

.suggestion-list { display: flex; flex-direction: column; gap: var(--space-3); }
.suggestion-card {
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  transition: box-shadow 0.2s var(--ease-out);
}
.suggestion-card:hover { box-shadow: var(--shadow-md); }
.suggestion-card.accepted { border-left: 3px solid var(--color-success); background: var(--color-success-bg); }
.suggestion-card.ignored { opacity: 0.6; }

.suggestion-header { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
.suggestion-ref {
  font-weight: 500;
  color: var(--color-accent);
  cursor: pointer;
  flex: 1;
}
.suggestion-ref:hover { text-decoration: underline; }

.suggestion-body { font-size: 14px; color: var(--color-text); line-height: 1.6; margin-bottom: var(--space-2); }

.suggestion-footer { display: flex; justify-content: space-between; align-items: center; }
.suggestion-time { font-size: 12px; color: var(--color-text-tertiary); }
.suggestion-actions { display: flex; gap: var(--space-2); }
</style>
