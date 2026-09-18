<template>
  <div class="page-container">
    <div class="page-header">
      <h2>审批规则配置</h2>
      <p class="page-desc">按业务金额阈值配置审批人矩阵（经理 / 指定角色 roleCode / 指定用户）</p>
    </div>
    <el-card>
      <div class="toolbar">
        <el-select v-model="filterType" placeholder="全部业务类型" clearable style="width:180px" @change="fetchList">
          <el-option v-for="t in typeOptions" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
        <el-button type="primary" :icon="Plus" @click="handleAdd">新增规则</el-button>
      </div>
      <StateWrapper
        :loading="loading"
        :error="errorMsg"
        :empty="!loading && !errorMsg && tableData.length === 0"
        empty-text="暂无审批规则"
        @retry="fetchList">
        <template #loading><TableSkeleton :rows="6" :cols="7" /></template>
        <el-table :data="tableData" stripe border>
          <el-table-column prop="business_type" label="业务类型" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="typeTagMap[row.business_type]" size="small">{{ typeNameMap[row.business_type] }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="金额区间" min-width="180">
            <template #default="{ row }">¥{{ fmt(row.min_amount) }} ~ {{ row.max_amount != null ? '¥' + fmt(row.max_amount) : '无上限' }}</template>
          </el-table-column>
          <el-table-column label="审批人类型" width="120" align="center">
            <template #default="{ row }">{{ approverTypeMap[row.approver_type] }}</template>
          </el-table-column>
          <el-table-column prop="approver_name" label="审批人/角色" min-width="140" show-overflow-tooltip />
          <el-table-column label="优先级" width="80" align="center" prop="priority" />
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '禁用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" link :icon="Edit" @click="handleEdit(row)">编辑</el-button>
              <el-button type="danger" link :icon="Delete" @click="handleDelete(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </StateWrapper>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑规则' : '新增规则'" width="560px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="业务类型" prop="business_type">
          <el-select v-model="form.business_type" style="width:100%">
            <el-option v-for="t in typeOptions" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="金额下限" prop="min_amount">
          <el-input-number v-model="form.min_amount" :min="0" :precision="2" :step="100" style="width:100%" />
        </el-form-item>
        <el-form-item label="金额上限" prop="max_amount">
          <el-input-number v-model="form.max_amount" :min="0" :precision="2" :step="100" style="width:100%" placeholder="留空表示无上限" />
          <span class="field-hint">留空表示无上限（区间左闭右开 [min, max)）</span>
        </el-form-item>
        <el-form-item label="审批人类型" prop="approver_type">
          <el-select v-model="form.approver_type" style="width:100%" @change="onApproverTypeChange">
            <el-option label="上级主管（经理）" value="manager" />
            <el-option label="指定角色（roleCode）" value="role" />
            <el-option label="指定用户" value="user" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.approver_type === 'role'" label="角色" prop="approver_ref">
          <el-select v-model="form.approver_ref" placeholder="选择角色（按 roleCode）" style="width:100%">
            <el-option v-for="r in roleList" :key="r.id" :label="r.name" :value="r.role_code || r.code" />
          </el-select>
        </el-form-item>
        <el-form-item v-else-if="form.approver_type === 'user'" label="用户" prop="approver_ref">
          <el-select v-model="form.approver_ref" placeholder="选择用户" filterable style="width:100%">
            <el-option v-for="u in userList" :key="u.id" :label="u.real_name" :value="String(u.id)" />
          </el-select>
        </el-form-item>
        <el-form-item v-else label="审批人">
          <span class="field-hint">按提交人上级主管动态解析（无需选择）</span>
        </el-form-item>
        <el-form-item label="优先级">
          <el-input-number v-model="form.priority" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reportError } from '@/utils/error'
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { getApprovalRules, createApprovalRule, updateApprovalRule, deleteApprovalRule } from '@/api/approval'
import { getRoleList } from '@/api/system'
import { getSalesUsers } from '@/api/customer'
import StateWrapper from '@/components/common/StateWrapper.vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'

