<template>
  <div class="page-container">
    <div class="page-header">
      <h2>评分排行榜</h2>
      <p class="page-desc">客户评分排名，分数越高表示客户价值越大</p>
    </div>
    <el-card>
      <el-table v-loading="loading" :data="tableData" stripe border>
        <el-table-column label="排名" width="70" align="center">
          <template #default="{ $index }">
            <span :class="['rank-badge', $index < 3 ? 'top' : '']">{{ $index + 1 }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="company_name" label="客户名称" min-width="200">
          <template #default="{ row }">
            <span class="link-text" @click="goToCustomer(row.id)">{{ row.company_name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="score" label="评分" width="100" align="center">
          <template #default="{ row }">
            <span class="score-value">{{ row.score }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="level" label="等级" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="levelTagType(row.level)" size="small" effect="dark">{{ row.level || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="owner_name" label="负责人" width="100" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button type="primary" link @click="goToCustomer(row.id)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!loading && tableData.length === 0" style="text-align:center;padding:40px;color:#909399">
        暂无评分数据，请先
        <el-button type="primary" link @click="goToRules">配置评分规则</el-button>
        并计算评分
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'

const router = useRouter()
const loading = ref(false)
const tableData = ref([])

const levelTagType = (level) => {
  const map = { A: 'danger', B: 'warning', C: '', D: 'info' }
  return map[level] || 'info'
}

const fetchRanking = async () => {
  loading.value = true
  try {
    const res = await request.get('/scoring/ranking')
    if (res.code === 200) tableData.value = res.data
  } catch (e) { ElMessage.error('加载排行榜失败') }
  finally { loading.value = false }
}

const goToCustomer = (id) => router.push(`/customer/detail/${id}`)
const goToRules = () => router.push('/scoring/rules')

onMounted(() => { fetchRanking() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.page-desc { margin: var(--space-1) 0 0; font-size: 13px; color: var(--color-text-tertiary); }
.rank-badge {
  display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center;
  border-radius: 50%; font-size: 13px; font-weight: 600; color: #909399; background: #f5f5f5;
}
.rank-badge.top { color: #fff; background: linear-gradient(135deg, #f5a623, #f7c948); }
.score-value { font-size: 18px; font-weight: 700; color: var(--color-accent); }
.link-text { color: var(--color-accent); cursor: pointer; }
.link-text:hover { text-decoration: underline; }
</style>
