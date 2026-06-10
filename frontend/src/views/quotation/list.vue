<template>
  <div class="quotation-list">
    <!-- 搜索区域 -->
    <el-card class="search-card" shadow="never">
      <el-form :model="searchForm" inline @keyup.enter="handleSearch">
        <el-form-item label="报价单号">
          <el-input v-model="searchForm.quote_no" placeholder="请输入报价单号" clearable />
        </el-form-item>
        <el-form-item label="客户名称">
          <el-input v-model="searchForm.customer_name" placeholder="请输入客户名称" clearable />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="审批">
          <el-select v-model="searchForm.approval_status" placeholder="全部" clearable>
            <el-option label="待审批" :value="1" />
            <el-option label="已通过" :value="2" />
            <el-option label="已拒绝" :value="3" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">搜索</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 操作按钮区域 -->
    <el-card class="table-card" shadow="never">
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="handleAdd" v-permission="'quotation:add'">新建报价单</el-button>
      </div>

      <!-- 表格 -->
      <el-table
        v-loading="loading"
        :data="tableData"
        stripe
        border
        style="width: 100%"
        :header-cell-style="{ background: 'var(--color-bg)', color: 'var(--color-text)' }"
      >
        <el-table-column prop="quote_no" label="报价单号" min-width="140" show-overflow-tooltip />
        <el-table-column prop="customer_name" label="客户名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="amount" label="总金额" width="130" align="right">
          <template #default="{ row }">
            <span class="amount">¥{{ formatAmount(row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="discount" label="折扣" width="90" align="center">
          <template #default="{ row }">
            <el-tag type="info">{{ Math.round((1 - row.discount) * 100) }}%</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="final_amount" label="折后金额" width="130" align="right">
          <template #default="{ row }">
            <span class="amount final">¥{{ formatAmount(row.final_amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="valid_days" label="有效期" width="90" align="center">
          <template #default="{ row }">
            {{ row.valid_days }}天
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="dark">
              {{ statusMap[row.status] || '未知' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="approval_status" label="审批状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="approvalTagType(row.approval_status)" size="small">
              {{ approvalMap[row.approval_status] || '未知' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="create_name" label="创建人" width="100" />
        <el-table-column prop="create_time" label="创建时间" width="170">
          <template #default="{ row }">
            {{ formatTime(row.create_time) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link :icon="View" @click="handleView(row)">查看</el-button>
            <el-button v-if="row.status === 1" type="primary" link :icon="Edit" @click="handleEdit(row)" v-permission="'quotation:edit'">编辑</el-button>
            <el-button v-if="row.status === 1 || row.status === 2" type="success" link :icon="Promotion" @click="handleSend(row)" v-permission="'quotation:edit'">发送</el-button>
            <el-button v-if="row.status === 1 || row.status === 2" type="danger" link :icon="Delete" @click="handleDelete(row)" v-permission="'quotation:delete'">删除</el-button>
            <el-button v-if="row.status === 3" type="warning" link @click="handleConvertToContract(row)" v-permission="'contract:add'">转合同</el-button>
            <el-button v-if="row.approval_status === 0 && row.status === 1" type="warning" link @click="handleSubmitApproval(row)">提交审批</el-button>
            <el-button v-if="row.approval_status === 1 && isAdmin" type="success" link @click="handleApprove(row)">通过</el-button>
            <el-button v-if="row.approval_status === 1 && isAdmin" type="danger" link @click="handleReject(row)">拒绝</el-button>
            <el-button v-if="row.approval_status === 1" type="info" link @click="handleWithdrawApproval(row)">撤回</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination">
        <el-pagination
          v-model:current-page="searchForm.page"
          v-model:page-size="searchForm.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSearch"
          @current-change="handleSearch"
        />
      </div>
    </el-card>

    <!-- 详情弹窗 -->
    <el-dialog
      v-model="detailVisible"
      :title="detailData.quote_no || '报价单详情'"
      width="800px"
      :close-on-click-modal="false"
    >
      <div class="quote-detail">
        <div class="detail-header">
          <div class="info-row">
            <span class="label">客户名称:</span>
            <span class="value">{{ detailData.customer_name }}</span>
            <span class="label">联系人:</span>
            <span class="value">{{ detailData.contact_name }}</span>
            <span class="label">联系电话:</span>
            <span class="value">{{ detailData.phone }}</span>
          </div>
          <div class="info-row">
            <span class="label">创建人:</span>
            <span class="value">{{ detailData.create_name }}</span>
            <span class="label">创建时间:</span>
            <span class="value">{{ formatTime(detailData.create_time) }}</span>
            <span class="label">状态:</span>
            <el-tag :type="statusTagType(detailData.status)">{{ statusMap[detailData.status] }}</el-tag>
          </div>
        </div>

        <div class="detail-body">
          <el-table
            :data="detailData.items || []"
            border
            style="width: 100%"
            :header-cell-style="{ background: 'var(--color-bg)' }"
          >
            <el-table-column prop="product_code" label="产品编码" width="120" />
            <el-table-column prop="product_name" label="产品名称" min-width="200" />
            <el-table-column prop="quantity" label="数量" width="80" align="center" />
            <el-table-column prop="unit_price" label="单价" width="120" align="right">
              <template #default="{ row }">¥{{ formatAmount(row.unit_price) }}</template>
            </el-table-column>
            <el-table-column prop="total_price" label="小计" width="120" align="right">
              <template #default="{ row }">¥{{ formatAmount(row.total_price) }}</template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" />
          </el-table>
        </div>

        <div class="detail-footer">
          <div class="summary-row">
            <span class="summary-label">总金额:</span>
            <span class="summary-value">¥{{ formatAmount(detailData.amount) }}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">折扣:</span>
            <span class="summary-value">{{ Math.round((1 - detailData.discount) * 100) }}%</span>
          </div>
          <div class="summary-row total">
            <span class="summary-label">折后金额:</span>
            <span class="summary-value">¥{{ formatAmount(detailData.final_amount) }}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">有效期:</span>
            <span class="summary-value">{{ detailData.valid_days }}天</span>
          </div>
          <div v-if="detailData.remark" class="remark-row">
            <span class="summary-label">备注:</span>
            <span class="remark-value">{{ detailData.remark }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Plus, View, Edit, Promotion, Delete } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { formatTime, formatAmount } from '@/composables/useFormat'

const router = useRouter()
const route = useRoute()

const STATUS_MAP = {
  1: '草稿',
  2: '已发送',
  3: '已确认',
  4: '已失效'
}

const statusMap = STATUS_MAP

const statusOptions = [
  { label: '草稿', value: 1 },
  { label: '已发送', value: 2 },
  { label: '已确认', value: 3 },
  { label: '已失效', value: 4 }
]

const statusTagType = (status) => {
  const map = { 1: 'info', 2: 'warning', 3: 'success', 4: 'danger' }
  return map[status] || 'info'
}

// 审批状态映射
const approvalMap = { 1: '待审批', 2: '已通过', 3: '已拒绝' }
const approvalTagType = (s) => ({ 1: 'warning', 2: 'success', 3: 'danger' }[s] || 'info')
// 判断当前用户是否为管理员（可审批）
const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}')
const isAdmin = userInfo.roleId === 1 || userInfo.roleId === 2 || userInfo.manageAll


// 搜索表单
const searchForm = reactive({
  quote_no: '',
  customer_name: '',
  status: '',
  approval_status: '',
  page: 1,
  pageSize: 10
})

// 表格数据
const tableData = ref([])
const total = ref(0)
const loading = ref(false)

// 详情弹窗
const detailVisible = ref(false)
const detailData = ref({})

// 获取报价单列表
const fetchList = async () => {
  loading.value = true
  try {
    const params = {
      page: searchForm.page,
      pageSize: searchForm.pageSize
    }
    if (searchForm.quote_no) params.quote_no = searchForm.quote_no
    if (searchForm.customer_name) params.customer_name = searchForm.customer_name
    if (searchForm.status !== '' && searchForm.status !== null) params.status = searchForm.status
    if (searchForm.approval_status !== '' && searchForm.approval_status !== null) params.approval_status = searchForm.approval_status

    const res = await request.post('/quote/list', params)
    if (res.code === 200) {
      tableData.value = res.data.list
      total.value = res.data.total
    }
  } catch (error) {
    console.error('获取报价单列表失败:', error)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  searchForm.page = 1
  fetchList()
}

const handleReset = () => {
  searchForm.quote_no = ''
  searchForm.customer_name = ''
  searchForm.status = ''
  searchForm.approval_status = ''
  searchForm.page = 1
  fetchList()
}

const handleAdd = () => {
  router.push('/quotation/edit')
}

const handleEdit = (row) => {
  router.push(`/quotation/edit/${row.id}`)
}

const handleView = async (row) => {
  try {
    const res = await request.get(`/quote/detail/${row.id}`)
    if (res.code === 200) {
      detailData.value = res.data
      detailVisible.value = true
    }
  } catch (error) {
    console.error('获取报价单详情失败:', error)
  }
}

const handleSend = (row) => {
  ElMessageBox.confirm(
    `确定发送报价单"${row.quote_no}"给客户？发送后状态将变为"已发送"。`,
    '发送确认',
    { confirmButtonText: '确定发送', cancelButtonText: '取消', type: 'warning' }
  ).then(async () => {
    try {
      const res = await request.post('/quote/update', { id: row.id, status: 2 })
      if (res.code === 200) {
        ElMessage.success('已发送')
        fetchList()
      }
    } catch (error) {
      console.error('发送报价单失败:', error)
    }
  }).catch(() => {})
}

const handleDelete = (row) => {
  ElMessageBox.confirm(
    `确定要删除报价单"${row.quote_no}"吗？`,
    '删除确认',
    {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      const res = await request.post('/quote/delete', { id: row.id })
      if (res.code === 200) {
        ElMessage.success('删除成功')
        fetchList()
      }
    } catch (error) {
      console.error('删除失败:', error)
    }
  })
}

const handleConvertToContract = (row) => {
  ElMessageBox.confirm(
    `确定要将报价单"${row.quote_no}"转为合同吗？`,
    '转合同确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      const res = await request.post('/quote/to-contract', { id: row.id })
      if (res.code === 200) {
        ElMessage.success(res.message)
        // [修复] 路由中无 /contract/edit/:id，改为已存在的合同详情页
        router.push(`/contract/detail/${res.data.contract_id}`)
      }
    } catch (error) {
      console.error('转合同失败:', error)
    }
  })
}

onMounted(() => {
  fetchList()
  if (route.query.id) handleView({ id: route.query.id })
})

// 审批操作
const handleApprove = (row) => {
  ElMessageBox.confirm('确定通过该报价单的审批？', '审批确认', {
    confirmButtonText: '确定通过',
    cancelButtonText: '取消',
    type: 'success'
  }).then(async () => {
    try {
      const res = await request.post('/quote/approve', { id: row.id, approval_status: 2 })
      if (res.code === 200) {
        ElMessage.success('审批通过')
        fetchList()
      }
    } catch (error) {
      console.error('审批失败:', error)
    }
  }).catch(() => {})
}

const handleReject = (row) => {
  ElMessageBox.prompt('请输入拒绝原因（将通知创建人）', '拒绝审批', {
    confirmButtonText: '确定拒绝',
    cancelButtonText: '取消',
    type: 'warning',
    inputPlaceholder: '请输入拒绝原因',
    inputValidator: (v) => { if (!v || !v.trim()) return '拒绝原因不能为空'; return true }
  }).then(async ({ value }) => {
    try {
      const res = await request.post('/quote/approve', { id: row.id, approval_status: 3, approval_remark: value.trim() })
      if (res.code === 200) {
        ElMessage.success('已拒绝')
        fetchList()
      }
    } catch (error) {
      console.error('拒绝失败:', error)
    }
  }).catch(() => {})
}

// 提交审批
const handleSubmitApproval = (row) => {
  ElMessageBox.confirm(`确定提交报价单"${row.quote_no}"进行审批？`, '提交审批', {
    confirmButtonText: '确定提交',
    cancelButtonText: '取消',
    type: 'info'
  }).then(async () => {
    try {
      const res = await request.post('/approval/submit', { business_type: 'quote', business_id: row.id })
      if (res.code === 200) {
        ElMessage.success('已提交审批')
        fetchList()
      }
    } catch (error) {
      console.error('提交审批失败:', error)
    }
  }).catch(() => {})
}

// 撤回审批
const handleWithdrawApproval = (row) => {
  ElMessageBox.confirm(`确定撤回报价单"${row.quote_no}"的审批？`, '撤回审批', {
    confirmButtonText: '确定撤回',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      const res = await request.delete(`/approval/withdraw/quote/${row.id}`)
      if (res.code === 200) {
        ElMessage.success('审批已撤回')
        fetchList()
      }
    } catch (error) {
      console.error('撤回审批失败:', error)
    }
  }).catch(() => {})
}
</script>

<style scoped>
.quotation-list {
  padding: 0;
}

.search-card {
  margin-bottom: var(--space-4);
}

.table-card {
  margin-bottom: var(--space-4);
}

.toolbar {
  margin-bottom: var(--space-4);
}

.amount {
  font-weight: 600;
  color: var(--color-text);
}

.amount.final {
  color: var(--color-accent);
  font-size: 14px;
}

.pagination {
  margin-top: var(--space-5);
  display: flex;
  justify-content: flex-end;
}

.quote-detail {
  padding: var(--space-2);
}

.detail-header {
  margin-bottom: var(--space-5);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.info-row {
  display: flex;
  gap: var(--space-4);
  margin-bottom: var(--space-2);
}

.info-row .label {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.info-row .value {
  color: var(--color-text);
  font-weight: 500;
}

.detail-body {
  margin-bottom: var(--space-5);
}

.detail-footer {
  background: var(--color-bg-secondary);
  padding: var(--space-4);
  border-radius: var(--radius-sm);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: var(--space-2) 0;
  border-bottom: 1px dashed var(--color-border-strong);
}

.summary-row:last-child {
  border-bottom: none;
}

.summary-row.total {
  background: var(--color-bg);
  padding: var(--space-4);
  margin: var(--space-2) -15px -15px;
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.summary-row.total .summary-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-accent);
}

.summary-label {
  color: var(--color-text-secondary);
}

.summary-value {
  color: var(--color-text);
  font-weight: 600;
}

.remark-row {
  display: block;
}

.remark-value {
  color: var(--color-text-secondary);
  margin-left: var(--space-2);
}
</style>
