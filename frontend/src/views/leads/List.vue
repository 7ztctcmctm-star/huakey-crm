<template>
  <div class="leads-pool">
    <!-- 筛选区 -->
    <el-card shadow="never" class="filter-card">
      <el-form :model="searchForm" inline @submit.prevent="handleSearch">
        <el-form-item label="公司名称">
          <el-input v-model="searchForm.company_name" placeholder="搜索公司名称" clearable style="width: 180px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="searchForm.contact_name" placeholder="搜索联系人" clearable style="width: 150px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="searchForm.phone" placeholder="搜索电话" clearable style="width: 150px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="searchForm.source" placeholder="全部来源" clearable style="width: 140px">
            <el-option v-for="opt in sourceOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="等级">
          <el-select v-model="searchForm.level" placeholder="全部等级" clearable style="width: 120px">
            <el-option v-for="opt in levelOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格区 -->
    <el-card shadow="never" class="table-card">
      <template #header>
        <div class="card-header">
          <span>潜客池（共 {{ total }} 条）</span>
          <div>
            <el-button type="primary" @click="handleAdd" v-permission="'leads:add'">新增潜客</el-button>
          </div>
        </div>
      </template>

      <el-table :data="tableData" v-loading="loading" stripe border style="width: 100%">
        <el-table-column prop="company_name" label="公司名称" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <el-link type="primary" @click="goDetail(row)">{{ row.company_name }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="contact_name" label="联系人" width="100" />
        <el-table-column prop="phone" label="电话" width="140" />
        <el-table-column prop="source" label="来源" width="100" />
        <el-table-column prop="level" label="等级" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="levelTagType(row.level)" size="small">{{ row.level || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="industry" label="行业" width="120" show-overflow-tooltip />
        <el-table-column prop="create_time" label="创建时间" width="160" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleConvert(row)" v-permission="'leads:convert'">转为正式</el-button>
            <el-button type="info" link size="small" @click="goDetail(row)">详情</el-button>
            <el-button type="warning" link size="small" @click="handleEdit(row)" v-permission="'leads:add'">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="searchForm.page"
          v-model:page-size="searchForm.pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- 编辑对话框 -->
    <CustomerFormDialog
      v-model="dialogVisible"
      :customer="currentCustomer"
      :level-options="levelOptions"
      :edit-status-options="editStatusOptions"
      @success="fetchList"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import CustomerFormDialog from '@/views/customer/components/CustomerFormDialog.vue'
import { getLeadsPool, convertLeadToFormal } from '@/api/leads'
import { addCustomer } from '@/api/customer'
import { SOURCE_SEARCH_OPTIONS } from '@/constants/source'

const router = useRouter()

const sourceOptions = SOURCE_SEARCH_OPTIONS
const levelOptions = [
  { label: 'A级 - 重点客户', value: 'A' },
  { label: 'B级 - 意向客户', value: 'B' },
  { label: 'C级 - 潜在客户', value: 'C' },
  { label: 'D级 - 非意向客户', value: 'D' }
]
const editStatusOptions = [
  { label: '跟进中', value: 'following' },
  { label: '已报价', value: 'quoted' },
  { label: '谈判中', value: 'negotiating' },
  { label: '已签约', value: 'signed' },
  { label: '已流失', value: 'lost' },
  { label: '暂停跟进', value: 'paused' }
]

const searchForm = reactive({
  company_name: '',
  contact_name: '',
  phone: '',
  source: '',
  level: '',
  page: 1,
  pageSize: 20
})

const tableData = ref([])
const total = ref(0)
const loading = ref(false)

const dialogVisible = ref(false)
const currentCustomer = ref(null)

const levelTagType = (level) => {
  const map = { A: 'danger', B: 'warning', C: 'info', D: '' }
  return map[level] || ''
}

const fetchList = async () => {
  loading.value = true
  try {
    const params = {
      page: searchForm.page,
      pageSize: searchForm.pageSize
    }
    if (searchForm.company_name) params.company_name = searchForm.company_name
    if (searchForm.contact_name) params.contact_name = searchForm.contact_name
    if (searchForm.phone) params.phone = searchForm.phone
    if (searchForm.source) params.source = searchForm.source
    if (searchForm.level) params.level = searchForm.level

    const res = await getLeadsPool(params)
    if (res.code === 200) {
      tableData.value = res.data.list
      total.value = res.data.total
    }
  } catch (error) {
    ElMessage.error('加载潜客列表失败')
    console.error('获取潜客列表失败:', error)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  searchForm.page = 1
  fetchList()
}

const handleReset = () => {
  searchForm.company_name = ''
  searchForm.contact_name = ''
  searchForm.phone = ''
  searchForm.source = ''
  searchForm.level = ''
  searchForm.page = 1
  fetchList()
}

const handleSizeChange = () => {
  searchForm.page = 1
  fetchList()
}

const handlePageChange = () => {
  fetchList()
}

const goDetail = (row) => {
  router.push(`/customer/detail/${row.id}`)
}

const handleAdd = () => {
  currentCustomer.value = null
  dialogVisible.value = true
}

const handleEdit = (row) => {
  currentCustomer.value = row
  dialogVisible.value = true
}

const handleConvert = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定将「${row.company_name}」转化为正式客户吗？转化后将进入跟进中状态。`,
      '转化确认',
      { type: 'warning', confirmButtonText: '确定转化', cancelButtonText: '取消' }
    )
    const res = await convertLeadToFormal(row.id)
    if (res.code === 200) {
      ElMessage.success(`客户「${row.company_name}」已成功转化为正式客户`)
      fetchList()
    } else {
      ElMessage.error(res.message || '转化失败')
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('转化失败')
  }
}

onMounted(() => {
  fetchList()
})
</script>

<style scoped>
.leads-pool {
  padding: 0;
}
.filter-card {
  margin-bottom: 12px;
}
.filter-card :deep(.el-card__body) {
  padding-bottom: 2px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
