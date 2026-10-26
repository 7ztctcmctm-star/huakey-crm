<template>
  <div class="page-container">
    <div class="page-header">
      <h2>数据备份</h2>
    </div>

    <el-card>
      <div class="toolbar">
        <el-button type="primary" :icon="Download" :loading="createLoading" @click="handleCreate">创建备份</el-button>
      </div>

      <StateWrapper
        :loading="loading"
        :error="errorMsg"
        :empty="!loading && !errorMsg && tableData.length === 0"
        empty-text="暂无备份记录"
        @retry="fetchList"
      >
        <template #loading>
          <TableSkeleton :rows="8" :cols="8" />
        </template>

        <el-table :data="tableData" stripe border>
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
              <el-button
                v-if="row.status === 'success'"
                type="primary"
                link
                :loading="restoreLoading === row.id"
                :disabled="restoreLoading !== null && restoreLoading !== row.id"
                @click="handleRestore(row)"
              >恢复</el-button>
              <el-button
                type="danger"
                link
                :loading="deleteLoading === row.id"
                :disabled="deleteLoading !== null && deleteLoading !== row.id"
                @click="handleDelete(row)"
              >删除</el-button>
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
      </StateWrapper>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { getBackupList, createBackup, deleteBackup, getRestoreConfirmCode, restoreBackup } from '@/api/system'
import StateWrapper from '@/components/common/StateWrapper.vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import { reportError } from '@/utils/error'

const loading = ref(true)   // onMounted 无条件取数，初值 true 消除首帧「暂无备份记录」闪现
const errorMsg = ref('')
const createLoading = ref(false)
const restoreLoading = ref(null) // 正在恢复的备份 id
const deleteLoading = ref(null)  // 正在删除的备份 id
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
  errorMsg.value = ''
  try {
    const res = await getBackupList()
    if (res.code === 200) {
      tableData.value = res.data.list
      total.value = res.data.total
    } else {
      errorMsg.value = res.message || '加载备份记录列表失败，请稍后重试'
      reportError('获取备份记录列表失败:', res.message)
    }
  } catch (error) {
    errorMsg.value = error?.response?.data?.message || '加载备份记录列表失败，请稍后重试'
    reportError('获取备份记录列表失败:', error)
    ElMessage.error('加载备份列表失败')
  } finally {
    loading.value = false
  }
}

const handleCreate = async () => {
  createLoading.value = true
  try {
    const res = await createBackup()
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

const confirmOrCancel = async (message, title) => {
  try {
    await ElMessageBox.confirm(message, title, { type: 'warning' })
    return true
  } catch {
    return false // 用户取消：不是错误，不得弹错误提示
  }
}

const handleRestore = async (row) => {
  if (!(await confirmOrCancel('确定恢复该备份吗？此操作将覆盖当前数据！', '警告'))) return

  restoreLoading.value = row.id
  try {
    // [P0-13] 后端 restoreBackupSchema 要求 confirm_code；必须先取码再提交。
    // 原实现只发 { id }，Joi 校验必然 400，且 .catch(() => {}) 把失败当成取消吞掉。
    const codeRes = await getRestoreConfirmCode(row.id)
    const confirmCode = codeRes?.data?.confirm_code
    if (!confirmCode) {
      ElMessage.error('获取恢复确认码失败，未执行恢复')
      return
    }
    const res = await restoreBackup(row.id, confirmCode)
    if (res.code === 200) {
      ElMessage.success('恢复任务已执行')
      setTimeout(fetchList, 1000)
    } else {
      ElMessage.error(res.message || '恢复失败')
    }
  } catch (error) {
    reportError('恢复备份失败:', error)
    ElMessage.error(error?.response?.data?.message || error?.message || '恢复失败')
  } finally {
    restoreLoading.value = null
  }
}

const handleDelete = async (row) => {
  if (!(await confirmOrCancel('确定删除该备份文件吗？', '提示'))) return

  deleteLoading.value = row.id
  try {
    const res = await deleteBackup(row.id)
    if (res.code === 200) {
      ElMessage.success('已删除')
      fetchList()
    } else {
      ElMessage.error(res.message || '删除失败')
    }
  } catch (error) {
    reportError('删除备份失败:', error)
    ElMessage.error(error?.response?.data?.message || error?.message || '删除失败')
  } finally {
    deleteLoading.value = null
  }
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
