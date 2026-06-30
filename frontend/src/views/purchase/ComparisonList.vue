<template>
  <div class="page-container">
    <div class="page-header">
      <h2>采购比价</h2>
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新建比价单
      </el-button>
    </div>

    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" :model="filters" @submit.prevent="handleSearch">
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable style="width: 140px">
            <el-option label="草稿" value="draft" />
            <el-option label="已完成" value="completed" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="filters.keyword" placeholder="标题/产品/编号" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" style="margin-top: 24px">
      <el-table :data="list" stripe v-loading="loading" style="width: 100%">
        <el-table-column prop="comparison_no" label="比价单号" width="160" />
        <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
        <el-table-column prop="product_name" label="产品" min-width="140" show-overflow-tooltip />
        <el-table-column prop="quantity" label="数量" width="100" align="center">
          <template #default="{ row }">
            <span>{{ row.quantity || '-' }} {{ row.unit }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="supplier_count" label="供应商数" width="100" align="center" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="selected_supplier_name" label="选中供应商" min-width="140" show-overflow-tooltip />
        <el-table-column prop="created_at" label="创建时间" width="170" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleDetail(row.id)">详情</el-button>
            <el-button v-if="row.status === 'draft'" link type="danger" @click="handleCancel(row.id)">取消</el-button>
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

    <!-- 新建比价单弹窗 -->
    <el-dialog v-model="createDialogVisible" title="新建比价单" width="560px">
      <el-form :model="createForm" :rules="createRules" ref="createFormRef" label-width="100px">
        <el-form-item label="标题" prop="title">
          <el-input v-model="createForm.title" placeholder="请输入比价标题" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="产品名称">
          <el-input v-model="createForm.product_name" placeholder="请输入产品名称" />
        </el-form-item>
        <el-form-item label="数量">
          <el-input-number v-model="createForm.quantity" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="单位">
          <el-input v-model="createForm.unit" placeholder="例如：件、吨" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :loading="createSubmitting">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import {
  getPurchaseComparisonList,
  createPurchaseComparison,
  cancelPurchaseComparison
} from '@/api/purchaseComparison'

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

const createDialogVisible = ref(false)
const createSubmitting = ref(false)
const createFormRef = ref(null)
const createForm = reactive({
  title: '',
  product_name: '',
  quantity: null,
  unit: ''
})

const createRules = {
  title: [{ required: true, message: '请输入比价标题', trigger: 'blur' }]
}

const statusMap = {
  draft: { text: '草稿', type: 'info' },
  completed: { text: '已完成', type: 'success' },
  cancelled: { text: '已取消', type: 'info' }
}

const statusText = (status) => statusMap[status]?.text || status
const statusType = (status) => statusMap[status]?.type || ''

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getPurchaseComparisonList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...filters
    })
    if (res.code === 200) {
      list.value = res.data.list || []
      pagination.total = res.data.total || 0
    }
  } catch (error) {
    console.error('获取比价单列表失败:', error)
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
  createForm.title = ''
  createForm.product_name = ''
  createForm.quantity = null
  createForm.unit = ''
  createDialogVisible.value = true
}

const handleCreate = async () => {
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) return

  createSubmitting.value = true
  try {
    const res = await createPurchaseComparison(createForm)
    if (res.code === 201 || res.code === 200) {
      ElMessage.success('创建成功')
      createDialogVisible.value = false
      createFormRef.value?.resetFields()
      fetchList()
    }
  } catch (error) {
    console.error('创建比价单失败:', error)
    ElMessage.error(error?.response?.data?.message || '创建失败')
  } finally {
    createSubmitting.value = false
  }
}

const handleDetail = (id) => {
  router.push(`/purchase/comparison/detail/${id}`)
}

const handleCancel = async (id) => {
  try {
    await ElMessageBox.confirm('确认取消该比价单？', '取消比价单', { type: 'warning' })
    const res = await cancelPurchaseComparison(id)
    if (res.code === 200) {
      ElMessage.success('已取消')
      fetchList()
    }
  } catch (error) {
    if (error === 'cancel') return
    ElMessage.error(error?.response?.data?.message || '取消失败')
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
