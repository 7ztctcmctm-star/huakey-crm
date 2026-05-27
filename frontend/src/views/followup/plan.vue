<template>
  <div class="plan-page">
    <div class="page-header">
      <h2>跟进计划</h2>
      <p class="page-desc">管理待跟进计划，完成计划将自动创建跟进记录</p>
    </div>

    <!-- 筛选栏 -->
    <el-card class="search-card" shadow="never">
      <el-form :model="searchForm" inline @keyup.enter="handleSearch">
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width: 140px">
            <el-option label="待跟进" value="pending" />
            <el-option label="已完成" value="completed" />
            <el-option label="已逾期" value="overdue" />
          </el-select>
        </el-form-item>
        <el-form-item label="计划日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 260px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">搜索</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格 -->
    <el-card class="table-card" shadow="never" v-loading="loading">
      <el-table :data="tableData" stripe border :header-cell-style="{ background: 'var(--c-bg)', color: 'var(--c-text-secondary)' }">
        <template #empty>
          <el-empty description="暂无跟进计划" />
        </template>
        <el-table-column label="计划时间" width="160">
          <template #default="{ row }">{{ formatTime(row.plan_time) }}</template>
        </el-table-column>
        <el-table-column prop="company_name" label="客户" min-width="150" show-overflow-tooltip />
        <el-table-column prop="contact_name" label="联系人" width="100" />
        <el-table-column prop="follow_type" label="跟进方式" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small">{{ row.follow_type || '电话' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="plan_content" label="计划内容" min-width="200" show-overflow-tooltip />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="creator_name" label="创建人" width="90" />
        <el-table-column label="操作" width="150" fixed="right" align="center">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button type="primary" size="small" @click="openCompleteDialog(row)">完成</el-button>
              <el-button type="info" size="small" @click="handleCancel(row)">取消</el-button>
            </template>
            <el-tag v-else type="info" size="small">-</el-tag>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="searchForm.page"
          v-model:page-size="searchForm.pageSize"
          :page-sizes="[10, 20, 50]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchList"
          @current-change="fetchList"
        />
      </div>
    </el-card>

    <!-- 完成弹窗 -->
    <el-dialog v-model="completeDialogVisible" title="完成跟进计划" width="500px">
      <el-form :model="completeForm" label-width="80px">
        <el-form-item label="客户">
          <span>{{ selectedPlan?.company_name }}</span>
        </el-form-item>
        <el-form-item label="计划内容">
          <span>{{ selectedPlan?.plan_content }}</span>
        </el-form-item>
        <el-form-item label="跟进方式">
          <el-select v-model="completeForm.follow_type" style="width: 100%">
            <el-option v-for="t in followTypes" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="跟进内容" required>
          <el-input v-model="completeForm.content" type="textarea" :rows="4" placeholder="请输入实际跟进内容" maxlength="2000" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="completeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="completeLoading" @click="handleComplete">确认完成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh } from '@element-plus/icons-vue'
import { post } from '@/utils/request'
import { formatTime } from '@/composables/useFormat'

const loading = ref(false)
const tableData = ref([])
const total = ref(0)
const dateRange = ref(null)

const searchForm = reactive({
  page: 1,
  pageSize: 10,
  status: ''
})

const followTypes = ['电话', '微信', '邮件', '拜访', '其他']

const statusTagType = (s) => ({ pending: 'info', completed: 'success', overdue: 'danger' }[s] || 'info')
const statusLabel = (s) => ({ pending: '待跟进', completed: '已完成', overdue: '已逾期' }[s] || s)

const fetchList = async () => {
  loading.value = true
  try {
    const params = {
      page: searchForm.page,
      pageSize: searchForm.pageSize,
      status: searchForm.status || undefined,
      start_date: dateRange.value?.[0] || undefined,
      end_date: dateRange.value?.[1] || undefined
    }
    const res = await post('/follow-plan/list', params)
    if (res.code === 200) {
      tableData.value = res.data.list
      total.value = res.data.total
    }
  } catch (e) {
    ElMessage.error('加载失败')
    console.error(e)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { searchForm.page = 1; fetchList() }
const handleReset = () => {
  searchForm.status = ''
  dateRange.value = null
  handleSearch()
}

// 完成计划
const completeDialogVisible = ref(false)
const completeLoading = ref(false)
const selectedPlan = ref(null)
const completeForm = reactive({ content: '', follow_type: '' })

const openCompleteDialog = (row) => {
  selectedPlan.value = row
  completeForm.content = ''
  completeForm.follow_type = row.follow_type || '电话'
  completeDialogVisible.value = true
}

const handleComplete = async () => {
  if (!completeForm.content.trim()) {
    return ElMessage.warning('请输入跟进内容')
  }
  completeLoading.value = true
  try {
    const res = await post('/follow-plan/complete', {
      id: selectedPlan.value.id,
      content: completeForm.content,
      follow_type: completeForm.follow_type
    })
    if (res.code === 200) {
      ElMessage.success('跟进计划已完成，已自动创建跟进记录')
      completeDialogVisible.value = false
      fetchList()
    }
  } catch (e) {
    ElMessage.error('操作失败')
  } finally {
    completeLoading.value = false
  }
}

// 取消计划
const handleCancel = async (row) => {
  try {
    await ElMessageBox.confirm('确定取消该跟进计划？', '提示', { type: 'warning' })
    const res = await post('/follow-plan/cancel', { id: row.id })
    if (res.code === 200) {
      ElMessage.success('已取消')
      fetchList()
    }
  } catch (e) { /* cancelled */ }
}

onMounted(() => fetchList())
</script>

<style scoped>
.plan-page { padding: 0; }
.page-header { margin-bottom: 16px; }
.page-header h2 { margin: 0 0 4px; font-size: 18px; color: var(--c-text); }
.page-desc { margin: 0; font-size: 13px; color: var(--c-text-tertiary); }
.search-card { margin-bottom: 16px; }
.search-card .el-form-item { margin-bottom: 0; }
.table-card { min-height: 300px; }
.pagination { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
