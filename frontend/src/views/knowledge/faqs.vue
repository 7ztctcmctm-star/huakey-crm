<template>
  <div class="page-container">
    <div class="page-header">
      <h2>常见问题</h2>
      <el-button type="primary" :icon="Plus" @click="handleAdd">新增FAQ</el-button>
    </div>

    <!-- 分类筛选 -->
    <div class="category-tabs">
      <el-check-tag :checked="!search.category" @change="search.category='';fetchList()">全部</el-check-tag>
      <el-check-tag v-for="c in categoryList" :key="c" :checked="search.category===c" @change="search.category=c;fetchList()">{{ c }}</el-check-tag>
    </div>

    <el-card shadow="never" class="search-card">
      <el-form inline @keyup.enter="fetchList">
        <el-form-item><el-input v-model="search.keyword" placeholder="搜索问题/答案" clearable style="width:280px" /></el-form-item>
        <el-form-item><el-button type="primary" @click="fetchList">搜索</el-button></el-form-item>
      </el-form>
    </el-card>

    <!-- FAQ 折叠面板 -->
    <div v-loading="loading">
      <el-collapse v-model="activeNames" class="faq-collapse">
        <el-collapse-item v-for="item in list" :key="item.id" :name="item.id">
          <template #title>
            <div class="faq-title">
              <span class="faq-question">{{ item.question }}</span>
              <div class="faq-meta">
                <el-tag v-if="item.category" size="small" type="info">{{ item.category }}</el-tag>
                <span class="faq-views">查看 {{ item.view_count }} 次</span>
              </div>
            </div>
          </template>
          <div class="faq-answer">{{ item.answer }}</div>
          <div class="faq-actions">
            <el-button type="primary" link size="small" :icon="Edit" @click.stop="handleEdit(item)">编辑</el-button>
            <el-button type="danger" link size="small" :icon="Delete" @click.stop="handleDelete(item)">删除</el-button>
          </div>
        </el-collapse-item>
      </el-collapse>
      <el-empty v-if="!loading && list.length === 0" description="暂无常见问题" />
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑FAQ' : '新增FAQ'" width="550px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="问题" prop="question"><el-input v-model="form.question" placeholder="输入问题" /></el-form-item>
        <el-form-item label="分类">
          <el-select v-model="form.category" placeholder="选择分类" filterable allow-create style="width:100%">
            <el-option v-for="c in categoryList" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="答案" prop="answer"><el-input v-model="form.answer" type="textarea" :rows="5" placeholder="输入答案" /></el-form-item>
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
const categoryList = ref([])
const activeNames = ref([])
const search = reactive({ keyword: '', category: '' })

const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const formRef = ref(null)
const submitLoading = ref(false)
const form = reactive({ question: '', answer: '', category: '', sort_order: 0 })
const rules = {
  question: [{ required: true, message: '请输入问题', trigger: 'blur' }],
  answer: [{ required: true, message: '请输入答案', trigger: 'blur' }]
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await request.get('/knowledge/faqs', { params: search })
    if (res.code === 200) list.value = res.data
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const fetchCategories = async () => {
  try { const res = await request.get('/knowledge/faqs-meta/categories'); if (res.code === 200) categoryList.value = res.data } catch (e) { /* */ }
}

const handleAdd = () => { isEdit.value = false; editId.value = null; Object.assign(form, { question: '', answer: '', category: '', sort_order: 0 }); dialogVisible.value = true }
const handleEdit = (item) => {
  isEdit.value = true; editId.value = item.id
  Object.assign(form, { question: item.question, answer: item.answer, category: item.category || '', sort_order: item.sort_order || 0 })
  dialogVisible.value = true
}
const handleDelete = (item) => {
  ElMessageBox.confirm(`确定删除该FAQ？`, '提示', { type: 'warning' }).then(async () => {
    const res = await request.delete(`/knowledge/faqs/${item.id}`)
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
      if (isEdit.value) res = await request.put(`/knowledge/faqs/${editId.value}`, form)
      else res = await request.post('/knowledge/faqs', form)
      if (res.code === 200) { ElMessage.success(isEdit.value ? '修改成功' : '新增成功'); dialogVisible.value = false; fetchList(); fetchCategories() }
    } finally { submitLoading.value = false }
  })
}

onMounted(() => { fetchList(); fetchCategories() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.category-tabs { display: flex; gap: 8px; margin-bottom: var(--space-4); flex-wrap: wrap; }
.search-card { margin-bottom: var(--space-4); }
.search-card .el-form-item { margin-bottom: 0; }

.faq-collapse { background: #fff; border-radius: 12px; overflow: hidden; }
.faq-title { display: flex; justify-content: space-between; align-items: center; width: 100%; padding-right: 16px; }
.faq-question { font-size: 15px; font-weight: 500; color: var(--color-text); }
.faq-meta { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.faq-views { font-size: 12px; color: var(--color-text-tertiary); }
.faq-answer { font-size: 14px; color: var(--color-text-secondary); line-height: 1.8; white-space: pre-wrap; padding: 8px 0 12px; }
.faq-actions { display: flex; gap: 8px; }
</style>
