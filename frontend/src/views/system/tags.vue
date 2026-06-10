<template>
  <div class="page-container">
    <div class="page-header"><h2>标签管理</h2></div>
    <el-card>
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="handleAdd">新增标签</el-button>
      </div>
      <el-table v-loading="loading" :data="tableData" stripe border>
        <el-table-column prop="name" label="标签名称" min-width="180">
          <template #default="{ row }">
            <el-tag :color="row.color" style="color:#fff;border:none;">{{ row.name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="color" label="颜色" width="120" align="center">
          <template #default="{ row }">
            <span :style="{ display: 'inline-block', width: '20px', height: '20px', borderRadius: '4px', backgroundColor: row.color, verticalAlign: 'middle' }"></span>
            <span style="margin-left:8px;font-size:12px;color:#86868b;">{{ row.color }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="sort" label="排序" width="80" align="center" />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button type="primary" link :icon="Edit" @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link :icon="Delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑标签' : '新增标签'" width="450px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="标签名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入标签名称" maxlength="30" />
        </el-form-item>
        <el-form-item label="标签颜色">
          <el-color-picker v-model="form.color" :predefine="presetColors" />
          <span style="margin-left:12px;font-size:13px;color:#86868b;">{{ form.color }}</span>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" style="width:100%" />
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
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import request from '@/utils/request'

const presetColors = [
  '#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399',
  '#1a56db', '#059669', '#d97706', '#dc2626', '#7c3aed',
  '#0891b2', '#be185d', '#4f46e5', '#0d9488', '#ea580c'
]

const loading = ref(false)
const tableData = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const editId = ref(null)
const submitLoading = ref(false)
const form = reactive({ name: '', color: '#409EFF', sort: 0 })
const rules = { name: [{ required: true, message: '请输入标签名称', trigger: 'blur' }] }

const fetchList = async () => {
  loading.value = true
  try {
    const res = await request.get('/tag/list')
    if (res.code === 200) tableData.value = res.data
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const handleAdd = () => {
  isEdit.value = false
  editId.value = null
  Object.assign(form, { name: '', color: '#409EFF', sort: 0 })
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  editId.value = row.id
  Object.assign(form, { name: row.name, color: row.color || '#409EFF', sort: row.sort || 0 })
  dialogVisible.value = true
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除标签 "${row.name}" 吗？删除后客户身上的该标签也会被移除。`, '提示', { type: 'warning' }).then(async () => {
    const res = await request.post('/tag/manage', { action: 'delete', id: row.id })
    if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
  }).catch(() => {})
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    submitLoading.value = true
    try {
      if (isEdit.value) {
        const res = await request.post('/tag/manage', { action: 'update', id: editId.value, name: form.name, color: form.color })
        if (res.code === 200) { ElMessage.success('修改成功'); dialogVisible.value = false; fetchList() }
      } else {
        const res = await request.post('/tag/manage', { action: 'add', name: form.name, color: form.color })
        if (res.code === 200) { ElMessage.success('新增成功'); dialogVisible.value = false; fetchList() }
      }
    } finally { submitLoading.value = false }
  })
}

onMounted(() => { fetchList() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.toolbar { margin-bottom: var(--space-4); }
</style>
