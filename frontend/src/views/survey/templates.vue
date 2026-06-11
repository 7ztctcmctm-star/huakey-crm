<template>
  <div class="page-container">
    <div class="page-header">
      <h2>调查模板</h2>
      <el-button type="primary" :icon="Plus" @click="handleCreate">新建模板</el-button>
    </div>

    <div class="template-grid" v-loading="loading">
      <div v-for="t in list" :key="t.id" class="template-card">
        <div class="template-header">
          <div class="template-name">{{ t.name }}</div>
          <el-tag v-if="t.is_system" size="small" type="success">系统预设</el-tag>
          <el-tag size="small" :type="typeTag[t.survey_type]">{{ typeName[t.survey_type] }}</el-tag>
        </div>
        <div class="template-desc">{{ t.description || '暂无说明' }}</div>
        <div class="template-questions">{{ parseQuestions(t.questions).length }} 个问题</div>
        <div class="template-actions">
          <el-button type="primary" link size="small" @click="handlePreview(t)">预览</el-button>
          <el-button v-if="!t.is_system" type="primary" link size="small" @click="handleEdit(t)">编辑</el-button>
          <el-button v-if="!t.is_system" type="danger" link size="small" @click="handleDelete(t)">删除</el-button>
        </div>
      </div>
      <el-empty v-if="!loading && list.length === 0" description="暂无模板" />
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑模板' : '新建模板'" width="600px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="模板名称"><el-input v-model="form.name" placeholder="输入模板名称" /></el-form-item>
        <el-form-item label="调查类型">
          <el-select v-model="form.survey_type" style="width:100%">
            <el-option label="NPS净推荐值" value="nps" /><el-option label="CSAT满意度" value="csat" /><el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" placeholder="模板说明（可选）" /></el-form-item>
        <el-form-item label="问题配置">
          <div v-for="(q, idx) in form.questions" :key="idx" class="question-item">
            <div class="question-header">
              <span>问题 {{ idx + 1 }}</span>
              <el-button :icon="Delete" link type="danger" size="small" @click="form.questions.splice(idx,1)" />
            </div>
            <el-row :gutter="12">
              <el-col :span="6">
                <el-select v-model="q.type" size="small">
                  <el-option label="评分(1-5)" value="rating" /><el-option label="NPS(0-10)" value="nps" /><el-option label="文本" value="text" />
                </el-select>
              </el-col>
              <el-col :span="18"><el-input v-model="q.question" size="small" placeholder="问题内容" /></el-col>
            </el-row>
          </div>
          <el-button size="small" @click="form.questions.push({ type: 'rating', question: '', scale: '1-5' })">添加问题</el-button>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="submitLoading" @click="handleSubmit">保存</el-button></template>
    </el-dialog>

    <!-- 预览弹窗 -->
    <el-dialog v-model="previewVisible" title="模板预览" width="500px">
      <div v-if="previewData" class="preview-content">
        <h3>{{ previewData.name }}</h3>
        <p class="preview-type">{{ typeName[previewData.survey_type] }}</p>
        <div v-for="(q, idx) in parseQuestions(previewData.questions)" :key="idx" class="preview-question">
          <div class="preview-q-text">{{ idx + 1 }}. {{ q.question }}</div>
          <div v-if="q.type === 'nps'" class="preview-nps"><span v-for="n in 11" :key="n" class="nps-num" :class="npsClass(n-1)">{{ n - 1 }}</span></div>
          <div v-else-if="q.type === 'rating'" class="preview-rating"><el-rate :model-value="0" disabled /></div>
          <div v-else class="preview-text"><el-input type="textarea" :rows="2" disabled placeholder="文本回答区域" /></div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import request from '@/utils/request'

const typeName = { nps: 'NPS', csat: 'CSAT', custom: '自定义' }
const typeTag = { nps: '', csat: 'success', custom: 'info' }

const loading = ref(false)
const list = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const submitLoading = ref(false)
const form = reactive({ name: '', survey_type: 'csat', description: '', questions: [{ type: 'rating', question: '', scale: '1-5' }] })

const previewVisible = ref(false)
const previewData = ref(null)

const parseQuestions = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v } catch { return [] } }
const npsClass = (n) => n <= 6 ? 'nps-detractor' : n <= 8 ? 'nps-passive' : 'nps-promoter'

const fetchList = async () => {
  loading.value = true
  try { const res = await request.get('/survey/templates'); if (res.code === 200) list.value = res.data } catch (e) { /* */ }
  finally { loading.value = false }
}

const handleCreate = () => {
  isEdit.value = false; editId.value = null
  Object.assign(form, { name: '', survey_type: 'csat', description: '', questions: [{ type: 'rating', question: '', scale: '1-5' }] })
  dialogVisible.value = true
}

const handleEdit = (t) => {
  isEdit.value = true; editId.value = t.id
  Object.assign(form, { name: t.name, survey_type: t.survey_type, description: t.description || '', questions: parseQuestions(t.questions) })
  dialogVisible.value = true
}

const handlePreview = (t) => { previewData.value = t; previewVisible.value = true }

const handleDelete = (t) => {
  ElMessageBox.confirm(`确定删除模板"${t.name}"？`, '提示', { type: 'warning' }).then(async () => {
    const res = await request.delete(`/survey/templates/${t.id}`)
    if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
  }).catch(() => {})
}

const handleSubmit = async () => {
  if (!form.name) { ElMessage.warning('请输入模板名称'); return }
  if (form.questions.length === 0) { ElMessage.warning('请至少添加一个问题'); return }
  submitLoading.value = true
  try {
    const data = { ...form, questions: JSON.stringify(form.questions) }
    let res
    if (isEdit.value) res = await request.put(`/survey/templates/${editId.value}`, data)
    else res = await request.post('/survey/templates', data)
    if (res.code === 200) { ElMessage.success(isEdit.value ? '修改成功' : '创建成功'); dialogVisible.value = false; fetchList() }
  } finally { submitLoading.value = false }
}

onMounted(() => { fetchList() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }

.template-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
.template-card { background: #fff; border-radius: 16px; padding: 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.template-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.template-name { font-size: 15px; font-weight: 600; color: var(--color-text); }
.template-desc { font-size: 13px; color: var(--color-text-tertiary); margin-bottom: 8px; }
.template-questions { font-size: 12px; color: var(--color-text-tertiary); margin-bottom: 12px; }
.template-actions { display: flex; gap: 8px; }

.question-item { background: var(--color-bg-secondary); padding: 12px; border-radius: 8px; margin-bottom: 8px; }
.question-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 13px; font-weight: 600; }

.preview-content h3 { margin: 0 0 4px; }
.preview-type { font-size: 13px; color: var(--color-text-tertiary); margin-bottom: 16px; }
.preview-question { margin-bottom: 16px; }
.preview-q-text { font-size: 14px; margin-bottom: 8px; }
.preview-nps { display: flex; gap: 4px; }
.nps-num { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 6px; font-size: 12px; font-weight: 600; }
.nps-detractor { background: #fee2e2; color: #dc2626; }
.nps-passive { background: #fef3c7; color: #d97706; }
.nps-promoter { background: #d1fae5; color: #059669; }
.preview-rating { display: flex; gap: 4px; }
</style>
