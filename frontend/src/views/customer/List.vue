<template>
  <div class="customer-list">
    <CustomerFilter
      :search-form="searchForm"
      :source-search-options="sourceSearchOptions"
      :level-options="levelOptions"
      :status-options="statusOptions"
      :active-tab="activeTab"
      :active-quick-tab="activeQuickTab"
      :overdue-mode="overdueMode"
      @search="handleSearch"
      @reset="handleReset"
      @tab-change="handleTabChange"
      @quick-tab-change="handleQuickTabChange"
      @clear-overdue="clearOverdueFilter"
    />

    <CustomerTable
      ref="customerTableRef"
      :loading="loading"
      :table-data="tableData"
      :is-boss="isBoss"
      :is-manager="isManager"
      :selected-rows="selectedRows"
      :sales-users="salesUsers"
      :staff-options="staffOptions"
      v-model:viewMode="viewMode"
      v-model:staffFilterId="staffFilterId"
      v-model:batchNewOwnerId="batchNewOwnerId"
      :export-loading="exportLoading"
      @selection-change="handleSelectionChange"
      @add="handleAdd"
      @import="importVisible = true"
      @export="handleExport"
      @quality-check="showQualityCheck = true"
      @batch-follow="batchFollowVisible = true"
      @batch-assign="handleBatchAssign"
      @view-mode-change="switchViewMode"
      @staff-filter-change="switchViewMode"
      @quick-follow="(row) => { quickFollowCustomer = row; quickFollowVisible = true }"
      @assign="(row) => { assignCustomer = row; assignDialogVisible = true }"
      @status-change="fetchList"
      @view="(row) => router.push(`/customer/detail/${row.id}`)"
      @edit="handleEdit"
      @delete="handleDelete"
    />

    <CustomerPagination
      v-model:page="searchForm.page"
      v-model:pageSize="searchForm.pageSize"
      :total="total"
      @size-change="handleSizeChange"
      @current-change="handlePageChange"
    />

    <CustomerImport v-model="importVisible" @imported="importVisible = false; fetchList()" />

    <el-dialog v-model="showQualityCheck" title="数据质量检查" width="500px">
      <DataQualityCheck table="crm_customer" />
    </el-dialog>

    <CustomerFormDialog
      v-model="dialogVisible"
      :customer="currentCustomer"
      :level-options="levelOptions"
      :edit-status-options="editStatusOptions"
      @success="fetchList"
    />

    <AssignDialog
      v-model="assignDialogVisible"
      :assign-customer="assignCustomer"
      :sales-users="salesUsers"
      @success="fetchList"
    />

    <FollowDialog
      v-model="quickFollowVisible"
      :customer="quickFollowCustomer"
      @success="fetchList"
    />

    <BatchFollowDialog
      v-model="batchFollowVisible"
      :selected-rows="selectedRows"
      @success="onBatchFollowSuccess"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import CustomerImport from '@/components/CustomerImport.vue'
import DataQualityCheck from '@/components/DataQualityCheck.vue'
import CustomerFilter from './components/CustomerFilter.vue'
import CustomerTable from './components/CustomerTable.vue'
import CustomerPagination from './components/CustomerPagination.vue'
import CustomerFormDialog from './components/CustomerFormDialog.vue'
import AssignDialog from './components/AssignDialog.vue'
import FollowDialog from './components/FollowDialog.vue'
import BatchFollowDialog from './components/BatchFollowDialog.vue'
import { get } from '@/utils/request'
import { getFormalCustomers, deleteCustomer, batchAssignCustomer, exportCustomers, getSalesUsers, getMySubordinates } from '@/api/customer'
import { SOURCE_SEARCH_OPTIONS } from '@/constants/source'
import { useUser } from '@/composables/useUser'

const router = useRouter()
const route = useRoute()
const { userInfo } = useUser()
const overdueMode = ref(route.query.overdue === 'true')

const activeTab = ref('all')
const handleTabChange = (tab) => {
  // Phase 3：正式客户页面不再切换 tab，保留接口兼容 CustomerFilter
  searchForm.page = 1
  fetchList()
}

