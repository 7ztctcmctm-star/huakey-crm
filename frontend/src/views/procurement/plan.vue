<template>
  <div class="page-container">
    <div class="page-header">
      <h2>采购计划</h2>
      <div>
        <el-button type="success" @click="handleAutoGenerate">自动生成</el-button>
        <el-button type="primary" :icon="Plus" @click="handleCreate">新建计划</el-button>
      </div>
    </div>

    <!-- 统计 -->
    <div class="stat-cards">
      <div class="stat-card" v-for="s in statCards" :key="s.key">
        <div class="stat-value">{{ s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </div>
    </div>

    <!-- 状态筛选 -->
    <div class="status-tabs">
      <el-check-tag :checked="!search.status" @change="search.status='';fetchList()">全部</el-check-tag>
      <el-check-tag v-for="s in statusList" :key="s.value" :checked="search.status===s.value" @change="search.status=s.value;fetchList()">{{ s.label }}</el-check-tag>
    </div>

    <!-- 列表 -->
    <el-card shadow="never">
      <el-table :data="list" stripe border v-loading="loading">
        <el-table-column prop="plan_no" label="计划编号" width="160" />
        <el-table-column prop="name" label="计划名称" min-width="200" show-overflow-tooltip />
        <el-table-column prop="total_amount" label="总金额" width="120" align="right">
          <template #default="{ row }">¥{{ Number(row.total_amount).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90" align="center">
          <template #default="{ row }"><el-tag :type="statusTag[row.status]" size="small">{{ statusName[row.status] }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="create_by_name" label="创建人" width="90" />
        <el-table-column prop="create_time" label="创建时间" width="160" />
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="$router.push(`/procurement/plan/${row.id}`)">详情</el-button>
            <el-button v-if="row.status==='draft'" type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button v-if="row.status==='draft'" type="success" link @click="handleSubmit(row)">提交</el-button>
            <el-button v-if="row.status==='submitted'" type="warning" link @click="handleApprove(row)">批准</el-button>
            <el-button v-if="row.status==='draft'" type="danger" link @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" layout="total,prev,pager,next" @current-change="fetchList" /></div>
    </el-card>

    <!-- 创建/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑计划' : '新建采购计划'" width="800px" top="5vh">
      <el-form :model="form" label-width="80px">
        <el-form-item label="计划名称"><el-input v-model="form.name" placeholder="输入计划名称" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" placeholder="备注（可选）" /></el-form-item>
        <el-divider>计划明细</el-divider>
        <el-button size="small" type="primary" @click="addItem" style="margin-bottom:8px">添加产品</el-button>
        <el-table :data="form.items" border size="small">
          <el-table-column label="产品" min-width="160">
            <template #default="{ row }">
              <el-select v-model="row.product_id" filterable placeholder="选择产品" size="small" style="width:100%" @change="(v) => onProductChange(row, v)">
                <el-option v-for="p in productOptions" :key="p.id" :label="p.name" :value="p.id" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="供应商" width="140">
            <template #default="{ row }">
              <el-select v-model="row.supplier_id" filterable placeholder="选择供应商" size="small" clearable style="width:100%">
                <el-option v-for="s in supplierOptions" :key="s.id" :label="s.name" :value="s.id" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="数量" width="100">
            <template #default="{ row }"><el-input-number v-model="row.quantity" :min="1" size="small" controls-position="right" style="width:100%" /></template>
          </el-table-column>
          <el-table-column label="单价" width="110">
            <template #default="{ row }"><el-input-number v-model="row.unit_price" :min="0" :precision="2" size="small" controls-position="right" style="width:100%" /></template>
          </el-table-column>
          <el-table-column label="小计" width="100" align="right">
            <template #default="{ row }">¥{{ ((row.quantity || 0) * (row.unit_price || 0)).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="原因" width="120">
            <template #default="{ row }"><el-input v-model="row.reason" size="small" placeholder="采购原因" /></template>
          </el-table-column>
          <el-table-column label="" width="50">
            <template #default="{ $index }"><el-button type="danger" link size="small" @click="form.items.splice($index, 1)">删除</el-button></template>
          </el-table-column>
        </el-table>
        <div class="form-total">合计：¥{{ formTotal }}</div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible=false">取消</el-button>
        <el-button type="primary" :loading="saveLoading" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { getProcurementPlanList, createProcurementPlan, autoGeneratePlan, getProcurementStats, submitProcurementPlan, approveProcurementPlan, deleteProcurementPlan } from '@/api/procurementPlan'
import { getSupplierList } from '@/api/supplier'
import { getInventoryList } from '@/api/inventory'

const router = useRouter()
const statusName = { draft: '草稿', submitted: '待审批', approved: '已批准', ordered: '已下单', completed: '已完成', cancelled: '已取消' }
const statusTag = { draft: 'info', submitted: 'warning', approved: 'success', ordered: '', completed: 'success', cancelled: 'danger' }
const statusList = [{ value: 'draft', label: '草稿' }, { value: 'submitted', label: '待审批' }, { value: 'approved', label: '已批准' }]

const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const search = reactive({ status: '' })
const stats = ref({ total: 0, submitted: 0, approved: 0, ordered: 0 })

const statCards = computed(() => [
  { key: 'total', label: '计划总数', value: stats.value.total },
  { key: 'submitted', label: '待审批', value: stats.value.submitted },
  { key: 'approved', label: '已批准', value: stats.value.approved },
  { key: 'ordered', label: '已下单', value: stats.value.ordered }
])

const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const saveLoading = ref(false)
const productOptions = ref([])
const supplierOptions = ref([])
const form = reactive({ name: '', remark: '', items: [] })
const formTotal = computed(() => form.items.reduce((sum, i) => sum + (i.quantity || 0) * (i.unit_price || 0), 0).toFixed(2))

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getProcurementPlanList({ page: page.value, page_size: pageSize.value, status: search.status })
    if (res.code === 200) { list.value = res.data.list; total.value = res.data.total }
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const fetchStats = async () => {
  try { const res = await getProcurementStats(); if (res.code === 200) stats.value = res.data } catch (e) { /* */ }
}

const fetchOptions = async () => {
  try {
    const [pRes, sRes] = await Promise.all([
      getInventoryList({ page_size: 200 }),
      getSupplierList({ page: 1, pageSize: 200 })
    ])
    if (pRes.code === 200) productOptions.value = pRes.data.list
    if (sRes.code === 200) supplierOptions.value = sRes.data.list || sRes.data
  } catch (e) { /* */ }
}

const addItem = () => { form.items.push({ product_id: null, supplier_id: null, quantity: 1, unit_price: 0, reason: '' }) }
const onProductChange = (row, id) => { const p = productOptions.value.find(p => p.id === id); if (p) row.unit_price = p.cost_price || 0 }

const handleCreate = () => {
  isEdit.value = false; editId.value = null
  Object.assign(form, { name: '', remark: '', items: [{ product_id: null, supplier_id: null, quantity: 1, unit_price: 0, reason: '' }] })
  dialogVisible.value = true
}

const handleEdit = (row) => {
  router.push(`/procurement/plan/${row.id}`)
}

const handleSave = async () => {
  if (!form.name) { ElMessage.warning('请输入计划名称'); return }
  if (form.items.length === 0) { ElMessage.warning('请添加计划明细'); return }
  saveLoading.value = true
  try {
    const res = await createProcurementPlan(form)
    if (res.code === 200) { ElMessage.success('创建成功'); dialogVisible.value = false; fetchList(); fetchStats() }
  } finally { saveLoading.value = false }
}

const handleSubmit = (row) => {
  ElMessageBox.confirm(`确定提交计划"${row.name}"审批？`, '确认', { type: 'info' }).then(async () => {
    const res = await submitProcurementPlan(row.id)
    if (res.code === 200) { ElMessage.success('已提交'); fetchList(); fetchStats() }
  }).catch(() => {})
}

const handleApprove = (row) => {
  ElMessageBox.confirm(`确定批准计划"${row.name}"？`, '确认', { type: 'success' }).then(async () => {
    const res = await approveProcurementPlan(row.id)
    if (res.code === 200) { ElMessage.success('已批准'); fetchList(); fetchStats() }
  }).catch(() => {})
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除计划"${row.name}"？`, '提示', { type: 'warning' }).then(async () => {
    const res = await deleteProcurementPlan(row.id)
    if (res.code === 200) { ElMessage.success('已删除'); fetchList(); fetchStats() }
  }).catch(() => {})
}

const handleAutoGenerate = () => {
  ElMessageBox.confirm('将根据库存偏低产品自动生成采购计划，确定继续？', '自动生成', { type: 'info' }).then(async () => {
    const res = await autoGeneratePlan()
    if (res.code === 200 && res.data) {
      ElMessage.success(`已生成计划 ${res.data.plan_no}，包含 ${res.data.item_count} 个产品`)
      fetchList(); fetchStats()
    } else { ElMessage.info(res.message) }
  }).catch(() => {})
}

onMounted(() => { fetchList(); fetchStats(); fetchOptions() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: var(--space-4); }
.stat-card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--color-text); }
.stat-label { font-size: 13px; color: var(--color-text-tertiary); margin-top: 4px; }
.status-tabs { display: flex; gap: 8px; margin-bottom: var(--space-4); }
.form-total { text-align: right; margin-top: 12px; font-size: 16px; font-weight: 600; color: var(--color-text); }
.pagination { display: flex; justify-content: flex-end; margin-top: var(--space-4); }
</style>
