<template>
  <div class="page-container">
    <div class="page-header">
      <h2>分配规则管理</h2>
      <p class="page-desc">配置新客户的自动分配规则，支持轮询、按来源、按区域分配</p>
    </div>

    <el-card style="margin-bottom:16px">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon> 新增规则
      </el-button>
    </el-card>

    <el-card>
      <el-table :data="rules" border stripe v-loading="loading">
        <el-table-column prop="rule_name" label="规则名称" min-width="150" />
        <el-table-column prop="assign_type" label="分配方式" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="{ round_robin: 'primary', by_source: 'success', by_region: 'warning' }[row.assign_type]">
              {{ { round_robin: '轮询', by_source: '按来源', by_region: '按区域' }[row.assign_type] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="source_value" label="来源值" width="120">
          <template #default="{ row }">{{ row.source_value || '-' }}</template>
        </el-table-column>
        <el-table-column prop="region_value" label="区域值" width="120">
          <template #default="{ row }">{{ row.region_value || '-' }}</template>
        </el-table-column>
        <el-table-column label="分配用户" min-width="200">
          <template #default="{ row }">
            <el-tag v-for="uid in parseUserIds(row.user_ids)" :key="uid" size="small" style="margin:2px">
              {{ getUserName(uid) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="priority" label="优先级" width="80" align="center" />
        <el-table-column prop="is_active" label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.is_active" :active-value="1" :inactive-value="0" @change="toggleActive(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-popconfirm title="确定删除该规则？" @confirm="handleDelete(row)">
              <template #reference><el-button type="danger" link>删除</el-button></template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑规则' : '新增规则'" width="500px" @closed="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules2" label-width="100px">
        <el-form-item label="规则名称" prop="rule_name">
          <el-input v-model="form.rule_name" placeholder="如：展会来源分配给张三" />
        </el-form-item>
        <el-form-item label="分配方式" prop="assign_type">
          <el-select v-model="form.assign_type" style="width:100%">
            <el-option label="轮询（均匀分配）" value="round_robin" />
            <el-option label="按来源分配" value="by_source" />
            <el-option label="按区域分配" value="by_region" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.assign_type === 'by_source'" label="来源值" prop="source_value">
          <el-select v-model="form.source_value" filterable allow-create style="width:100%">
            <el-option v-for="s in sourceOptions" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.assign_type === 'by_region'" label="区域值" prop="region_value">
          <el-input v-model="form.region_value" placeholder="如：北京、上海" />
        </el-form-item>
        <el-form-item label="分配用户" prop="user_ids">
          <el-select v-model="form.user_ids" multiple style="width:100%">
            <el-option v-for="u in salesUsers" :key="u.id" :label="u.real_name" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-input-number v-model="form.priority" :min="0" :max="999" />
          <span style="margin-left:8px;color:#909399;font-size:12px">越大越优先</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saveLoading" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { ALL_SOURCE_VALUES } from '@/constants/source'

defineOptions({ name: 'AssignRules' })

const loading = ref(false)
const rules = ref([])
const salesUsers = ref([])
const sourceOptions = ALL_SOURCE_VALUES

const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const saveLoading = ref(false)
const formRef = ref(null)

const form = reactive({
  rule_name: '',
  assign_type: 'round_robin',
  source_value: '',
  region_value: '',
  user_ids: [],
  priority: 0
})

const rules2 = {
  rule_name: [{ required: true, message: '请输入规则名称', trigger: 'blur' }],
  assign_type: [{ required: true, message: '请选择分配方式', trigger: 'change' }],
  user_ids: [{ required: true, type: 'array', min: 1, message: '请选择至少一个用户', trigger: 'change' }]
}

const parseUserIds = (val) => {
  try { return typeof val === 'string' ? JSON.parse(val) : val || [] } catch { return [] }
}

const getUserName = (id) => {
  const u = salesUsers.value.find(u => u.id === id)
  return u ? u.real_name : `ID:${id}`
}

const fetchRules = async () => {
  loading.value = true
  try {
    const r = await request.get('/customer/assign-rules')
    if (r.code === 200) rules.value = r.data
  } finally { loading.value = false }
}

const fetchSalesUsers = async () => {
  try {
    const r = await request.get('/customer/sales-users')
    if (r.code === 200) salesUsers.value = r.data
  } catch {}
}

const handleAdd = () => {
  isEdit.value = false; editId.value = null
  Object.assign(form, { rule_name: '', assign_type: 'round_robin', source_value: '', region_value: '', user_ids: [], priority: 0 })
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true; editId.value = row.id
  Object.assign(form, {
    rule_name: row.rule_name,
    assign_type: row.assign_type,
    source_value: row.source_value || '',
    region_value: row.region_value || '',
    user_ids: parseUserIds(row.user_ids),
    priority: row.priority || 0
  })
  dialogVisible.value = true
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    saveLoading.value = true
    try {
      const url = isEdit.value ? '/customer/assign-rules/update' : '/customer/assign-rules/add'
      const data = { ...form }
      if (isEdit.value) data.id = editId.value
      const r = await request.post(url, data)
      if (r.code === 200) {
        ElMessage.success(isEdit.value ? '更新成功' : '添加成功')
        dialogVisible.value = false
        fetchRules()
      }
    } finally { saveLoading.value = false }
  })
}

const toggleActive = async (row) => {
  try {
    const r = await request.post('/customer/assign-rules/update', { id: row.id, is_active: row.is_active })
    if (r.code !== 200) { row.is_active = row.is_active ? 0 : 1 }
  } catch { row.is_active = row.is_active ? 0 : 1 }
}

const handleDelete = async (row) => {
  const r = await request.post('/customer/assign-rules/delete', { id: row.id })
  if (r.code === 200) { ElMessage.success('删除成功'); fetchRules() }
}

const resetForm = () => {
  formRef.value?.resetFields()
}

onMounted(() => { fetchRules(); fetchSalesUsers() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.page-desc { margin: var(--space-1) 0 0; font-size: 13px; color: var(--color-text-tertiary); }
</style>
