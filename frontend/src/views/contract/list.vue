<template>
  <div class="page-container">
    <div class="page-header"><h2>合同管理</h2></div>

    <el-card shadow="never" class="search-card">
      <el-form :model="searchForm" inline @keyup.enter="handleSearch">
        <el-form-item label="关键词">
          <el-input v-model="searchForm.keyword" placeholder="合同编号/客户名称" clearable style="width:200px" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部" clearable style="width:140px">
            <el-option label="待执行" :value="1" /><el-option label="执行中" :value="2" />
            <el-option label="已完成" :value="3" /><el-option label="已取消" :value="4" />
          </el-select>
        </el-form-item>
        <el-form-item label="审批">
          <el-select v-model="searchForm.approval_status" placeholder="全部" clearable style="width:120px">
            <el-option label="待审批" :value="1" /><el-option label="已通过" :value="2" /><el-option label="已拒绝" :value="3" />
          </el-select>
        </el-form-item>
        <el-form-item label="回款">
          <el-select v-model="searchForm.payment_status" placeholder="全部" clearable style="width:140px">
            <el-option label="已逾期" value="overdue">
              <span style="color: #dc2626; font-weight: bold">已逾期</span>
            </el-option>
            <el-option label="部分回款" value="partial" /><el-option label="已回清" value="completed" /><el-option label="待回款" value="pending" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">搜索</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar"><el-button type="primary" :icon="Plus" @click="handleCreate" v-permission="'contract:add'">新增合同</el-button><el-button type="warning" :icon="Download" :loading="exportLoading" @click="handleExport" v-permission="'contract'">导出Excel</el-button></div>
      <el-table v-loading="loading" :data="tableData" stripe border
        :row-class-name="tableRowClassName"
        :header-cell-style="{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }">
        <el-table-column prop="contract_no" label="合同编号" width="160" />
        <el-table-column prop="customer_name" label="客户名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="amount" label="合同金额" width="130" align="right">
          <template #default="{ row }">{{ row.currency_symbol || '¥' }}{{ fmt(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="paid_amount" label="已回款" width="130" align="right">
          <template #default="{ row }">{{ row.currency_symbol || '¥' }}{{ fmt(row.paid_amount) }}</template>
        </el-table-column>
        <el-table-column prop="sign_date" label="签订日期" width="110" />
        <el-table-column prop="delivery_date" label="交付日期" width="110" />
        <el-table-column prop="status" label="状态" width="90" align="center">
          <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="approval_status" label="审批状态" width="100" align="center">
          <template #default="{ row }"><el-tag :type="approvalTagType(row.approval_status)" size="small">{{ approvalMap[row.approval_status] || '未知' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link :icon="View" @click="handleView(row)">查看</el-button>
            <el-button type="primary" link :icon="Edit" @click="handleEdit(row)" v-permission="'contract:edit'">编辑</el-button>
            <el-button v-if="row.approval_status === 2" type="warning" link @click="openQuickPay(row)" v-permission="'contract:edit'">回款</el-button>
            <el-button type="danger" link :icon="Delete" @click="handleDelete(row)" v-permission="'contract:delete'">删除</el-button>
            <el-button v-if="row.approval_status === 0" type="warning" link @click="handleSubmitApproval(row)">提交审批</el-button>
            <el-button v-if="row.approval_status === 1 && isAdmin" type="success" link @click="handleApprove(row)">通过</el-button>
            <el-button v-if="row.approval_status === 1 && isAdmin" type="danger" link @click="handleReject(row)">拒绝</el-button>
            <el-button v-if="row.approval_status === 1" type="info" link @click="handleWithdrawApproval(row)">撤回</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="total" layout="total,sizes,prev,pager,next" @size-change="fetchList" @current-change="fetchList" />
      </div>
    </el-card>

    <!-- 新增/编辑 -->
    <el-dialog v-model="formVisible" :title="isEdit?'编辑合同':'新增合同'" width="650px" @closed="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item v-if="!isEdit" label="使用模板">
          <el-select v-model="selectedTemplate" placeholder="选择合同模板(可选)" clearable style="width:100%" @change="applyTemplate">
            <el-option v-for="t in templateOptions" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="客户" prop="customer_id">
          <el-select v-model="form.customer_id" placeholder="选择客户" filterable style="width:100%">
            <el-option v-for="c in customerOptions" :key="c.id" :label="c.company_name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联商机">
          <el-select v-model="form.opportunity_id" placeholder="选择商机(可选)" clearable filterable style="width:100%">
            <el-option v-for="o in opportunityOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="合同金额" prop="amount"><el-input-number v-model="form.amount" :min="0" :precision="2" style="width:100%" controls-position="right" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="状态"><el-select v-model="form.status" style="width:100%"><el-option label="待执行" :value="1" /><el-option label="执行中" :value="2" /><el-option label="已完成" :value="3" /><el-option label="已取消" :value="4" /></el-select></el-form-item></el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="签订日期"><el-date-picker v-model="form.sign_date" type="date" placeholder="选择日期" style="width:100%" value-format="YYYY-MM-DD" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="交付日期"><el-date-picker v-model="form.delivery_date" type="date" placeholder="选择日期" style="width:100%" value-format="YYYY-MM-DD" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="付款条款"><el-input v-model="form.payment_terms" placeholder="如：月结30天" /></el-form-item>
        <el-divider>回款计划</el-divider>
        <el-button type="primary" size="small" :icon="Plus" @click="addPlan" style="margin-bottom:8px">添加计划</el-button>
        <el-table :data="form.plans" border size="small">
          <el-table-column label="计划日期" width="150"><template #default="{row}"><el-date-picker v-model="row.plan_date" type="date" placeholder="日期" value-format="YYYY-MM-DD" size="small" /></template></el-table-column>
          <el-table-column label="金额" width="150"><template #default="{row}"><el-input-number v-model="row.plan_amount" :min="0" :precision="2" size="small" controls-position="right" /></template></el-table-column>
          <el-table-column label="备注"><template #default="{row}"><el-input v-model="row.remark" size="small" placeholder="备注" /></template></el-table-column>
          <el-table-column label="操作" width="70"><template #default="{$index}"><el-button type="danger" link size="small" @click="form.plans.splice($index,1)">删除</el-button></template></el-table-column>
        </el-table>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="formVisible=false">取消</el-button><el-button type="primary" :loading="saveLoading" @click="submitForm">保存</el-button></template>
    </el-dialog>

    <!-- 快速登记回款弹窗 -->
    <el-dialog v-model="quickPayVisible" :title="'登记回款 - ' + (quickPayContract?.customer_name || '')" width="480px" @closed="resetQuickPay">
      <el-form ref="quickPayFormRef" :model="quickPayForm" :rules="quickPayRules" label-width="90px">
        <el-form-item label="关联计划">
          <el-select v-model="quickPayForm.plan_id" placeholder="选择回款计划(可选)" clearable style="width:100%" @change="onPlanChange">
            <el-option v-for="p in quickPayPlans" :key="p.id" :label="`${p.plan_date} ¥${fmt(p.plan_amount - (p.paid_amount||0))} 待回 / 计划¥${fmt(p.plan_amount)}`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="回款日期" prop="pay_date">
          <el-date-picker v-model="quickPayForm.pay_date" type="date" placeholder="选择日期" style="width:100%" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="回款金额" prop="pay_amount">
          <el-input-number v-model="quickPayForm.pay_amount" :min="0" :precision="2" style="width:100%" controls-position="right" />
        </el-form-item>
        <el-form-item label="付款方式">
          <el-input v-model="quickPayForm.pay_method" placeholder="如：银行转账" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="quickPayForm.remark" placeholder="备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="quickPayVisible = false">取消</el-button>
        <el-button type="primary" :loading="quickPayLoading" @click="submitQuickPay">保存</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh, View, Edit, Delete, Download, Coin } from '@element-plus/icons-vue'
