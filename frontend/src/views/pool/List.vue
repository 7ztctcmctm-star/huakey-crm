<template>
  <div class="pool-list">
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
        <el-form-item label="等级">
          <el-select v-model="searchForm.level" placeholder="全部等级" clearable style="width: 120px">
            <el-option v-for="opt in levelOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="业务状态">
          <el-select v-model="searchForm.business_status" placeholder="全部状态" clearable style="width: 120px">
            <el-option label="跟进中" value="following" />
            <el-option label="已报价" value="quoted" />
            <el-option label="谈判中" value="negotiating" />
            <el-option label="已签约" value="signed" />
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
          <span>公海池（共 {{ total }} 条）</span>
          <el-button link disabled v-if="total === 0">暂无公海客户</el-button>
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
        <el-table-column prop="level" label="等级" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="levelTagType(row.level)" size="small">{{ row.level || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="business_status" label="业务状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.business_status)" size="small">{{ statusLabel(row.business_status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="released_by_name" label="释放人" width="100" />
        <el-table-column prop="released_at" label="释放时间" width="160" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button type="success" link size="small" @click="handleClaim(row)" v-permission="'pool:claim'">认领</el-button>
            <el-button type="info" link size="small" @click="goDetail(row)">详情</el-button>
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
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPoolList, claimPoolCustomer } from '@/api/pool'

const router = useRouter()

const levelOptions = [
  { label: 'A级 - 重点客户', value: 'A' },
  { label: 'B级 - 意向客户', value: 'B' },
  { label: 'C级 - 潜在客户', value: 'C' },
  { label: 'D级 - 非意向客户', value: 'D' }
]

const searchForm = reactive({
  company_name: '',
  contact_name: '',
  phone: '',
  level: '',
  business_status: '',
  page: 1,
  pageSize: 20
})

const tableData = ref([])
const total = ref(0)
const loading = ref(false)

const levelTagType = (level) => {
  const map = { A: 'danger', B: 'warning', C: 'info', D: '' }
  return map[level] || ''
}

const statusLabel = (status) => {
  const map = {
    following: '跟进中',
    quoted: '已报价',
    negotiating: '谈判中',
    signed: '已签约',
    lost: '已流失'
  }
  return map[status] || status || '-'
}

const statusTagType = (status) => {
  const map = {
    following: '',
    quoted: 'info',
    negotiating: 'warning',
    signed: 'success',
    lost: 'danger'
  }
  return map[status] || ''
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
    if (searchForm.level) params.level = searchForm.level
    if (searchForm.business_status) params.business_status = searchForm.business_status

    const res = await getPoolList(params)
    if (res.code === 200) {
      tableData.value = res.data.list
      total.value = res.data.total
    }
  } catch (error) {
    ElMessage.error('加载公海池列表失败')
    console.error('获取公海池列表失败:', error)
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
  searchForm.level = ''
  searchForm.business_status = ''
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

const handleClaim = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定认领「${row.company_name}」吗？认领后该客户将归您跟进，享有7天保护期。`,
      '认领确认',
      { type: 'warning', confirmButtonText: '确定认领', cancelButtonText: '取消' }
    )
    const res = await claimPoolCustomer(row.id)
    if (res.code === 200) {
      ElMessage.success('认领成功，该客户已归您跟进')
      fetchList()
    } else {
      ElMessage.error(res.message || '认领失败')
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('认领失败')
  }
}

onMounted(() => {
  fetchList()
})
</script>

<style scoped>
.pool-list {
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
