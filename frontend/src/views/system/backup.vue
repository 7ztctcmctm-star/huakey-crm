<template>
  <div class="page-container">
    <div class="page-header">
      <h2>数据备份</h2>
    </div>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button type="primary" :icon="Download" :loading="createLoading" @click="handleCreate">创建备份</el-button>
      </div>

      <el-table v-loading="loading" :data="tableData" stripe border>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="backup_type" label="类型" width="100">
          <template #default="{ row }">{{ row.backup_type === 'full' ? '全量备份' : '增量备份' }}</template>
        </el-table-column>
        <el-table-column prop="file_name" label="文件名" min-width="200" show-overflow-tooltip />
        <el-table-column prop="file_size" label="文件大小" width="120" align="right">
          <template #default="{ row }">{{ formatSize(row.file_size) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="create_by_name" label="创建人" width="100" />
        <el-table-column prop="create_time" label="创建时间" width="180" />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button v-if="row.status === 'success'" type="primary" link @click="handleRestore(row)">恢复</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @size-change="fetchList"
          @current-change="fetchList"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import request from '@/utils/request'

const loading = ref(false)
const createLoading = ref(false)
const tableData = ref([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const statusType = (s) => ({ running: 'warning', success: 'success', failed: 'danger' }[s] || 'info')
const statusText = (s) => ({ running: '执行中', success: '成功', failed: '失败' }[s] || s)
const formatSize = (bytes) => {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await request.post('/backup/list', { page: page.value, pageSize: pageSize.value })
    if (res.code === 200) {
      tableData.value = res.data.list
      total.value = res.data.total
    }
  } catch {
    ElMessage.error('加载备份列表失败')
  } finally {
    loading.value = false
  }
}

const handleCreate = async () => {
  createLoading.value = true
  try {
    const res = await request.post('/backup/create')
    if (res.code === 200) {
      ElMessage.success('备份任务已创建')
      setTimeout(fetchList, 1000)
    }
  } catch {
    ElMessage.error('创建备份失败')
  } finally {
    createLoading.value = false
  }
}

const handleRestore = (row) => {
  ElMessageBox.confirm(`确定恢复该备份吗？此操作将覆盖当前数据！`, '警告', { type: 'warning' }).then(async () => {
    const res = await request.post('/backup/restore', { id: row.id })
    if (res.code === 200) ElMessage.success('恢复任务已执行')
  }).catch(() => {})
}

const handleDelete = (row) => {
  ElMessageBox.confirm('确定删除该备份文件吗？', '提示', { type: 'warning' }).then(async () => {
    const res = await request.post('/backup/delete', { id: row.id })
    if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
  }).catch(() => {})
}

onMounted(() => { fetchList() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.toolbar { margin-bottom: var(--space-4); }
.pagination { margin-top: var(--space-5); display: flex; justify-content: flex-end; }
</style>
