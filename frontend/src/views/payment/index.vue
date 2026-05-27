<template>
  <div class="page-container">
    <div class="page-header">
      <h2>回款管理</h2>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="16" style="margin-bottom: 16px;">
      <el-col :span="8">
        <el-card shadow="never" class="stat-card">
          <div class="stat-value">{{ overdueCount }}笔</div>
          <div class="stat-label">逾期未回款</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Tab切换 -->
    <el-card shadow="never">
      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <el-tab-pane label="全部回款" name="all">
          <el-table v-loading="loading" :data="tableData" stripe border style="width: 100%">
            <el-table-column prop="contract_no" label="合同编号" width="160" />
            <el-table-column prop="company_name" label="客户名称" min-width="160" show-overflow-tooltip />
            <el-table-column prop="pay_date" label="回款日期" width="120" />
            <el-table-column prop="pay_amount" label="回款金额" width="130" align="right">
              <template #default="{ row }">¥{{ fmt(row.pay_amount) }}</template>
            </el-table-column>
            <el-table-column prop="pay_method" label="回款方式" width="100" />
            <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="逾期未回款" name="overdue">
          <el-table v-loading="loading" :data="tableData" stripe border style="width: 100%">
            <el-table-column prop="contract_no" label="合同编号" width="160" />
            <el-table-column prop="company_name" label="客户名称" min-width="160" show-overflow-tooltip />
            <el-table-column prop="plan_date" label="计划日期" width="120" />
            <el-table-column prop="plan_amount" label="计划金额" width="130" align="right">
              <template #default="{ row }">¥{{ fmt(row.plan_amount) }}</template>
            </el-table-column>
            <el-table-column prop="paid_amount" label="已回款" width="130" align="right">
              <template #default="{ row }">¥{{ fmt(row.paid_amount) }}</template>
            </el-table-column>
            <el-table-column prop="remain_amount" label="未回款" width="130" align="right">
              <template #default="{ row }">
                <span style="color: #dc2626; font-weight: 600;">¥{{ fmt(row.remain_amount) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="overdue_days" label="逾期天数" width="100" align="center">
              <template #default="{ row }">
                <el-tag type="danger" size="small">{{ row.overdue_days }}天</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="goContract(row)">去回款</el-button>
                <el-button type="success" link @click="quickPayFromOverdue(row)">快速录入</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="客户对账" name="summary">
          <el-table v-loading="summaryLoading" :data="summaryData" stripe border style="width: 100%">
            <el-table-column prop="company_name" label="客户名称" min-width="180" show-overflow-tooltip />
            <el-table-column prop="contract_count" label="合同数" width="80" align="center" />
            <el-table-column label="合同总额" width="140" align="right">
              <template #default="{ row }">¥{{ fmt(row.total_amount) }}</template>
            </el-table-column>
            <el-table-column label="已回款" width="140" align="right">
              <template #default="{ row }" style="color: #16a34a;">¥{{ fmt(row.paid_amount) }}</template>
            </el-table-column>
            <el-table-column label="未回款" width="140" align="right">
              <template #default="{ row }">
                <span :style="{ color: parseFloat(row.outstanding_amount) > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }">¥{{ fmt(row.outstanding_amount) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="回款率" width="100" align="center">
              <template #default="{ row }">
                {{ row.total_amount > 0 ? Math.round(row.paid_amount / row.total_amount * 100) : 100 }}%
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>

      <!-- 搜索栏 -->
      <div style="margin-bottom: 16px; display: flex; gap: 8px;">
        <el-input v-model="keyword" placeholder="合同编号/客户名称" clearable style="width: 240px;" @keyup.enter="fetchList" />
        <el-date-picker v-model="dateRange" type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" style="width: 240px;" />
        <el-button type="primary" @click="activeTab === 'summary' ? fetchSummary() : fetchList()">搜索</el-button>
        <el-button type="success" @click="openQuickPay" style="margin-left: auto;">快速录入回款</el-button>
        <el-upload
          :action="importUrl"
          :headers="uploadHeaders"
          :show-file-list="false"
          :on-success="handleImportSuccess"
          :on-error="handleImportError"
          accept=".xlsx,.xls,.csv"
          style="display: inline-block;"
        >
          <el-button type="warning">批量导入回款</el-button>
        </el-upload>
        <el-button link @click="downloadTemplate">下载导入模板</el-button>
        <el-button type="warning" :loading="exportLoading" @click="handleExport">导出Excel</el-button>
      </div>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        style="margin-top: 16px; text-align: right;"
        @size-change="fetchList"
        @current-change="fetchList"
      />
    </el-card>

    <!-- 快速回款录入弹窗 -->
    <el-dialog v-model="quickPayVisible" title="快速录入回款" width="520px" @close="resetQuickPay">
      <el-form ref="quickPayFormRef" :model="quickPayForm" :rules="quickPayRules" label-width="90px">
        <el-form-item label="合同" prop="contract_id">
          <el-select
            v-model="quickPayForm.contract_id"
            filterable
            remote
            reserve-keyword
            placeholder="输入合同编号或客户名称搜索"
            :remote-method="searchContracts"
            :loading="contractSearchLoading"
            style="width: 100%"
          >
            <el-option
              v-for="item in contractOptions"
              :key="item.id"
              :label="`${item.contract_no} - ${item.company_name}`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="回款日期" prop="pay_date">
          <el-date-picker v-model="quickPayForm.pay_date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item label="回款金额" prop="pay_amount">
          <el-input-number v-model="quickPayForm.pay_amount" :min="0.01" :precision="2" :controls="false" style="width: 100%" />
        </el-form-item>
        <el-form-item label="回款方式" prop="pay_method">
          <el-select v-model="quickPayForm.pay_method" placeholder="请选择" style="width: 100%">
            <el-option label="银行转账" value="银行转账" />
            <el-option label="现金" value="现金" />
            <el-option label="支票" value="支票" />
            <el-option label="微信/支付宝" value="微信/支付宝" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="quickPayForm.remark" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="quickPayVisible = false">取消</el-button>
        <el-button type="primary" :loading="quickPaySubmitting" @click="submitQuickPay">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'

const router = useRouter()
const activeTab = ref('all')
const loading = ref(false)
const tableData = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const dateRange = ref([])
const overdueCount = ref(0)
const exportLoading = ref(false)

// 导入相关
const importUrl = '/api/contract/payment/import'
const uploadHeaders = { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }

// 对账汇总
const summaryLoading = ref(false)
const summaryData = ref([])

// 快速回款录入
const quickPayVisible = ref(false)
const quickPaySubmitting = ref(false)
const quickPayFormRef = ref(null)
const contractSearchLoading = ref(false)
const contractOptions = ref([])
const quickPayForm = ref({
  contract_id: null,
  pay_date: new Date().toISOString().slice(0, 10),
  pay_amount: null,
  pay_method: '银行转账',
  remark: ''
})
const quickPayRules = {
  contract_id: [{ required: true, message: '请选择合同', trigger: 'change' }],
  pay_date: [{ required: true, message: '请选择日期', trigger: 'change' }],
  pay_amount: [{ required: true, message: '请输入金额', trigger: 'blur' }],
  pay_method: [{ required: true, message: '请选择方式', trigger: 'change' }]
}

const fmt = (v) => {
  if (!v && v !== 0) return '0.00'
  return parseFloat(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await request.post('/contract/payment/list', {
      page: page.value,
      pageSize: pageSize.value,
      tab: activeTab.value,
      keyword: keyword.value || undefined,
      start_date: dateRange.value?.[0] || undefined,
      end_date: dateRange.value?.[1] || undefined
    })
    if (res.code === 200) {
      tableData.value = res.data.list
      total.value = res.data.total
    }
  } catch {
    /* ignore */
  } finally {
    loading.value = false
  }
}

// 获取逾期数量（用于顶部统计卡片）
const fetchOverdueCount = async () => {
  try {
    const res = await request.post('/contract/payment/list', { page: 1, pageSize: 1, tab: 'overdue' })
    if (res.code === 200) overdueCount.value = res.data.total
  } catch { /* ignore */ }
}

const handleTabChange = () => {
  page.value = 1
  keyword.value = ''
  if (activeTab.value === 'summary') {
    fetchSummary()
  } else {
    tableData.value = []
    fetchList()
  }
}

const fetchSummary = async () => {
  summaryLoading.value = true
  try {
    const res = await request.post('/contract/payment/summary', {
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined
    })
    if (res.code === 200) {
      summaryData.value = res.data.list
      total.value = res.data.total
    }
  } catch { /* ignore */ }
  finally { summaryLoading.value = false }
}

const goContract = (row) => {
  router.push(`/contract/detail/${row.contract_id}`)
}

// 快速回款录入
const searchContracts = async (query) => {
  if (!query) { contractOptions.value = []; return }
  contractSearchLoading.value = true
  try {
    const res = await request.get('/contract/search', { params: { keyword: query } })
    if (res.code === 200) contractOptions.value = res.data
  } catch { /* ignore */ }
  finally { contractSearchLoading.value = false }
}

const openQuickPay = () => {
  resetQuickPay()
  quickPayVisible.value = true
}

const quickPayFromOverdue = (row) => {
  resetQuickPay()
  quickPayForm.value.contract_id = row.contract_id
  contractOptions.value = [{ id: row.contract_id, contract_no: row.contract_no, company_name: row.company_name }]
  quickPayVisible.value = true
}

const resetQuickPay = () => {
  quickPayForm.value = {
    contract_id: null,
    pay_date: new Date().toISOString().slice(0, 10),
    pay_amount: null,
    pay_method: '银行转账',
    remark: ''
  }
  contractOptions.value = []
  quickPayFormRef.value?.resetFields()
}

const submitQuickPay = async () => {
  const valid = await quickPayFormRef.value?.validate().catch(() => false)
  if (!valid) return
  quickPaySubmitting.value = true
  try {
    await request.post('/contract/payment/add', quickPayForm.value)
    ElMessage.success('回款录入成功')
    quickPayVisible.value = false
    fetchList()
    fetchOverdueCount()
  } catch { /* error handled by interceptor */ }
  finally { quickPaySubmitting.value = false }
}

const handleImportSuccess = (res) => {
  if (res.code === 200) {
    ElMessage.success(res.message)
    fetchList()
    fetchOverdueCount()
  } else {
    ElMessage.error(res.message || '导入失败')
  }
}

const handleImportError = () => {
  ElMessage.error('文件上传失败')
}

const downloadTemplate = () => {
  window.open('/api/contract/payment/import-template', '_blank')
}

const handleExport = async () => {
  exportLoading.value = true
  try {
    const res = await request.post('/contract/payment/export', {
      keyword: keyword.value || undefined,
      start_date: dateRange.value?.[0] || undefined,
      end_date: dateRange.value?.[1] || undefined
    }, { responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([res]))
    const link = document.createElement('a')
    link.href = url
    link.download = `回款列表_${new Date().toISOString().slice(0, 10)}.xlsx`
    link.click()
    window.URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch {
    ElMessage.error('导出失败')
  } finally {
    exportLoading.value = false
  }
}

onMounted(() => {
  fetchList()
  fetchOverdueCount()
})
</script>

<style scoped>
.page-container { padding: 24px; }
.page-header { margin-bottom: 24px; }
.page-header h2 { margin: 0; font-size: 18px; color: var(--c-text); }
.stat-card { text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; color: #dc2626; }
.stat-label { color: var(--c-text-secondary); margin-top: 4px; }
</style>