import request from '@/utils/request'

const router = useRouter()
const route = useRoute()

const loading = ref(false), tableData = ref([]), total = ref(0), page = ref(1), pageSize = ref(20), exportLoading = ref(false)
const searchForm = reactive({ keyword: '', status: '', approval_status: '', payment_status: '' })
const formVisible = ref(false), isEdit = ref(false), saveLoading = ref(false), formRef = ref(null), editId = ref(null)
const customerOptions = ref([]), opportunityOptions = ref([])
const templateOptions = ref([]), selectedTemplate = ref(null)
const form = reactive({ customer_id: null, opportunity_id: null, amount: 0, sign_date: '', delivery_date: '', payment_terms: '', status: 1, remark: '', plans: [] })
const rules = { customer_id: [{ required: true, message: '请选择客户', trigger: 'change' }], amount: [{ required: true, message: '请输入合同金额', trigger: 'blur' }] }

// 快速回款
const quickPayVisible = ref(false), quickPayLoading = ref(false), quickPayFormRef = ref(null)
const quickPayPlans = ref([]), quickPayContract = ref(null)
const quickPayForm = reactive({ plan_id: null, pay_date: '', pay_amount: 0, pay_method: '', remark: '' })
const quickPayRules = {
  pay_date: [{ required: true, message: '请选择日期', trigger: 'change' }],
  pay_amount: [{ required: true, message: '请输入金额', trigger: 'blur' }]
}

