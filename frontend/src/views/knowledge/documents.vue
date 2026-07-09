<template>
  <div class="page-container">
    <div class="page-header">
      <h2>文档模板</h2>
      <el-button type="primary" :icon="Upload" @click="handleUpload">上传文档</el-button>
    </div>

    <el-card shadow="never" class="search-card">
      <el-form :model="search" inline @keyup.enter="fetchList">
        <el-form-item><el-input v-model="search.keyword" placeholder="搜索文档名称" clearable style="width:220px" /></el-form-item>
        <el-form-item>
          <el-select v-model="search.type" placeholder="全部类型" clearable style="width:140px">
            <el-option label="合同模板" value="contract" /><el-option label="报价模板" value="quote" /><el-option label="通用文档" value="general" />
          </el-select>
        </el-form-item>
        <el-form-item><el-button type="primary" @click="fetchList">搜索</el-button></el-form-item>
      </el-form>
    </el-card>

    <el-table v-loading="loading" :data="list" stripe border>
      <el-table-column prop="name" label="文档名称" min-width="200" show-overflow-tooltip />
      <el-table-column prop="type" label="类型" width="100" align="center">
        <template #default="{ row }"><el-tag :type="typeTag[row.type]" size="small">{{ typeName[row.type] }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="file_type" label="格式" width="80" align="center">
        <template #default="{ row }"><el-tag size="small" type="info">{{ (row.file_type || '-').toUpperCase() }}</el-tag></template>
      </el-table-column>
      <el-table-column label="大小" width="100" align="right">
        <template #default="{ row }">{{ row.file_size ? formatSize(row.file_size) : '-' }}</template>
      </el-table-column>
      <el-table-column prop="download_count" label="下载" width="80" align="center" />
      <el-table-column prop="create_time" label="上传时间" width="160">
        <template #default="{ row }">{{ formatTime(row.create_time) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="handleDownload(row)">下载</el-button>
          <el-button type="primary" link :icon="Edit" @click="handleEdit(row)">编辑</el-button>
          <el-button type="danger" link :icon="Delete" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 上传弹窗 -->
    <el-dialog v-model="uploadVisible" title="上传文档" width="500px">
      <el-form ref="uploadFormRef" :model="uploadForm" :rules="uploadRules" label-width="80px">
        <el-form-item label="文档名称" prop="name"><el-input v-model="uploadForm.name" placeholder="文档名称" /></el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="uploadForm.type" style="width:100%">
            <el-option label="合同模板" value="contract" /><el-option label="报价模板" value="quote" /><el-option label="通用文档" value="general" />
          </el-select>
        </el-form-item>
        <el-form-item label="说明"><el-input v-model="uploadForm.description" type="textarea" :rows="2" placeholder="文档说明（可选）" /></el-form-item>
        <el-form-item label="文件" prop="file">
          <el-upload ref="uploadRef" :auto-upload="false" :limit="1" :on-change="onFileChange" :on-remove="onFileRemove" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar">
            <el-button type="primary" :icon="Upload">选择文件</el-button>
            <template #tip><div class="el-upload__tip">支持 pdf/docx/xlsx/pptx/zip，最大 20MB</div></template>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="uploadVisible=false">取消</el-button><el-button type="primary" :loading="submitLoading" @click="handleUploadSubmit">上传</el-button></template>
    </el-dialog>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="editVisible" title="编辑文档" width="450px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="名称"><el-input v-model="editForm.name" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="editForm.type" style="width:100%">
            <el-option label="合同模板" value="contract" /><el-option label="报价模板" value="quote" /><el-option label="通用文档" value="general" />
          </el-select>
        </el-form-item>
        <el-form-item label="说明"><el-input v-model="editForm.description" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="editVisible=false">取消</el-button><el-button type="primary" :loading="submitLoading" @click="handleEditSubmit">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, Edit, Delete } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { getKnowledgeDocuments, addKnowledgeDocument, updateKnowledgeDocument, deleteKnowledgeDocument } from '@/api/tools'
import { formatTime } from '@/composables/useFormat'

const typeName = { contract: '合同模板', quote: '报价模板', general: '通用文档' }
const typeTag = { contract: 'success', quote: '', general: 'info' }

const loading = ref(false)
const list = ref([])
const search = reactive({ keyword: '', type: '' })
const submitLoading = ref(false)

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getKnowledgeDocuments(search)
    if (res.code === 200) list.value = res.data
  } catch (e) { /* */ }
  finally { loading.value = false }
}

// 上传
const uploadVisible = ref(false)
const uploadFormRef = ref(null)
const uploadRef = ref(null)
const uploadForm = reactive({ name: '', type: 'general', description: '', file: null })
const uploadRules = {
  name: [{ required: true, message: '请输入文档名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }]
}
const selectedFile = ref(null)
const onFileChange = (file) => { selectedFile.value = file.raw; if (!uploadForm.name) uploadForm.name = file.name.replace(/\.[^.]+$/, '') }
const onFileRemove = () => { selectedFile.value = null }

const handleUpload = () => {
  Object.assign(uploadForm, { name: '', type: 'general', description: '' })
  selectedFile.value = null
  uploadVisible.value = true
}

const handleUploadSubmit = async () => {
  if (!uploadFormRef.value) return
  await uploadFormRef.value.validate(async (valid) => {
    if (!valid) return
    submitLoading.value = true
    try {
      const fd = new FormData()
      fd.append('name', uploadForm.name)
      fd.append('type', uploadForm.type)
      fd.append('description', uploadForm.description)
      if (selectedFile.value) fd.append('file', selectedFile.value)
      const res = await addKnowledgeDocument(fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      if (res.code === 200) { ElMessage.success('上传成功'); uploadVisible.value = false; fetchList() }
    } finally { submitLoading.value = false }
  })
}

// 编辑
const editVisible = ref(false)
const editId = ref(null)
const editForm = reactive({ name: '', type: '', description: '' })
const handleEdit = (row) => { editId.value = row.id; Object.assign(editForm, { name: row.name, type: row.type, description: row.description || '' }); editVisible.value = true }
const handleEditSubmit = async () => {
  submitLoading.value = true
  try {
    const res = await updateKnowledgeDocument(editId.value, editForm)
    if (res.code === 200) { ElMessage.success('修改成功'); editVisible.value = false; fetchList() }
  } finally { submitLoading.value = false }
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除文档"${row.name}"？`, '提示', { type: 'warning' }).then(async () => {
    const res = await deleteKnowledgeDocument(row.id)
    if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
  }).catch(() => {})
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1'

const handleDownload = (row) => {
  window.open(`${apiBaseUrl}/knowledge/documents/${row.id}/download`, '_blank')
}

onMounted(() => { fetchList() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.search-card { margin-bottom: var(--space-4); }
.search-card .el-form-item { margin-bottom: 0; }
</style>