const typeOptions = [
  { value: 'quote', label: '报价' },
  { value: 'contract', label: '合同' },
  { value: 'purchase', label: '采购' },
  { value: 'discount', label: '折扣' }
]
const typeNameMap = { quote: '报价', contract: '合同', purchase: '采购', discount: '折扣' }
const typeTagMap = { quote: '', contract: 'success', purchase: 'warning', discount: 'danger' }
const approverTypeMap = { manager: '上级主管', role: '指定角色', user: '指定用户' }

const loading = ref(true)
const errorMsg = ref('')
const tableData = ref([])
const filterType = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const formRef = ref(null)
const submitLoading = ref(false)
const roleList = ref([])
const userList = ref([])

const blankForm = () => ({
  business_type: 'contract', min_amount: 0, max_amount: null,
  approver_type: 'manager', approver_ref: '', priority: 0, description: ''
})
const form = reactive(blankForm())

const rules = {
  business_type: [{ required: true, message: '请选择业务类型', trigger: 'change' }],
  min_amount: [{ required: true, message: '请输入金额下限', trigger: 'blur' }],
  approver_type: [{ required: true, message: '请选择审批人类型', trigger: 'change' }]
}

const fmt = (v) => Number(v || 0).toLocaleString()

const fetchList = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await getApprovalRules(filterType.value || undefined)
    if (res.code === 200) tableData.value = res.data
    else { errorMsg.value = res.message || '加载规则失败'; reportError('[ruleConfig] 获取规则失败:', res.message) }
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || '加载规则失败'
    reportError('[ruleConfig] 获取规则失败:', e)
  } finally { loading.value = false }
}

const fetchMeta = async () => {
  try {
    const [uRes, rRes] = await Promise.all([getSalesUsers(), getRoleList({ page: 1, pageSize: 100 })])
    if (uRes.code === 200) userList.value = uRes.data
    if (rRes.code === 200) roleList.value = rRes.data.list || []
  } catch (e) { reportError('[ruleConfig] 获取元数据失败:', e) }
}

const onApproverTypeChange = () => { form.approver_ref = '' }

const handleAdd = () => {
  isEdit.value = false; editId.value = null
  Object.assign(form, blankForm())
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true; editId.value = row.id
  Object.assign(form, {
    business_type: row.business_type,
    min_amount: Number(row.min_amount),
    max_amount: row.max_amount != null ? Number(row.max_amount) : null,
    approver_type: row.approver_type,
    approver_ref: row.approver_type === 'user' ? String(row.id ? row.approver_ref : '') : (row.approver_ref || ''),
    priority: row.priority || 0,
    description: row.description || ''
  })
  // role/user 类型回填 approver_ref
  if (row.approver_type !== 'manager') form.approver_ref = String(row.approver_ref ?? '')
  dialogVisible.value = true
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除规则「${typeNameMap[row.business_type]} ¥${fmt(row.min_amount)}~${row.max_amount != null ? fmt(row.max_amount) : '∞'}」吗？`, '提示', { type: 'warning' })
    .then(async () => {
      const res = await deleteApprovalRule(row.id)
      if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
    }).catch(e => reportError('[ruleConfig] 删除规则失败:', e))
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    if (form.approver_type !== 'manager' && !form.approver_ref) { ElMessage.warning('请选择审批人/角色'); return }
    submitLoading.value = true
    try {
      const payload = {
        business_type: form.business_type,
        min_amount: form.min_amount,
        max_amount: form.max_amount,
        approver_type: form.approver_type,
        approver_ref: form.approver_type === 'manager' ? '' : String(form.approver_ref),
        priority: form.priority,
        description: form.description
      }
      const res = isEdit.value ? await updateApprovalRule(editId.value, payload) : await createApprovalRule(payload)
      if (res.code === 200) { ElMessage.success(isEdit.value ? '修改成功' : '新增成功'); dialogVisible.value = false; fetchList() }
    } finally { submitLoading.value = false }
  })
}

onMounted(() => { fetchList(); fetchMeta() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.page-desc { margin: var(--space-1) 0 0; font-size: 13px; color: var(--color-text-tertiary); }
.toolbar { margin-bottom: var(--space-4); display: flex; gap: 8px; }
.field-hint { font-size: 12px; color: var(--color-text-tertiary); margin-left: 8px; }
</style>