const fmt = (v) => { const n = Number(v); if (isNaN(n)) return '0.00'; return n.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }
const statusType = (s) => ({ 1: 'info', 2: '', 3: 'success', 4: 'danger' }[s] || 'info')
const statusText = (s) => ({ 1: '待执行', 2: '执行中', 3: '已完成', 4: '已取消' }[s] || '未知')
// 审批状态
const approvalMap = { 1: '待审批', 2: '已通过', 3: '已拒绝' }
const approvalTagType = (s) => ({ 1: 'warning', 2: 'success', 3: 'danger' }[s] || 'info')
const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}')
const isAdmin = userInfo.roleId === 1 || userInfo.roleId === 2 || userInfo.manageAll

const fetchList = async () => {
  loading.value = true
  try { const r = await request.post('/contract/list', { page: page.value, pageSize: pageSize.value, ...searchForm }); if (r.code === 200) { tableData.value = r.data.list; total.value = r.data.total } } catch { ElMessage.error('加载失败') }
  finally { loading.value = false }
}
const fetchCustomers = async () => { try { const r = await request.post('/customer/list', { page: 1, pageSize: 200 }); if (r.code === 200) customerOptions.value = r.data.list } catch { /**/ } }
const fetchOpportunities = async () => { try { const r = await request.get('/contract/opportunity-list'); if (r.code === 200) opportunityOptions.value = r.data } catch { /**/ } }

// P0-3: 逾期回款行高亮
const tableRowClassName = ({ row }) => {
  if (row.payment_status === 'overdue' || (row.plan_total > 0 && row.paid_amount < row.plan_total && row.sign_date && new Date() - new Date(row.sign_date) > 30 * 86400000)) {
    return 'overdue-payment-row'
  }
  return ''
}

const handleSearch = () => { page.value = 1; fetchList() }
const handleReset = () => { searchForm.keyword = ''; searchForm.status = ''; searchForm.approval_status = ''; searchForm.payment_status = ''; handleSearch() }

const handleView = (row) => {
  router.push(`/contract/detail/${row.id}`)
}

