<template>
  <div class="page-container">
    <div class="page-header">
      <h2>操作日志</h2>
    </div>

    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" :model="filterForm">
        <el-form-item label="模块">
          <el-select v-model="filterForm.module" placeholder="请选择模块" clearable style="width: 150px">
            <el-option v-for="m in moduleList" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作">
          <el-input v-model="filterForm.action" placeholder="请输入操作" clearable style="width: 150px" />
        </el-form-item>
        <el-form-item label="操作类型">
          <el-select v-model="filterForm.actionType" placeholder="全部" clearable style="width: 120px">
            <el-option label="删除" value="delete" />
            <el-option label="编辑" value="edit" />
            <el-option label="新增" value="add" />
            <el-option label="导出" value="export" />
            <el-option label="导入" value="import" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filterForm.status" placeholder="请选择状态" clearable style="width: 120px">
            <el-option label="成功" :value="1" />
            <el-option label="失败" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 240px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
          <el-button type="danger" plain @click="handleHighRisk">高风险操作</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-card">
      <template #header>
        <div class="table-header">
          <span>日志列表</span>
          <div class="table-actions">
            <el-button type="primary" :icon="Download" @click="handleExport" v-permission="'log:export'">导出日志</el-button>
            <el-button type="danger" :icon="Delete" @click="handleClear">清理日志</el-button>
          </div>
        </div>
      </template>
      <el-table v-loading="loading" :data="tableData" stripe border>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="module" label="模块" width="100">
          <template #default="{ row }">
            <el-tag type="info">{{ row.module }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="action" label="操作" min-width="120" show-overflow-tooltip />
        <el-table-column prop="method" label="方法" width="80">
          <template #default="{ row }">
            <el-tag :type="row.method === 'GET' ? 'success' : 'primary'" size="small">{{ row.method }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="url" label="URL" min-width="180" show-overflow-tooltip />
        <el-table-column prop="user_name" label="用户" width="100" />
        <el-table-column prop="ip_address" label="IP地址" width="130" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
              {{ row.status === 1 ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="create_time" label="操作时间" width="160" />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleView(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleQuery"
          @current-change="handleQuery"
        />
      </div>
    </el-card>

    <el-dialog v-model="detailVisible" title="日志详情" width="700px">
      <el-descriptions :column="2" border v-if="currentLog">
        <el-descriptions-item label="ID">{{ currentLog.id }}</el-descriptions-item>
        <el-descriptions-item label="模块">{{ currentLog.module }}</el-descriptions-item>
        <el-descriptions-item label="操作">{{ currentLog.action }}</el-descriptions-item>
        <el-descriptions-item label="请求方法">{{ currentLog.method }}</el-descriptions-item>
        <el-descriptions-item label="URL" :span="2">{{ currentLog.url }}</el-descriptions-item>
        <el-descriptions-item label="用户">{{ currentLog.user_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="IP地址">{{ currentLog.ip_address }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="currentLog.status === 1 ? 'success' : 'danger'">
            {{ currentLog.status === 1 ? '成功' : '失败' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="操作时间">{{ currentLog.create_time }}</el-descriptions-item>
        <el-descriptions-item label="请求参数" :span="2">
          <pre class="params-pre">{{ formatParams(currentLog.params) }}</pre>
        </el-descriptions-item>
        <el-descriptions-item v-if="currentLog.error_msg" label="错误信息" :span="2">
          <span class="error-text">{{ currentLog.error_msg }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <!-- 字段变更对比 -->
      <div v-if="changedFieldsList.length > 0" style="margin-top: 16px">
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px">字段变更明细</div>
        <el-table :data="changedFieldsList" stripe border size="small">
          <el-table-column prop="label" label="字段" width="120" />
          <el-table-column prop="field" label="字段名" width="140" />
          <el-table-column label="变更前" min-width="150">
            <template #default="{ row }">
              <span class="old-value">{{ row.old ?? '(空)' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="变更后" min-width="150">
            <template #default="{ row }">
              <span class="new-value">{{ row.new ?? '(空)' }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Delete, Download } from '@element-plus/icons-vue'
import request from '@/utils/request'

const loading = ref(false)
const tableData = ref([])
const moduleList = ref([])
const dateRange = ref([])
const detailVisible = ref(false)
const currentLog = ref(null)

const filterForm = reactive({
  module: '',
  action: '',
  actionType: '',
  status: ''
})

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

const handleQuery = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      module: filterForm.module || undefined,
      action: filterForm.action || undefined,
      actionType: filterForm.actionType || undefined,
      status: filterForm.status !== '' ? filterForm.status : undefined,
      startDate: dateRange.value?.[0] || undefined,
      endDate: dateRange.value?.[1] || undefined
    }

    const res = await request.post('/log/list', params)
    if (res.code === 200) {
      tableData.value = res.data.list
      pagination.total = res.data.total
    }
  } catch (error) {
    console.error('查询日志失败:', error)
    ElMessage.error('查询失败')
  } finally {
    loading.value = false
  }
}

const handleReset = () => {
  filterForm.module = ''
  filterForm.action = ''
  filterForm.actionType = ''
  filterForm.status = ''
  dateRange.value = []
  pagination.page = 1
  handleQuery()
}

const handleHighRisk = () => {
  filterForm.module = ''
  filterForm.action = ''
  filterForm.actionType = ''
  filterForm.status = ''
  dateRange.value = []
  pagination.page = 1
  // 高风险操作：删除 + 导出 + 导入
  loading.value = true
  request.post('/log/list', {
    page: pagination.page,
    pageSize: pagination.pageSize,
    actionType: ['delete', 'export', 'import']
  }).then(res => {
    if (res.code === 200) {
      tableData.value = res.data.list
      pagination.total = res.data.total
    }
  }).catch(() => ElMessage.error('查询失败'))
    .finally(() => { loading.value = false })
}

const handleView = async (row) => {
  try {
    const res = await request.get(`/log/detail/${row.id}`)
    if (res.code === 200) {
      currentLog.value = res.data
      detailVisible.value = true
    }
  } catch (error) {
    console.error('获取日志详情失败:', error)
  }
}

const handleClear = async () => {
  try {
    await ElMessageBox.confirm('确定要清理30天前的日志吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })

    const res = await request.post('/log/clear', { days: 30 })
    if (res.code === 200) {
      ElMessage.success(res.message)
      handleQuery()
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('清理日志失败:', error)
      ElMessage.error('清理失败')
    }
  }
}

const handleExport = async () => {
  try {
    const res = await request.post('/log/export', {
      module: filterForm.module || undefined,
      action: filterForm.action || undefined,
      status: filterForm.status !== '' ? filterForm.status : undefined,
      startDate: dateRange.value?.[0] || undefined,
      endDate: dateRange.value?.[1] || undefined
    }, { responseType: 'blob' })

    const blob = new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `operation_logs_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (error) {
    console.error('导出日志失败:', error)
    ElMessage.error('导出失败')
  }
}

const fetchModules = async () => {
  try {
    const res = await request.get('/log/modules')
    if (res.code === 200) {
      moduleList.value = res.data
    }
  } catch (error) {
    console.error('获取模块列表失败:', error)
  }
}

const formatParams = (params) => {
  if (!params) return '-'
  try {
    return JSON.stringify(JSON.parse(params), null, 2)
  } catch {
    return params
  }
}

// 解析字段变更列表
const changedFieldsList = computed(() => {
  if (!currentLog.value?.changed_fields) return []
  try {
    return JSON.parse(currentLog.value.changed_fields)
  } catch {
    return []
  }
})

onMounted(() => {
  handleQuery()
  fetchModules()
})
</script>

<style scoped>
.page-container {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-5);
}

.page-header h2 {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text);
  letter-spacing: -0.02em;
}

.filter-card {
  margin-bottom: var(--space-4);
}

.table-card {
  margin-bottom: var(--space-5);
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.table-actions {
  display: flex;
  gap: var(--space-2);
}

.pagination-container {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-5);
}

.params-pre {
  margin: 0;
  padding: var(--space-2);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  font-size: 12px;
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.error-text {
  color: var(--color-accent);
}

.old-value {
  color: var(--color-danger);
  text-decoration: line-through;
}

.new-value {
  color: var(--color-success);
  font-weight: 600;
}
</style>