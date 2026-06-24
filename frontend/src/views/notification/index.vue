<template>
  <div class="page-container">
    <div class="page-header">
      <h2>通知中心</h2>
      <p class="page-desc">查看所有待办和系统通知</p>
    </div>

    <el-card shadow="never">
      <div class="toolbar">
        <el-radio-group v-model="activeTab" @change="handleTabChange">
          <el-radio-button value="todo">待办通知</el-radio-button>
          <el-radio-button value="system">系统通知</el-radio-button>
        </el-radio-group>
        <el-button type="primary" link @click="markAllRead">全部标记已读</el-button>
      </div>

      <!-- 待办通知 -->
      <div v-if="activeTab === 'todo'">
        <el-tabs v-model="todoTab" @tab-change="fetchData">
          <el-tab-pane :label="`审批待办 (${approvals.length})`" name="approvals">
            <el-table :data="approvals" stripe border>
              <el-table-column prop="workflow_name" label="流程" min-width="140" />
              <el-table-column prop="business_title" label="单据" min-width="160" show-overflow-tooltip />
              <el-table-column prop="step_name" label="步骤" width="120" />
              <el-table-column prop="create_time" label="时间" width="160">
                <template #default="{ row }">{{ formatTime(row.create_time) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="120">
                <template #default="{ row }">
                  <el-button type="primary" link @click="$router.push('/approval/pending')">去审批</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-if="approvals.length === 0" description="暂无待审批" />
          </el-tab-pane>

          <el-tab-pane :label="`催办通知 (${urges.length})`" name="urges">
            <el-table :data="urges" stripe border>
              <el-table-column prop="content" label="催办内容" min-width="300" show-overflow-tooltip />
              <el-table-column prop="from_user_name" label="催办人" width="100" />
              <el-table-column prop="create_time" label="时间" width="160">
                <template #default="{ row }">{{ formatTime(row.create_time) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="120">
                <template #default="{ row }">
                  <el-button type="primary" link @click="goToCustomer(row)">去跟进</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-if="urges.length === 0" description="暂无催办通知" />
          </el-tab-pane>

          <el-tab-pane :label="`工单通知 (${services.length})`" name="services">
            <el-table :data="services" stripe border>
              <el-table-column prop="content" label="工单信息" min-width="300" show-overflow-tooltip />
              <el-table-column prop="from_user_name" label="分配人" width="100" />
              <el-table-column prop="create_time" label="时间" width="160">
                <template #default="{ row }">{{ formatTime(row.create_time) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="120">
                <template #default="{ row }">
                  <el-button type="primary" link @click="$router.push('/service')">去处理</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-if="services.length === 0" description="暂无工单通知" />
          </el-tab-pane>
        </el-tabs>
      </div>

      <!-- 系统通知 -->
      <div v-if="activeTab === 'system'">
        <el-table :data="systemNotifications" stripe border v-loading="loading">
          <el-table-column width="50" align="center">
            <template #default="{ row }">
              <div :class="['unread-dot', { read: row.is_read }]"></div>
            </template>
          </el-table-column>
          <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
          <el-table-column prop="content" label="内容" min-width="250" show-overflow-tooltip />
          <el-table-column prop="type" label="类型" width="120" align="center">
            <template #default="{ row }">
              <el-tag :type="typeTag[row.type] || 'info'" size="small">{{ typeName[row.type] || row.type }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="create_time" label="时间" width="160">
            <template #default="{ row }">{{ formatTime(row.create_time) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button v-if="!row.is_read" type="primary" link @click="markRead(row)">标为已读</el-button>
              <span v-else style="color:#909399;font-size:12px">已读</span>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!loading && systemNotifications.length === 0" description="暂无系统通知" />
        <div v-if="systemTotal > pageSize" style="margin-top:16px;display:flex;justify-content:flex-end">
          <el-pagination layout="prev, pager, next" :total="systemTotal" :page-size="pageSize" v-model:current-page="page" @current-change="fetchSystemNotifications" />
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getNotifications, markNotificationRead, markAllRead as apiMarkAllRead, getMyReminders } from '@/api/tools'
import { formatTime } from '@/composables/useFormat'

const router = useRouter()
const activeTab = ref('todo')
const todoTab = ref('approvals')
const loading = ref(false)

const approvals = ref([])
const urges = ref([])
const services = ref([])

const systemNotifications = ref([])
const systemTotal = ref(0)
const page = ref(1)
const pageSize = ref(20)

const typeTag = { assign: 'warning', system: 'info', remind: 'danger' }
const typeName = { assign: '分配', system: '系统', remind: '提醒' }

const fetchData = () => {
  if (activeTab.value === 'todo') fetchTodoData()
  else fetchSystemNotifications()
}

const fetchTodoData = async () => {
  try {
    const res = await getMyReminders()
    if (res.code === 200) {
      approvals.value = res.data.pending_approvals || []
      urges.value = res.data.urge_notifications || []
      services.value = [...(res.data.new_services || []), ...(res.data.overdue_services || [])]
    }
  } catch { /* */ }
}

const fetchSystemNotifications = async () => {
  loading.value = true
  try {
    const res = await getNotifications({ page: page.value, pageSize: pageSize.value })
    if (res.code === 200) {
      systemNotifications.value = res.data.list || []
      systemTotal.value = res.data.total || 0
    }
  } catch { /* */ }
  finally { loading.value = false }
}

const handleTabChange = () => {
  page.value = 1
  fetchData()
}

const markRead = async (row) => {
  try {
    await markNotificationRead(row.id)
    row.is_read = 1
  } catch { /* */ }
}

const markAllRead = async () => {
  try {
    await apiMarkAllRead()
    ElMessage.success('已全部标记为已读')
    fetchData()
  } catch { /* */ }
}

const goToCustomer = (row) => {
  if (row.business_id) router.push(`/customer/detail/${row.business_id}`)
}

onMounted(() => { fetchData() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.page-desc { margin: var(--space-1) 0 0; font-size: 13px; color: var(--color-text-tertiary); }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.unread-dot { width: 8px; height: 8px; border-radius: 50%; background: #0071e3; }
.unread-dot.read { background: transparent; }
</style>
