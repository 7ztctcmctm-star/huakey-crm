<template>
  <div class="page-container">
    <div class="page-header">
      <h2>审批流程</h2>
      <p class="page-desc">配置报价、合同、采购等业务的审批流程</p>
    </div>
    <el-card>
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="handleAdd">新增流程</el-button>
      </div>
      <el-table v-loading="loading" :data="tableData" stripe border>
        <el-table-column prop="name" label="流程名称" min-width="150" />
        <el-table-column prop="type" label="类型" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="typeTagMap[row.type]" size="small">{{ typeNameMap[row.type] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="step_count" label="步骤数" width="80" align="center" />
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.status" :active-value="1" :inactive-value="0" @change="handleToggleStatus(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button type="primary" link :icon="View" @click="handleView(row)">查看</el-button>
            <el-button type="primary" link :icon="Edit" @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link :icon="Delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑流程' : '新增流程'" width="650px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="流程名称" prop="name">
          <el-input v-model="form.name" placeholder="如：报价审批流程" maxlength="50" />
        </el-form-item>
        <el-form-item label="流程类型" prop="type">
          <el-select v-model="form.type" style="width:100%">
            <el-option label="报价审批" value="quote" />
            <el-option label="合同审批" value="contract" />
            <el-option label="采购审批" value="purchase" />
            <el-option label="折扣审批" value="discount" />
            <el-option label="折扣审批" value="discount" />
          </el-select>
        </el-form-item>
        <el-form-item label="流程描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="流程说明（可选）" />
        </el-form-item>
        <el-form-item label="审批步骤" required>
          <div class="steps-list">
            <div v-for="(step, idx) in form.steps" :key="idx" class="step-item">
              <div class="step-header">
                <span class="step-order">步骤 {{ idx + 1 }}</span>
                <el-button v-if="form.steps.length > 1" type="danger" link :icon="Delete" @click="form.steps.splice(idx, 1)" />
              </div>
              <el-row :gutter="12">
                <el-col :span="8">
                  <el-input v-model="step.step_name" placeholder="步骤名称" />
                </el-col>
                <el-col :span="8">
                  <el-select v-model="step.approver_type" placeholder="审批人类型" style="width:100%">
                    <el-option label="指定用户" value="user" />
                    <el-option label="指定角色" value="role" />
                    <el-option label="上级主管" value="manager" />
                  </el-select>
                </el-col>
                <el-col :span="8">
                  <el-select v-if="step.approver_type === 'user'" v-model="step.approver_id" placeholder="选择用户" filterable style="width:100%">
                    <el-option v-for="u in userList" :key="u.id" :label="u.real_name" :value="u.id" />
                  </el-select>
                  <el-select v-else-if="step.approver_type === 'role'" v-model="step.approver_id" placeholder="选择角色" style="width:100%">
                    <el-option v-for="r in roleList" :key="r.id" :label="r.name" :value="r.id" />
                  </el-select>
                  <span v-else class="step-hint">自动获取上级</span>
                </el-col>
              </el-row>
            </div>
            <el-button :icon="Plus" @click="addStep">添加步骤</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 查看弹窗 -->
    <el-dialog v-model="viewVisible" title="流程详情" width="500px">
      <div v-if="viewData" class="view-content">
        <div class="view-item"><strong>名称：</strong>{{ viewData.name }}</div>
        <div class="view-item"><strong>类型：</strong>{{ typeNameMap[viewData.type] }}</div>
        <div class="view-item"><strong>描述：</strong>{{ viewData.description || '-' }}</div>
        <div class="view-item"><strong>状态：</strong>{{ viewData.status === 1 ? '启用' : '禁用' }}</div>
        <div class="view-item"><strong>步骤：</strong></div>
        <el-steps :active="-1" direction="vertical" style="margin-top:12px">
          <el-step v-for="s in viewData.steps" :key="s.id" :title="s.step_name" :description="`审批人类型：${approverTypeMap[s.approver_type]}`" />
        </el-steps>
      </div>
      <template #footer>
        <el-button @click="viewVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, View } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { getWorkflows, updateWorkflow, saveApprovalWorkflow, deleteApprovalWorkflow } from '@/api/approval'
import { getSalesUsers } from '@/api/customer'
import { getRoleList } from '@/api/system'

const typeNameMap = { quote: '报价', contract: '合同', purchase: '采购', discount: '折扣' }
const typeTagMap = { quote: '', contract: 'success', purchase: 'warning', discount: 'danger' }
const approverTypeMap = { user: '指定用户', role: '指定角色', manager: '上级主管' }

const loading = ref(false)
const tableData = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const formRef = ref(null)
const submitLoading = ref(false)
const userList = ref([])
const roleList = ref([])

const form = reactive({
  name: '', type: 'quote', description: '',
  steps: [{ step_name: '审批', approver_type: 'manager', approver_id: null, is_required: 1 }]
})

const rules = {
  name: [{ required: true, message: '请输入流程名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择流程类型', trigger: 'change' }]
}

const viewVisible = ref(false)
const viewData = ref(null)

const addStep = () => {
  form.steps.push({ step_name: '审批', approver_type: 'manager', approver_id: null, is_required: 1 })
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getWorkflows()
    if (res.code === 200) tableData.value = res.data
  } catch (e) { console.error('[workflow] 获取流程列表失败:', e) }
  finally { loading.value = false }
}

const fetchUsersAndRoles = async () => {
  try {
    const [uRes, rRes] = await Promise.all([
      getSalesUsers(),
      getRoleList({ page: 1, pageSize: 100 })
    ])
    if (uRes.code === 200) userList.value = uRes.data
    if (rRes.code === 200) roleList.value = rRes.data.list || []
  } catch (e) { console.error('[workflow] 获取用户和角色失败:', e) }
}

const handleAdd = () => {
  isEdit.value = false; editId.value = null
  Object.assign(form, {
    name: '', type: 'quote', description: '',
    steps: [{ step_name: '审批', approver_type: 'manager', approver_id: null, is_required: 1 }]
  })
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true; editId.value = row.id
  Object.assign(form, {
    name: row.name, type: row.type, description: row.description || '',
    steps: row.steps.map(s => ({ step_name: s.step_name, approver_type: s.approver_type, approver_id: s.approver_id, is_required: s.is_required }))
  })
  if (form.steps.length === 0) form.steps.push({ step_name: '审批', approver_type: 'manager', approver_id: null, is_required: 1 })
  dialogVisible.value = true
}

const handleView = (row) => { viewData.value = row; viewVisible.value = true }

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除流程 "${row.name}" 吗？`, '提示', { type: 'warning' }).then(async () => {
    const res = await deleteApprovalWorkflow(row.id)
    if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
  }).catch(e => console.error('[workflow] 删除流程失败:', e))
}

const handleToggleStatus = async (row) => {
  try { await updateWorkflow({ id: row.id, status: row.status }) }
  catch (e) { row.status = row.status === 1 ? 0 : 1 }
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    if (form.steps.length === 0) { ElMessage.warning('至少需要一个审批步骤'); return }
    for (const s of form.steps) {
      if (!s.step_name) { ElMessage.warning('请填写步骤名称'); return }
      if (s.approver_type !== 'manager' && !s.approver_id) { ElMessage.warning('请选择审批人'); return }
    }
    submitLoading.value = true
    try {
      let res
      if (isEdit.value) { res = await updateWorkflow({ id: editId.value, ...form }) }
      else { res = await saveApprovalWorkflow(form) }
      if (res.code === 200) { ElMessage.success(isEdit.value ? '修改成功' : '新增成功'); dialogVisible.value = false; fetchList() }
    } finally { submitLoading.value = false }
  })
}

onMounted(() => { fetchList(); fetchUsersAndRoles() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.page-desc { margin: var(--space-1) 0 0; font-size: 13px; color: var(--color-text-tertiary); }
.toolbar { margin-bottom: var(--space-4); }
.steps-list { display: flex; flex-direction: column; gap: 12px; }
.step-item { background: var(--color-bg-secondary); padding: 12px; border-radius: 8px; }
.step-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.step-order { font-size: 13px; font-weight: 600; color: var(--color-text-secondary); }
.step-hint { font-size: 13px; color: var(--color-text-tertiary); line-height: 32px; }
.view-content { font-size: 14px; }
.view-item { margin-bottom: 12px; }
</style>