// P2-4: 合同模板
const fetchTemplates = async () => {
  try { const res = await request.get('/contract-template/list'); if (res.code === 200) templateOptions.value = res.data; } catch {}
}
const applyTemplate = (templateId) => {
  if (!templateId) { resetForm(); return }
  const t = templateOptions.value.find(item => item.id === templateId)
  if (!t) return
  form.amount = t.amount || 0
  form.payment_terms = t.payment_terms || ''
  form.delivery_date = t.delivery_days ? new Date(Date.now() + t.delivery_days * 86400000).toISOString().split('T')[0] : ''
  form.remark = t.remark || ''
}
const handleCreate = () => { isEdit.value = false; editId.value = null; selectedTemplate.value = null; resetForm(); formVisible.value = true; fetchTemplates() }

const handleEdit = async (row) => {
  isEdit.value = true; editId.value = row.id
  try {
    const r = await request.get(`/contract/detail/${row.id}`)
    if (r.code === 200) {
      const d = r.data
      Object.assign(form, { customer_id: d.customer_id, opportunity_id: d.opportunity_id, amount: d.amount, sign_date: d.sign_date||'', delivery_date: d.delivery_date||'', payment_terms: d.payment_terms||'', status: d.status, remark: d.remark||'', plans: (d.plans||[]).map(p=>({...p})) })
      formVisible.value = true
    }
  } catch { ElMessage.error('加载失败') }
}

const handleDelete = (row) => {
  ElMessageBox.confirm('删除合同将同时删除关联的回款记录，此操作不可恢复，确定继续？', '删除确认', { type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消' }).then(async () => {
    const r = await request.post('/contract/delete', { id: row.id })
    if (r.code === 200) { ElMessage.success('已删除'); fetchList() } else { ElMessage.error(r.message||'删除失败') }
  }).catch(() => {})
}

const addPlan = () => { form.plans.push({ plan_date: '', plan_amount: 0, remark: '' }) }
const resetForm = () => { Object.assign(form, { customer_id: null, opportunity_id: null, amount: 0, sign_date: '', delivery_date: '', payment_terms: '', status: 1, remark: '', plans: [] }) }

const submitForm = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    saveLoading.value = true
    try {
      const data = { ...form, plans: form.plans.filter(p => p.plan_date && p.plan_amount > 0) }
      if (isEdit.value) data.id = editId.value
      const r = await request.post(isEdit.value ? '/contract/update' : '/contract/add', data)
      if (r.code === 200) { ElMessage.success(isEdit.value ? '修改成功' : '创建成功'); formVisible.value = false; fetchList() }
      else { ElMessage.error(r.message||'保存失败') }
    } catch { ElMessage.error('保存失败') }
    finally { saveLoading.value = false }
  })
}

