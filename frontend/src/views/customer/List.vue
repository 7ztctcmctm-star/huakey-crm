<template>
  <div class="customer-list">
    <CustomerFilter
      v-model:search-form="searchForm"
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
      :error-msg="errorMsg"
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
      @retry="fetchList"
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
import { reportError } from '@/utils/error'
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
import { getFormalCustomers, deleteCustomer, batchAssignCustomer, exportCustomers, getSalesUsers, getMySubordinates } from '@/api/customer'
import { SOURCE_SEARCH_OPTIONS } from '@/constants/source'
import { FILTER_STATUS_OPTIONS, EDIT_STATUS_OPTIONS } from '@/constants/customer'
import { useUser } from '@/composables/useUser'

const router = useRouter()
const route = useRoute()
const { userInfo, isBoss, isManager } = useUser()
const overdueMode = ref(route.query.overdue === 'true')

const activeTab = ref('all')
const handleTabChange = (tab) => {
  // 状态 tab 是**业务状态**筛选（business_status），与快捷 tab（我的/全部客户）正交。
  // 历史缺陷：此处只翻页不落参数，用户点「已签约」列表毫无变化（2026-09-12 修复）。
  // 「全部」= 不传该参数（由后端按正式客户集合兜底），其余按 business_status 过滤。
  // [P1-27] 状态下拉与状态 tab 是同一维度的两种入口。两个不同状态取交集必为空，
  // 因此 tab 生效时清掉下拉值，避免「看起来选了两个条件、结果永远为空」。
  activeTab.value = tab
  searchForm.status = ''
  searchForm.business_status = tab === 'all' ? '' : tab
  searchForm.page = 1
  fetchList()
}

// ⚠️ viewMode 必须与 activeQuickTab 的初值一致。
// 历史上 activeQuickTab 初值为 'mine'（UI 上「我的客户」被选中），而 viewMode 初值为 'all'，
// 首屏发出的请求只有分页参数、不带 owner_id —— UI 说是「我的客户」、数据却是全量，
// 两者长期脱节（2026-09-12 修复，回归测试 frontend/src/tests/unit/views/customerListState.test.js）。
const viewMode = ref('all')
const staffFilterId = ref(null)
const activeQuickTab = ref('all')
const switchViewMode = () => {
  searchForm.page = 1
  fetchList()
}

// [V1.1 §11.3] 统一复用 useUser 的 isBoss/isManager（与后端 requireManager 同口径），
// 不再在本页重复定义 roleCode 判断，避免两处逻辑漂移。
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
  // 业务状态筛选（状态 tab）：'' = 不传，后端按正式客户集合兜底
  business_status: '',
  lifecycle_status: '',
  tag_id: '',
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

const statusOptions = FILTER_STATUS_OPTIONS

const editStatusOptions = EDIT_STATUS_OPTIONS

const tableData = ref([])
const total = ref(0)
const loading = ref(false)
// 加载失败信息：传给 CustomerTable 的 StateWrapper，失败时显示错误态 + 重试
const errorMsg = ref('')
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
      reportError('删除失败:', error)
    }
  }).catch(() => {})
}

const fetchList = async () => {
  loading.value = true
  errorMsg.value = ''
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
    // 状态 tab（业务状态）→ business_status。空串不下发（由后端按正式客户集合兜底）。
    if (searchForm.business_status) params.business_status = searchForm.business_status
    if (searchForm.lifecycle_status) params.lifecycle_status = searchForm.lifecycle_status
    // [P1-27] 标签筛选此前只存在于表单草稿，从未随请求下发（后端 schema 也无此字段）。
    if (searchForm.tag_id) params.tag_id = searchForm.tag_id
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
    } else {
      errorMsg.value = res.message || '加载客户列表失败，请稍后重试'
      reportError('获取客户列表失败:', res.message)
    }
  } catch (error) {
    errorMsg.value = error?.response?.data?.message || '加载客户列表失败，请稍后重试'
    reportError('获取客户列表失败:', error)
    ElMessage.error('加载客户列表失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  // [P1-27] 下拉框显式选了状态时以它为准，并撤下状态 tab（同维度，交集必空）。
  if (searchForm.status) {
    searchForm.business_status = ''
    activeTab.value = 'all'
  }
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
  searchForm.lifecycle_status = ''
  searchForm.tag_id = ''
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
