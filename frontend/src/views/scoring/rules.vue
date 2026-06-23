<template>
  <div class="page-container">
    <div class="page-header">
      <h2>评分规则</h2>
      <p class="page-desc">管理线索评分规则，系统根据规则自动计算客户评分</p>
    </div>
    <el-card>
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="handleAdd">新增规则</el-button>
        <el-button :icon="Refresh" :loading="batchLoading" @click="handleBatchCalculate">重新计算所有评分</el-button>
      </div>
      <el-table v-loading="loading" :data="tableData" stripe border>
        <el-table-column prop="name" label="规则名称" min-width="150" />
        <el-table-column prop="condition_type" label="类型" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="typeTagMap[row.condition_type]" size="small">{{ typeNameMap[row.condition_type] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="条件" min-width="200">
          <template #default="{ row }">
            <span>{{ formatCondition(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="score" label="分数" width="80" align="center">
          <template #default="{ row }">
            <span :style="{ color: row.score > 0 ? '#67C23A' : '#F56C6C', fontWeight: 600 }">{{ row.score > 0 ? '+' : '' }}{{ row.score }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.status" :active-value="1" :inactive-value="0" @change="handleToggleStatus(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button type="primary" link :icon="Edit" @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link :icon="Delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑规则' : '新增规则'" width="550px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="规则名称" prop="name">
          <el-input v-model="form.name" placeholder="如：高价值客户" maxlength="50" />
        </el-form-item>
        <el-form-item label="条件类型" prop="condition_type">
          <el-select v-model="form.condition_type" style="width:100%" @change="handleTypeChange">
            <el-option label="来源" value="source" />
            <el-option label="行为" value="action" />
            <el-option label="互动" value="interaction" />
          </el-select>
        </el-form-item>
        <el-form-item label="条件字段" prop="condition_field">
          <el-select v-model="form.condition_field" style="width:100%">
            <el-option v-for="f in fieldOptions" :key="f.value" :label="f.label" :value="f.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="运算符">
          <el-select v-model="form.condition_operator" style="width:100%">
            <el-option label="等于" value="eq" />
            <el-option label="大于" value="gt" />
            <el-option label="小于" value="lt" />
            <el-option label="包含" value="contains" />
          </el-select>
        </el-form-item>
        <el-form-item label="条件值">
          <el-input v-model="form.condition_value" placeholder="如：展会、5、7" />
        </el-form-item>
        <el-form-item label="分数" prop="score">
          <el-input-number v-model="form.score" :min="-100" :max="100" style="width:100%" />
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
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Refresh } from '@element-plus/icons-vue'
import { getScoringRules, saveScoringRule, batchCalculateScore, deleteScoringRule, updateScoringRule } from '@/api/scoring'
import request from '@/utils/request'

const typeNameMap = { source: '来源', action: '行为', interaction: '互动' }
const typeTagMap = { source: '', action: 'warning', interaction: 'success' }

const fieldMap = {
  source: [
    { label: '客户来源', value: 'source' }
  ],
  action: [
    { label: '跟进次数', value: 'followup_count' },
    { label: '报价次数', value: 'quote_count' },
    { label: '合同数量', value: 'contract_count' }
  ],
  interaction: [
    { label: '最近跟进天数', value: 'last_followup_days' }
  ]
}

const operatorMap = { eq: '等于', gt: '大于', lt: '小于', contains: '包含' }

const loading = ref(false)
const tableData = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const formRef = ref(null)
const submitLoading = ref(false)
const batchLoading = ref(false)

const form = reactive({
  name: '', condition_type: 'source', condition_field: 'source',
  condition_operator: 'eq', condition_value: '', score: 10
})

const rules = {
  name: [{ required: true, message: '请输入规则名称', trigger: 'blur' }],
  condition_type: [{ required: true, message: '请选择条件类型', trigger: 'change' }],
  score: [{ required: true, message: '请输入分数', trigger: 'blur' }]
}

const fieldOptions = computed(() => fieldMap[form.condition_type] || [])

const handleTypeChange = () => {
  const options = fieldMap[form.condition_type]
  form.condition_field = options.length > 0 ? options[0].value : ''
}

const formatCondition = (row) => {
  const fieldLabel = Object.values(fieldMap).flat().find(f => f.value === row.condition_field)?.label || row.condition_field
  const opLabel = operatorMap[row.condition_operator] || row.condition_operator
  return `${fieldLabel} ${opLabel} ${row.condition_value || '-'}`
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getScoringRules()
    if (res.code === 200) tableData.value = res.data
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const handleAdd = () => {
  isEdit.value = false
  editId.value = null
  Object.assign(form, { name: '', condition_type: 'source', condition_field: 'source', condition_operator: 'eq', condition_value: '', score: 10 })
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  editId.value = row.id
  Object.assign(form, {
    name: row.name, condition_type: row.condition_type, condition_field: row.condition_field,
    condition_operator: row.condition_operator, condition_value: row.condition_value, score: row.score
  })
  dialogVisible.value = true
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除规则 "${row.name}" 吗？`, '提示', { type: 'warning' }).then(async () => {
    const res = await deleteScoringRule(row.id)
    if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
  }).catch(() => {})
}

const handleToggleStatus = async (row) => {
  try {
    await updateScoringRule(row.id, { status: row.status })
  } catch (e) { row.status = row.status === 1 ? 0 : 1 }
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    submitLoading.value = true
    try {
      let res
      if (isEdit.value) {
        res = await updateScoringRule(editId.value, form)
      } else {
        res = await saveScoringRule(form)
      }
      if (res.code === 200) {
        ElMessage.success(isEdit.value ? '修改成功' : '新增成功')
        dialogVisible.value = false
        fetchList()
      }
    } finally { submitLoading.value = false }
  })
}

const handleBatchCalculate = () => {
  ElMessageBox.confirm('将重新计算所有客户的评分，可能需要一些时间，确定继续？', '提示', { type: 'warning' }).then(async () => {
    batchLoading.value = true
    try {
      const res = await batchCalculateScore()
      if (res.code === 200) ElMessage.success(`评分计算完成，处理 ${res.data.processed} 个客户`)
    } finally { batchLoading.value = false }
  }).catch(() => {})
}

onMounted(() => { fetchList() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.page-desc { margin: var(--space-1) 0 0; font-size: 13px; color: var(--color-text-tertiary); }
.toolbar { margin-bottom: var(--space-4); display: flex; gap: 12px; }
</style>
