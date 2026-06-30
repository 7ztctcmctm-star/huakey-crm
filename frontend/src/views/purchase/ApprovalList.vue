<template>
  <div class="page-container">
    <div class="page-header">
      <h2>采购审批</h2>
    </div>

    <el-card shadow="never">
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
        <el-table-column prop="reason" label="申请理由" min-width="200" show-overflow-tooltip />
        <el-table-column prop="created_at" label="提交时间" width="170" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="success" @click="handleApprove(row.id)">通过</el-button>
            <el-button link type="danger" @click="handleReject(row.id)">驳回</el-button>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPurchaseRequestList, approvePurchaseRequest, rejectPurchaseRequest } from '@/api/purchaseRequest'

const loading = ref(false)
const list = ref([])

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

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
      status: 'pending'
    })
    if (res.code === 200) {
      list.value = res.data.list || []
      pagination.total = res.data.total || 0
    }
  } catch (error) {
    console.error('获取审批列表失败:', error)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const handleApprove = async (id) => {
  try {
    await ElMessageBox.confirm('确认通过该采购申请？', '审批通过', { type: 'warning' })
    const res = await approvePurchaseRequest(id)
    if (res.code === 200) {
      ElMessage.success('审批通过')
      fetchList()
    }
  } catch (error) {
    if (error === 'cancel') return
    ElMessage.error(error?.response?.data?.message || '操作失败')
  }
}

const handleReject = async (id) => {
  try {
    const { value } = await ElMessageBox.prompt('请输入驳回原因', '驳回申请', {
      confirmButtonText: '确认驳回',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '驳回原因不能为空'
    })
    const res = await rejectPurchaseRequest(id, value)
    if (res.code === 200) {
      ElMessage.success('已驳回')
      fetchList()
    }
  } catch (error) {
    if (error === 'cancel') return
    ElMessage.error(error?.response?.data?.message || '操作失败')
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