const handleExport = async () => {
  exportLoading.value = true
  try {
    const blob = await request.post('/contract/export', { ...searchForm }, { responseType: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '合同列表.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  } catch { ElMessage.error('导出失败') }
  finally { exportLoading.value = false }
}

// 快速回款
const openQuickPay = async (row) => {
  quickPayContract.value = row
  const today = new Date().toISOString().slice(0, 10)
  Object.assign(quickPayForm, { plan_id: null, pay_date: today, pay_amount: 0, pay_method: '', remark: '' })
  quickPayPlans.value = []
  try {
    const r = await request.get(`/contract/detail/${row.id}`)
    if (r.code === 200 && r.data.plans) {
      quickPayPlans.value = r.data.plans.filter(p => p.status !== 'completed')
    }
  } catch { /* 加载计划失败不影响回款 */ }
  quickPayVisible.value = true
}
const onPlanChange = (planId) => {
  if (!planId) { quickPayForm.pay_amount = 0; return }
  const plan = quickPayPlans.value.find(p => p.id === planId)
  if (plan) { quickPayForm.pay_amount = Math.max(0, (plan.plan_amount || 0) - (plan.paid_amount || 0)) }
}
const submitQuickPay = async () => {
  if (!quickPayFormRef.value) return
  await quickPayFormRef.value.validate(async (valid) => {
    if (!valid) return
    quickPayLoading.value = true
    try {
      const r = await request.post('/contract/payment/add', { contract_id: quickPayContract.value.id, ...quickPayForm })
      if (r.code === 200) { ElMessage.success('回款登记成功'); quickPayVisible.value = false; fetchList() }
      else { ElMessage.error(r.message || '登记失败') }
    } catch { ElMessage.error('登记失败') }
    finally { quickPayLoading.value = false }
  })
}
const resetQuickPay = () => {
  Object.assign(quickPayForm, { plan_id: null, pay_date: '', pay_amount: 0, pay_method: '', remark: '' })
  quickPayPlans.value = []
  quickPayContract.value = null
}

// 审批操作
const handleApprove = (row) => {
  ElMessageBox.confirm('确定通过该合同的审批？', '审批确认', {
    confirmButtonText: '确定通过',
    cancelButtonText: '取消',
    type: 'success'
  }).then(async () => {
    try {
      const r = await request.post('/contract/approve', { id: row.id, approval_status: 2 })
      if (r.code === 200) { ElMessage.success('审批通过'); fetchList() }
    } catch { ElMessage.error('审批失败') }
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
      const r = await request.post('/contract/approve', { id: row.id, approval_status: 3, approval_remark: value.trim() })
      if (r.code === 200) { ElMessage.success('已拒绝'); fetchList() }
    } catch { ElMessage.error('操作失败') }
  }).catch(() => {})
}

// 提交审批
const handleSubmitApproval = (row) => {
  ElMessageBox.confirm(`确定提交合同"${row.contract_no}"进行审批？`, '提交审批', {
    confirmButtonText: '确定提交',
    cancelButtonText: '取消',
    type: 'info'
  }).then(async () => {
    try {
      const res = await request.post('/approval/submit', { business_type: 'contract', business_id: row.id })
      if (res.code === 200) { ElMessage.success('已提交审批'); fetchList() }
    } catch (error) { console.error('提交审批失败:', error) }
  }).catch(() => {})
}

// 撤回审批
const handleWithdrawApproval = (row) => {
  ElMessageBox.confirm(`确定撤回合同"${row.contract_no}"的审批？`, '撤回审批', {
    confirmButtonText: '确定撤回',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      const res = await request.delete(`/approval/withdraw/contract/${row.id}`)
      if (res.code === 200) { ElMessage.success('审批已撤回'); fetchList() }
    } catch (error) { console.error('撤回审批失败:', error) }
  }).catch(() => {})
}

onMounted(() => {
  fetchList()
  fetchCustomers()
  fetchOpportunities()
  // 首页快捷按钮 ?action=add 或从商机跳转过来
  if (route.query.action === 'add' && !route.query.customer_id) {
    handleCreate()
  } else if (route.query.customer_id) {
    const cid = parseInt(route.query.customer_id)
    const oid = route.query.opportunity_id ? parseInt(route.query.opportunity_id) : null
    const cname = route.query.customer_name || ''
    form.customer_id = cid
    form.opportunity_id = oid
    if (cname && !customerOptions.value.find(c => c.id === cid)) {
      customerOptions.value.push({ id: cid, company_name: cname })
    }
    formVisible.value = true
  }
})
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.search-card { margin-bottom: var(--space-4); }
.search-card .el-form-item { margin-bottom: 0; }
.toolbar { margin-bottom: var(--space-4); }
.pagination { display: flex; justify-content: flex-end; margin-top: var(--space-5); }
/* P0-3: 逾期回款行高亮 */
:deep(.overdue-payment-row) { background-color: var(--color-danger-bg) !important; }
:deep(.overdue-payment-row):hover { background-color: rgba(255, 69, 58, 0.12) !important; }
:deep(.overdue-payment-row) td { border-bottom-color: rgba(255, 69, 58, 0.2) !important; }
</style>