const viewMode = ref('all')
const staffFilterId = ref(null)
const activeQuickTab = ref('mine')
const switchViewMode = () => {
  searchForm.page = 1
  fetchList()
}

const isBoss = computed(() => userInfo.value?.manageAll === true || userInfo.value?.roleId === 1)
const isManager = computed(() => userInfo.value?.roleId === 2)
const selectedRows = ref([])
const batchNewOwnerId = ref('')
const salesUsers = ref([])
const subordinateUsers = ref([])
const customerTableRef = ref(null)

const staffOptions = computed(() => {
  return (isBoss.value || isManager.value) ? salesUsers.value : subordinateUsers.value
})

const fetchSalesUsers = async () => {
  if (!isBoss.value && !isManager.value) return
  try {
    const res = await getSalesUsers()
    if (res.code === 200) salesUsers.value = res.data
  } catch (e) { /* ignore */ }
}

const fetchSubordinates = async () => {
  if (!isManager.value) return
  try {
    const res = await getMySubordinates()
    if (res.code === 200) subordinateUsers.value = res.data
  } catch (e) { /* ignore */ }
}

const handleSelectionChange = (rows) => {
  selectedRows.value = rows
}

const handleBatchAssign = async () => {
  if (selectedRows.value.length === 0) return
  const isBatchRecycle = batchNewOwnerId.value === ''
  try {
    await ElMessageBox.confirm(
      isBatchRecycle
        ? `确定将选中的 ${selectedRows.value.length} 个客户回收为待分配？`
        : `确定将选中的 ${selectedRows.value.length} 个客户批量分配给新负责人？`,
      isBatchRecycle ? '批量回收确认' : '批量分配确认',
      { confirmButtonText: '确定分配', cancelButtonText: '取消', type: 'warning' }
    )
  } catch { return }

  try {
    const res = await batchAssignCustomer({
      customer_ids: selectedRows.value.map(r => r.id),
      to_user_id: batchNewOwnerId.value || null,
      remark: '批量重新分配'
    })
    if (res.code === 200) {
      ElMessage.success(res.message)
      batchNewOwnerId.value = ''
      selectedRows.value = []
      customerTableRef.value?.tableRef?.clearSelection()
      fetchList()
    }
  } catch (e) {
    ElMessage.error('批量分配失败')
  }
}

const assignDialogVisible = ref(false)
const assignCustomer = ref(null)

const searchForm = reactive({
  company_name: '',
  contact_name: '',
  phone: '',
  source: '',
  level: '',
  status: '',
  dateRange: [],
  sort: '',
  page: 1,
  pageSize: 20
})

const sourceSearchOptions = SOURCE_SEARCH_OPTIONS

const levelOptions = [
  { label: 'A级 - 重点客户', value: 'A' },
  { label: 'B级 - 意向客户', value: 'B' },
  { label: 'C级 - 潜在客户', value: 'C' },
  { label: 'D级 - 非意向客户', value: 'D' }
]

const statusOptions = [
  { label: '跟进中', value: 'following' },
  { label: '已报价', value: 'quoted' },
  { label: '谈判中', value: 'negotiating' },
  { label: '已签约', value: 'signed' },
  { label: '已流失', value: 'lost' },
  { label: '暂停跟进', value: 'paused' }
]

const editStatusOptions = [
  { label: '跟进中', value: 'following' },
  { label: '已报价', value: 'quoted' },
  { label: '谈判中', value: 'negotiating' },
  { label: '已签约', value: 'signed' },
  { label: '已流失', value: 'lost' },
  { label: '暂停跟进', value: 'paused' }
]

const tableData = ref([])
const total = ref(0)
const loading = ref(false)
const exportLoading = ref(false)

const dialogVisible = ref(false)
const currentCustomer = ref(null)

const handleAdd = () => {
  currentCustomer.value = null
  dialogVisible.value = true
}

const handleEdit = (row) => {
  currentCustomer.value = row
  dialogVisible.value = true
}

