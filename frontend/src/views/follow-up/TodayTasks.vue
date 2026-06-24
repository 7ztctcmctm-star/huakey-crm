<template>
  <div class="page-container">
    <div class="page-header">
      <h2>今日待跟进</h2>
      <p class="page-desc">今天需要跟进的客户列表</p>
    </div>

    <el-card>
      <el-table :data="taskList" border stripe v-loading="loading" empty-text="今日没有待跟进任务">
        <el-table-column type="index" width="50" />
        <el-table-column prop="company_name" label="客户名称" min-width="150">
          <template #default="{ row }">
            <el-button type="primary" link @click="goCustomer(row.customer_id)">
              {{ row.company_name || '未知客户' }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="customer_contact" label="联系人" width="100" />
        <el-table-column prop="customer_phone" label="电话" width="130" />
        <el-table-column prop="follow_type" label="跟进方式" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="followTypeTag(row.follow_type)" size="small">{{ row.follow_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="上次跟进内容" min-width="200" show-overflow-tooltip />
        <el-table-column prop="next_time" label="计划时间" width="160" align="center">
          <template #default="{ row }">
            <span :class="{ 'overdue': isOverdue(row.next_time) }">
              {{ formatTime(row.next_time) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="next_content" label="计划内容" min-width="150" show-overflow-tooltip />
        <el-table-column label="操作" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="goCustomer(row.customer_id)">去跟进</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { getTodayReminders } from '@/api/customer'

defineOptions({ name: 'TodayTasks' })

const router = useRouter()
const loading = ref(false)
const taskList = ref([])

const followTypeTag = (type) => {
  const map = { '电话': 'warning', '拜访': '', '微信': 'success', '邮件': 'info', '其他': '' }
  return map[type] || ''
}

const isOverdue = (nextTime) => {
  if (!nextTime) return false
  return new Date(nextTime) < new Date()
}

const formatTime = (time) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const goCustomer = (id) => {
  router.push(`/customer/detail/${id}`)
}

const fetchList = async () => {
  loading.value = true
  try {
    const r = await getTodayReminders()
    if (r.code === 200) taskList.value = r.data.list || []
  } finally { loading.value = false }
}

onMounted(() => fetchList())
onActivated(() => fetchList())
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.page-desc { margin: var(--space-1) 0 0; font-size: 13px; color: var(--color-text-tertiary); }
.overdue { color: var(--color-danger); font-weight: 600; }
</style>
