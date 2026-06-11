<template>
  <div class="page-container">
    <div class="page-header">
      <h2>销售话术库</h2>
      <el-button type="primary" :icon="Plus" @click="handleAdd">新增话术</el-button>
    </div>

    <!-- 场景筛选 -->
    <div class="scene-tabs">
      <el-check-tag v-model:checked="search.scene" :checked="!search.scene" @change="search.scene='';fetchList()">全部</el-check-tag>
      <el-check-tag v-for="s in scenes" :key="s" :checked="search.scene===s" @change="search.scene=s;fetchList()">{{ s }}</el-check-tag>
    </div>

    <el-card shadow="never" class="search-card">
      <el-form inline @keyup.enter="fetchList">
        <el-form-item><el-input v-model="search.keyword" placeholder="搜索话术标题/内容" clearable style="width:260px" /></el-form-item>
        <el-form-item><el-button type="primary" @click="fetchList">搜索</el-button></el-form-item>
      </el-form>
    </el-card>

    <!-- 话术列表 -->
    <div class="script-list" v-loading="loading">
      <el-card v-for="item in list" :key="item.id" shadow="hover" class="script-card">
        <div class="script-header">
          <div class="script-title">{{ item.title }}</div>
          <div class="script-actions">
            <el-tag v-if="item.scene" size="small" type="info">{{ item.scene }}</el-tag>
            <span class="script-usage">使用 {{ item.usage_count }} 次</span>
            <el-button type="primary" link size="small" @click="handleCopy(item)">复制</el-button>
            <el-button type="primary" link size="small" :icon="Edit" @click="handleEdit(item)" />
            <el-button type="danger" link size="small" :icon="Delete" @click="handleDelete(item)" />
          </div>
        </div>
        <div class="script-content">{{ item.content }}</div>
      </el-card>
      <el-empty v-if="!loading && list.length === 0" description="暂无话术" />
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑话术' : '新增话术'" width="550px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="标题" prop="title"><el-input v-model="form.title" placeholder="话术标题" /></el-form-item>
        <el-form-item label="场景">
          <el-select v-model="form.scene" placeholder="选择场景" filterable allow-create style="width:100%">
            <el-option v-for="s in scenes" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="内容" prop="content"><el-input v-model="form.content" type="textarea" :rows="6" placeholder="输入话术内容" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort_order" :min="0" style="width:100%" controls-position="right" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="submitLoading" @click="handleSubmit">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import request from '@/utils/request'

const loading = ref(false)
const list = ref([])
const scenes = ref([])
const search = reactive({ keyword: '', scene: '' })

const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const formRef = ref(null)
const submitLoading = ref(false)
const form = reactive({ title: '', scene: '', content: '', sort_order: 0 })
const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  content: [{ required: true, message: '请输入内容', trigger: 'blur' }]
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await request.get('/knowledge/scripts', { params: search })
    if (res.code === 200) list.value = res.data
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const fetchScenes = async () => {
  try { const res = await request.get('/knowledge/scripts-meta/scenes'); if (res.code === 200) scenes.value = res.data } catch (e) { /* */ }
}

const handleAdd = () => { isEdit.value = false; editId.value = null; Object.assign(form, { title: '', scene: '', content: '', sort_order: 0 }); dialogVisible.value = true }
const handleEdit = (item) => {
  isEdit.value = true; editId.value = item.id
  Object.assign(form, { title: item.title, scene: item.scene || '', content: item.content, sort_order: item.sort_order || 0 })
  dialogVisible.value = true
}
const handleDelete = (item) => {
  ElMessageBox.confirm(`确定删除话术"${item.title}"？`, '提示', { type: 'warning' }).then(async () => {
    const res = await request.delete(`/knowledge/scripts/${item.id}`)
    if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
  }).catch(() => {})
}

const handleCopy = async (item) => {
  try {
    await navigator.clipboard.writeText(item.content)
    ElMessage.success('已复制到剪贴板')
    // 更新使用次数
    request.get(`/knowledge/scripts/${item.id}`)
  } catch { ElMessage.error('复制失败') }
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    submitLoading.value = true
    try {
      let res
      if (isEdit.value) res = await request.put(`/knowledge/scripts/${editId.value}`, form)
      else res = await request.post('/knowledge/scripts', form)
      if (res.code === 200) { ElMessage.success(isEdit.value ? '修改成功' : '新增成功'); dialogVisible.value = false; fetchList(); fetchScenes() }
    } finally { submitLoading.value = false }
  })
}

onMounted(() => { fetchList(); fetchScenes() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.scene-tabs { display: flex; gap: 8px; margin-bottom: var(--space-4); flex-wrap: wrap; }
.search-card { margin-bottom: var(--space-4); }
.search-card .el-form-item { margin-bottom: 0; }

.script-list { display: flex; flex-direction: column; gap: 12px; }
.script-card { cursor: default; }
.script-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.script-title { font-size: 15px; font-weight: 600; color: var(--color-text); }
.script-actions { display: flex; align-items: center; gap: 10px; }
.script-usage { font-size: 12px; color: var(--color-text-tertiary); }
.script-content { font-size: 14px; color: var(--color-text-secondary); line-height: 1.7; white-space: pre-wrap; }
</style>