const handleDelete = (row) => {
  ElMessageBox.confirm(
    `确定要删除客户"${row.company_name}"吗？删除后数据不可恢复。`,
    '删除确认',
    {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      const res = await deleteCustomer(row.id)
      if (res.code === 200) {
        ElMessage.success('删除成功')
        fetchList()
      }
    } catch (error) {
      console.error('删除失败:', error)
    }
  }).catch(() => {})
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
    if (searchForm.status !== '' && searchForm.status !== null) params.status = searchForm.status
    if (searchForm.lifecycle_status) params.lifecycle_status = searchForm.lifecycle_status
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.start_date = searchForm.dateRange[0]
      params.end_date = searchForm.dateRange[1]
    }
    if (searchForm.sort) params.sort = searchForm.sort
    if (searchForm._overdue_follow) params.overdue_follow = true
    if (viewMode.value === 'mine') {
      if (userInfo.value?.id) params.owner_id = userInfo.value.id
    }
    if (overdueMode.value) {
      params.overdue = true
    }
    if (viewMode.value === 'staff' && staffFilterId.value) {
      params.owner_id = staffFilterId.value
    }

    // Phase 5：正式客户页面，调用 /customers 端点（status IN following/quoted/negotiating/signed）
    const res = await getFormalCustomers(params)
    if (res.code === 200) {
      tableData.value = res.data.list
      total.value = res.data.total
    }
  } catch (error) {
    ElMessage.error('加载客户列表失败'); console.error('获取客户列表失败:', error)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
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

const handleReset = () => {
  searchForm.company_name = ''
  searchForm.contact_name = ''
  searchForm.phone = ''
  searchForm.source = ''
  searchForm.level = ''
  searchForm.status = ''
  searchForm.dateRange = []
  searchForm.sort = ''
  searchForm.page = 1
  fetchList()
}

watch(() => route.fullPath, (newFull, oldFull) => {
  if (newFull === oldFull) return
  if (route.path.includes('customer/list')) {
    // Phase 3：正式客户页面，不再处理 tab 切换
    searchForm.page = 1
    fetchList()
  }
})

const handleQuickTabChange = (val) => {
  searchForm.status = ''
  searchForm.page = 1
  viewMode.value = 'all'
  staffFilterId.value = null
  overdueMode.value = false
  searchForm._overdue_follow = false

  if (val === 'mine') {
    viewMode.value = 'mine'
  } else if (val === 'overdue_follow') {
    searchForm._overdue_follow = true
  }
  fetchList()
}

const clearOverdueFilter = () => {
  overdueMode.value = false
  router.replace({ path: '/customer/list' })
  fetchList()
}

const importVisible = ref(false)
const showQualityCheck = ref(false)

const quickFollowVisible = ref(false)
const quickFollowCustomer = ref(null)

const batchFollowVisible = ref(false)

const onBatchFollowSuccess = () => {
  selectedRows.value = []
  customerTableRef.value?.tableRef?.clearSelection()
  fetchList()
}

const handleExport = async () => {
  exportLoading.value = true
  try {
    const params = {}
    if (searchForm.company_name) params.company_name = searchForm.company_name
    if (searchForm.contact_name) params.contact_name = searchForm.contact_name
    if (searchForm.phone) params.phone = searchForm.phone
    if (searchForm.source) params.source = searchForm.source
    if (searchForm.level) params.level = searchForm.level
    if (searchForm.status !== '' && searchForm.status !== null) params.status = searchForm.status
    if (viewMode.value === 'mine') {
      if (userInfo.value?.id) params.owner_id = userInfo.value.id
    }
    if (viewMode.value === 'staff' && staffFilterId.value) {
      params.owner_id = staffFilterId.value
    }
    const blob = await exportCustomers(params)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '客户列表.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  } catch { ElMessage.error('导出失败') }
  finally { exportLoading.value = false }
}

onMounted(() => {
  fetchList()
  fetchSalesUsers()
  fetchSubordinates()
  if (route.query.action === 'add') handleAdd()
})
</script>

<style scoped>
.customer-list {
  padding: 0;
}
</style>
