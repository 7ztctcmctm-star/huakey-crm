<template>
  <div class="page-container">
    <div class="page-header">
      <h2>跟进模板</h2>
      <p class="page-desc">管理跟进记录模板，快速填充跟进内容</p>
    </div>
    <el-card>
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="handleAdd">新增模板</el-button>
      </div>
      <el-table v-loading="loading" :data="tableData" stripe border>
        <el-table-column prop="name" label="模板名称" min-width="150" />
        <el-table-column prop="type" label="类型" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="typeTagMap[row.type]" size="small">{{ typeNameMap[row.type] || row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="模板内容" min-width="300" show-overflow-tooltip />
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button type="primary" link :icon="View" @click="handlePreview(row)">预览</el-button>
            <el-button type="primary" link :icon="Edit" @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link :icon="Delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑模板' : '新增模板'" width="550px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="模板名称" prop="name">
          <el-input v-model="form.name" placeholder="如：首次电话拜访" maxlength="50" />
        </el-form-item>
        <el-form-item label="模板类型" prop="type">
          <el-select v-model="form.type" style="width:100%">
            <el-option label="通用" value="general" />
            <el-option label="首次跟进" value="first" />
            <el-option label="报价跟进" value="quote" />
            <el-option label="成交跟进" value="deal" />
          </el-select>
        </el-form-item>
        <el-form-item label="模板内容" prop="content">
          <el-input v-model="form.content" type="textarea" :rows="6" placeholder="输入跟进内容模板，可用 {联系人} {需求方向} 等变量" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 预览弹窗 -->
    <el-dialog v-model="previewVisible" title="模板预览" width="500px">
      <div class="preview-box">
        <div class="preview-meta">
          <span><strong>名称：</strong>{{ previewData.name }}</span>
          <el-tag :type="typeTagMap[previewData.type]" size="small" style="margin-left:12px;">{{ typeNameMap[previewData.type] }}</el-tag>
        </div>
        <div class="preview-content">{{ previewData.content }}</div>
      </div>
      <template #footer>
        <el-button @click="previewVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, View } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { getFollowupTemplates, saveFollowupTemplate, deleteFollowupTemplate } from '@/api/customer'

const typeNameMap = { general: '通用', first: '首次跟进', quote: '报价跟进', deal: '成交跟进' }
const typeTagMap = { general: 'info', first: 'primary', quote: 'warning', deal: 'success' }

const loading = ref(false)
const tableData = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const formRef = ref(null)
const submitLoading = ref(false)

const form = reactive({ name: '', type: 'general', content: '' })
const rules = {
  name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
  content: [{ required: true, message: '请输入模板内容', trigger: 'blur' }]
}

const previewVisible = ref(false)
const previewData = reactive({ name: '', type: 'general', content: '' })

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getFollowupTemplates()
    if (res.code === 200) tableData.value = res.data
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const handleAdd = () => {
  isEdit.value = false
  editId.value = null
  Object.assign(form, { name: '', type: 'general', content: '' })
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  editId.value = row.id
  Object.assign(form, { name: row.name, type: row.type, content: row.content })
  dialogVisible.value = true
}

const handlePreview = (row) => {
  Object.assign(previewData, { name: row.name, type: row.type, content: row.content })
  previewVisible.value = true
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除模板 "${row.name}" 吗？`, '提示', { type: 'warning' }).then(async () => {
    const res = await deleteFollowupTemplate(row.id)
    if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
  }).catch(() => {})
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    submitLoading.value = true
    try {
      let res
      if (isEdit.value) {
        res = await saveFollowupTemplate({ id: editId.value, name: form.name, type: form.type, content: form.content })
      } else {
        res = await saveFollowupTemplate({ name: form.name, type: form.type, content: form.content })
      }
      if (res.code === 200) {
        ElMessage.success(isEdit.value ? '修改成功' : '新增成功')
        dialogVisible.value = false
        fetchList()
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
.page-desc { margin: var(--space-1) 0 0; font-size: 13px; color: var(--color-text-tertiary); }
.toolbar { margin-bottom: var(--space-4); }
.preview-box { padding: var(--space-3); background: var(--color-bg-secondary); border-radius: 8px; }
.preview-meta { margin-bottom: var(--space-3); font-size: 14px; }
.preview-content { font-size: 14px; line-height: 1.8; color: var(--color-text-secondary); white-space: pre-wrap; }
</style>
