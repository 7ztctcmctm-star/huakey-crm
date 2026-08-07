<template>
  <div class="page-container">
    <div class="page-header">
      <h2>销售资料</h2>
      <p class="page-desc">产品知识、销售话术、常见问题、文档模板一站式管理</p>
    </div>

    <!-- 四宫格入口 -->
    <div class="entry-grid">
      <div class="entry-card" v-for="entry in entries" :key="entry.key" @click="$router.push(entry.path)">
        <div class="entry-icon" :style="{ background: entry.bg }">
          <el-icon :size="32" :color="entry.color"><component :is="entry.icon" /></el-icon>
        </div>
        <div class="entry-info">
          <div class="entry-title">{{ entry.title }}</div>
          <div class="entry-count">{{ stats.counts[entry.key] || 0 }} 条</div>
        </div>
      </div>
    </div>

    <!-- 最近更新 -->
    <el-row :gutter="20" style="margin-top: 24px">
      <el-col :span="12" v-for="section in recentSections" :key="section.key">
        <el-card shadow="never" class="recent-card">
          <template #header>
            <div class="recent-header">
              <span>{{ section.title }}</span>
              <el-button type="primary" link @click="$router.push(section.path)">查看全部</el-button>
            </div>
          </template>
          <div v-if="section.items.length === 0" class="empty-tip">暂无数据</div>
          <div v-for="item in section.items" :key="item.id" class="recent-item" @click="$router.push(section.path)">
            <span class="recent-name">{{ item.name || item.title || item.question }}</span>
            <span class="recent-tag" v-if="item.category || item.scene || item.type">{{ item.category || item.scene || item.type }}</span>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Box, ChatLineSquare, QuestionFilled, Folder } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { getKnowledgeStats } from '@/api/tools'

const stats = ref({ counts: { products: 0, scripts: 0, faqs: 0, documents: 0 }, recent: { products: [], scripts: [], faqs: [], documents: [] } })

const entries = [
  { key: 'products', title: '产品知识', path: '/knowledge/products', icon: Box, bg: '#f0f9ff', color: '#0071e3' },
  { key: 'scripts', title: '销售话术', path: '/knowledge/scripts', icon: ChatLineSquare, bg: '#f0fdf4', color: '#059669' },
  { key: 'faqs', title: '常见问题', path: '/knowledge/faqs', icon: QuestionFilled, bg: '#fffbeb', color: '#d97706' },
  { key: 'documents', title: '文档模板', path: '/knowledge/documents', icon: Folder, bg: '#fdf2f8', color: '#be185d' }
]

const recentSections = computed(() => [
  { key: 'products', title: '最近更新产品', path: '/knowledge/products', items: stats.value.recent.products || [] },
  { key: 'scripts', title: '最近更新话术', path: '/knowledge/scripts', items: stats.value.recent.scripts || [] },
  { key: 'faqs', title: '最近更新FAQ', path: '/knowledge/faqs', items: stats.value.recent.faqs || [] },
  { key: 'documents', title: '最近更新文档', path: '/knowledge/documents', items: stats.value.recent.documents || [] }
])

const fetchStats = async () => {
  try {
    const res = await getKnowledgeStats()
    if (res.code === 200) stats.value = res.data
  } catch (e) { /* */ }
}

onMounted(() => { fetchStats() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.page-desc { margin: var(--space-1) 0 0; font-size: 13px; color: var(--color-text-tertiary); }

.entry-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.entry-card {
  display: flex; align-items: center; gap: 16px; padding: 24px;
  background: #fff; border-radius: 16px; cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}
.entry-card:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
.entry-icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.entry-title { font-size: 16px; font-weight: 600; color: var(--color-text); }
.entry-count { font-size: 13px; color: var(--color-text-tertiary); margin-top: 4px; }

.recent-card { margin-bottom: 0; }
.recent-header { display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
.recent-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 0; border-bottom: 1px solid var(--color-border);
  cursor: pointer; transition: background 0.15s;
}
.recent-item:last-child { border-bottom: none; }
.recent-item:hover { background: var(--color-bg-secondary); margin: 0 -20px; padding: 10px 20px; }
.recent-name { font-size: 14px; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
.recent-tag { font-size: 12px; color: var(--color-text-tertiary); background: var(--color-bg-secondary); padding: 2px 8px; border-radius: 4px; }
.empty-tip { text-align: center; color: var(--color-text-tertiary); padding: 20px; font-size: 13px; }

@media (max-width: 1200px) { .entry-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
