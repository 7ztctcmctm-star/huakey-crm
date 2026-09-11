<template>
  <div class="page-container">
    <div class="page-header">
      <h2>评分排行榜</h2>
      <p class="page-desc">客户评分排名，分数越高表示客户价值越大</p>
    </div>
    <el-card>
      <StateWrapper
        :loading="loading"
        :error="errorMsg"
        :empty="!loading && tableData.length === 0"
        empty-text="暂无排名"
        empty-description="请先配置评分规则并计算评分"
        @retry="fetchRanking"
      >
        <template #loading>
          <TableSkeleton :rows="8" :cols="5" />
        </template>
        <template #empty-action>
          <el-button type="primary" size="small" @click="goToRules">配置评分规则</el-button>
        </template>
      <el-table
        :data="tableData"
        stripe
        border>
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
      </StateWrapper>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import StateWrapper from '@/components/common/StateWrapper.vue'
import { reportError } from '@/utils/error'
import { getScoringRanking } from '@/api/system'

const router = useRouter()
// onMounted 无条件取数，初值 true 消除首帧空态闪现
const loading = ref(true)
const errorMsg = ref('')
const tableData = ref([])

const levelTagType = (level) => {
  const map = { A: 'danger', B: 'warning', C: '', D: 'info' }
  return map[level] || 'info'
}

const fetchRanking = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await getScoringRanking()
    if (res.code === 200) tableData.value = res.data
    else {
      errorMsg.value = res.message || '加载排名失败，请稍后重试'
      reportError('获取评分排行榜失败:', res.message)
    }
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || '加载排名失败，请稍后重试'
    ElMessage.error('加载排行榜失败')
    reportError('获取评分排行榜失败:', e)
  }
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
  border-radius: 50%; font-size: 13px; font-weight: 600; color: var(--color-text-secondary); background: #f5f5f5;
}
.rank-badge.top { color: #fff; background: linear-gradient(135deg, #f5a623, #f7c948); }
.score-value { font-size: 18px; font-weight: 700; color: var(--color-accent); }
.link-text { color: var(--color-accent); cursor: pointer; }
.link-text:hover { text-decoration: underline; }
</style>
