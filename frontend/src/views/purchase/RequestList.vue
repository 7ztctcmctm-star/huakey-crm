<template>
  <div class="page-container">
    <div class="page-header">
      <h2>采购申请</h2>
      <el-button type="primary" @click="handleAdd" v-permission="'purchase:request'">
        <el-icon><Plus /></el-icon>新建申请
      </el-button>
    </div>

    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" :model="filters" @submit.prevent="handleSearch">
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable style="width: 140px">
            <el-option label="草稿" value="draft" />
            <el-option label="待审批" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已驳回" value="rejected" />
            <el-option label="已下单" value="ordered" />
            <el-option label="已撤销" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="filters.keyword" placeholder="标题/编号" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" style="margin-top: 24px">
      <el-table :data="list" stripe v-loading="loading" style="width: 100%">
        <el-table-column prop="request_no" label="申请编号" width="160" />
        <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
        <el-table-column prop="applicant_name" label="申请人" width="120" />
        <el-table-column prop="dept_name" label="部门" width="120" />
        <el-table-column prop="expected_amount" label="预计金额" width="140" align="right">
          <template #default="{ row }">
            <span>¥{{ formatMoney(row.expected_amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="170" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'draft'" link type="primary" @click="handleSubmit(row.id)">提交</el-button>
            <el-button v-if="row.status === 'draft' || row.status === 'pending'" link type="danger" @click="handleCancel(row.id)">撤销</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next"
          :page-sizes="[10, 20, 50]"
          @change="fetchList"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import {
  getPurchaseRequestList,
  submitPurchaseRequest,
  cancelPurchaseRequest
} from '@/api/purchaseRequest'

const router = useRouter()
const loading = ref(false)

const filters = reactive({
  status: '',
  keyword: ''
})

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

const list = ref([])

const statusMap = {
  draft: { text: '草稿', type: 'info' },
  pending: { text: '待审批', type: 'warning' },
  approved: { text: '已通过', type: 'success' },
  rejected: { text: '已驳回', type: 'danger' },
  ordered: { text: '已下单', type: 'primary' },
  cancelled: { text: '已撤销', type: 'info' }
}

const statusText = (status) => statusMap[status]?.text || status
const statusType = (status) => statusMap[status]?.type || ''

const formatMoney = (value) => {
  if (value === null || value === undefined) return '0.00'
  return Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getPurchaseRequestList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...filters
    })
    if (res.code === 200) {
      list.value = res.data.list || []
      pagination.total = res.data.total || 0
    }
  } catch (error) {
    console.error('获取采购申请列表失败:', error)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  pagination.page = 1
  fetchList()
}

const resetFilters = () => {
  filters.status = ''
  filters.keyword = ''
  handleSearch()
}

const handleAdd = () => {
  router.push('/purchase/request/create')
}

const handleSubmit = async (id) => {
  try {
    await ElMessageBox.confirm('提交后将进入审批流程，是否继续？', '确认提交', { type: 'warning' })
    const res = await submitPurchaseRequest(id)
    if (res.code === 200) {
      ElMessage.success('提交成功')
      fetchList()
    }
  } catch (error) {
    if (error === 'cancel') return
    ElMessage.error(error?.response?.data?.message || '提交失败')
  }
}

const handleCancel = async (id) => {
  try {
    const { value } = await ElMessageBox.prompt('请输入撤销原因', '撤销申请', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '撤销原因不能为空'
    })
    const res = await cancelPurchaseRequest(id, value)
    if (res.code === 200) {
      ElMessage.success('已撤销')
      fetchList()
    }
  } catch (error) {
    if (error === 'cancel') return
    ElMessage.error(error?.response?.data?.message || '撤销失败')
  }
}

onMounted(() => {
  fetchList()
})
</script>

<style scoped>
.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
