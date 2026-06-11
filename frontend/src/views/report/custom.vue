<template>
  <div class="page-container">
    <div class="page-header">
      <h2>自定义报表</h2>
      <el-button type="primary" :icon="Plus" @click="handleCreate">新建报表</el-button>
    </div>

    <el-row :gutter="20">
      <!-- 左侧：报表列表 -->
      <el-col :span="7">
        <el-card shadow="never" class="list-card">
          <div v-for="item in reportList" :key="item.id" class="report-item" :class="{ active: currentId === item.id }" @click="selectReport(item)">
            <div class="report-name">{{ item.name }}</div>
            <div class="report-meta">
              <el-tag size="small" :type="typeTag[item.report_type]">{{ typeName[item.report_type] }}</el-tag>
              <el-tag size="small" type="info">{{ sourceName[item.data_source] }}</el-tag>
              <el-tag v-if="item.is_public" size="small" type="success">公开</el-tag>
            </div>
            <div class="report-actions">
              <el-button type="primary" link size="small" @click.stop="handleEdit(item)">编辑</el-button>
              <el-button type="danger" link size="small" @click.stop="handleDelete(item)">删除</el-button>
            </div>
          </div>
          <el-empty v-if="reportList.length === 0" description="暂无报表" :image-size="60" />
        </el-card>
      </el-col>

      <!-- 右侧：配置+预览 -->
      <el-col :span="17">
        <!-- 配置区域 -->
        <el-card shadow="never" class="config-card">
          <template #header><span class="card-title">{{ isEditing ? '编辑报表' : '新建报表' }}</span></template>
          <el-form :model="form" label-width="90px">
            <el-row :gutter="16">
              <el-col :span="12"><el-form-item label="报表名称"><el-input v-model="form.name" placeholder="输入报表名称" /></el-form-item></el-col>
              <el-col :span="6"><el-form-item label="数据来源"><el-select v-model="form.data_source" style="width:100%" @change="fetchFields"><el-option v-for="(v,k) in sourceName" :key="k" :label="v" :value="k" /></el-select></el-form-item></el-col>
              <el-col :span="6"><el-form-item label="类型"><el-select v-model="form.report_type" style="width:100%"><el-option v-for="(v,k) in typeName" :key="k" :label="v" :value="k" /></el-select></el-form-item></el-col>
            </el-row>
            <el-form-item label="说明"><el-input v-model="form.description" placeholder="报表说明（可选）" /></el-form-item>
            <el-form-item label="显示字段">
              <div class="field-selector">
                <el-checkbox-group v-model="selectedFields">
                  <el-checkbox v-for="f in availableFields" :key="f.key" :value="f.key" :label="f.key">{{ f.label }}</el-checkbox>
                </el-checkbox-group>
              </div>
            </el-form-item>
            <el-form-item label="聚合方式">
              <div v-for="f in selectedFields" :key="f" class="agg-row">
                <span class="agg-label">{{ fieldLabel(f) }}</span>
                <el-select v-model="aggConfig[f]" placeholder="无聚合" clearable size="small" style="width:120px">
                  <el-option label="求和" value="sum" /><el-option label="计数" value="count" /><el-option label="平均值" value="avg" />
                </el-select>
              </div>
            </el-form-item>
            <el-form-item>
              <el-checkbox v-model="form.is_public" :true-value="1" :false-value="0">公开（所有人可见）</el-checkbox>
              <el-button type="primary" :loading="saveLoading" @click="handleSave" style="margin-left:16px">保存</el-button>
              <el-button type="success" :loading="runLoading" @click="handleRun" style="margin-left:8px">运行</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 预览区域 -->
        <el-card v-if="resultData" shadow="never" style="margin-top:16px">
          <template #header><span class="card-title">查询结果（{{ resultData.total }} 条）</span></template>
          <el-table :data="resultData.list" stripe border size="small" max-height="400">
            <el-table-column v-for="col in resultColumns" :key="col" :prop="col" :label="col" min-width="120" show-overflow-tooltip />
          </el-table>
          <div class="pagination" v-if="resultData.total > 20">
            <el-pagination v-model:current-page="runPage" :page-size="20" :total="resultData.total" layout="total,prev,pager,next" @current-change="handleRun" />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import request from '@/utils/request'

const typeName = { table: '表格', bar: '柱状图', line: '折线图', pie: '饼图' }
const typeTag = { table: '', bar: 'warning', line: 'success', pie: 'info' }
const sourceName = { customer: '客户', contract: '合同', payment: '回款', purchase: '采购', opportunity: '商机' }

const reportList = ref([])
const currentId = ref(null)
const isEditing = ref(false)
const editId = ref(null)
const saveLoading = ref(false)
const runLoading = ref(false)
const runPage = ref(1)

const form = reactive({ name: '', description: '', report_type: 'table', data_source: 'customer', is_public: 0 })
const availableFields = ref([])
const selectedFields = ref([])
const aggConfig = ref({})

const resultData = ref(null)
const resultColumns = ref([])

const fieldLabel = (key) => { const f = availableFields.value.find(f => f.key === key); return f ? f.label : key }

const fetchList = async () => {
  try { const res = await request.get('/report/custom'); if (res.code === 200) reportList.value = res.data } catch (e) { /* */ }
}

const fetchFields = async () => {
  try {
    const res = await request.get(`/report/custom/fields/${form.data_source}`)
    if (res.code === 200) { availableFields.value = res.data; selectedFields.value = res.data.slice(0, 4).map(f => f.key); aggConfig.value = {} }
  } catch (e) { /* */ }
}

const selectReport = (item) => {
  currentId.value = item.id
  isEditing.value = true
  editId.value = item.id
  Object.assign(form, { name: item.name, description: item.description || '', report_type: item.report_type, data_source: item.data_source, is_public: item.is_public || 0 })
  try {
    const cols = JSON.parse(item.columns_config || '[]')
    selectedFields.value = cols.map(c => c.field)
    aggConfig.value = {}
    cols.forEach(c => { if (c.agg) aggConfig.value[c.field] = c.agg })
  } catch { selectedFields.value = []; aggConfig.value = {} }
  fetchFields()
  resultData.value = null
}

const handleCreate = () => {
  isEditing.value = false; editId.value = null; currentId.value = null
  Object.assign(form, { name: '', description: '', report_type: 'table', data_source: 'customer', is_public: 0 })
  selectedFields.value = []; aggConfig.value = {}; resultData.value = null
  fetchFields()
}

const handleEdit = (item) => { selectReport(item) }

const handleSave = async () => {
  if (!form.name) { ElMessage.warning('请输入报表名称'); return }
  if (selectedFields.value.length === 0) { ElMessage.warning('请至少选择一个字段'); return }
  saveLoading.value = true
  try {
    const columns_config = JSON.stringify(selectedFields.value.map(f => ({ field: f, label: fieldLabel(f), agg: aggConfig.value[f] || null })))
    const data = { ...form, columns_config }
    let res
    if (isEditing.value) res = await request.put(`/report/custom/${editId.value}`, data)
    else res = await request.post('/report/custom', data)
    if (res.code === 200) { ElMessage.success(isEditing.value ? '修改成功' : '创建成功'); fetchList() }
  } finally { saveLoading.value = false }
}

const handleDelete = (item) => {
  ElMessageBox.confirm(`确定删除报表"${item.name}"？`, '提示', { type: 'warning' }).then(async () => {
    const res = await request.delete(`/report/custom/${item.id}`)
    if (res.code === 200) { ElMessage.success('已删除'); if (currentId.value === item.id) handleCreate(); fetchList() }
  }).catch(() => {})
}

const handleRun = async () => {
  if (!currentId.value) { ElMessage.warning('请先选择或保存报表'); return }
  runLoading.value = true
  try {
    const res = await request.post(`/report/custom/${currentId.value}/run`, { page: runPage.value, page_size: 20 })
    if (res.code === 200) {
      resultData.value = res.data
      resultColumns.value = res.data.list.length > 0 ? Object.keys(res.data.list[0]) : []
    }
  } finally { runLoading.value = false }
}

onMounted(() => { fetchList(); fetchFields() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.card-title { font-size: 15px; font-weight: 600; }

.list-card { min-height: 500px; }
.report-item { padding: 12px; border-bottom: 1px solid var(--color-border); cursor: pointer; transition: background 0.15s; }
.report-item:hover { background: var(--color-bg-secondary); }
.report-item.active { background: #f0f7ff; border-left: 3px solid #0071e3; }
.report-name { font-size: 14px; font-weight: 600; color: var(--color-text); margin-bottom: 6px; }
.report-meta { display: flex; gap: 6px; margin-bottom: 6px; }
.report-actions { display: flex; gap: 8px; }

.field-selector { max-height: 150px; overflow-y: auto; padding: 8px; background: var(--color-bg-secondary); border-radius: 8px; }
.agg-row { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.agg-label { width: 100px; font-size: 13px; color: var(--color-text-secondary); }
.pagination { display: flex; justify-content: flex-end; margin-top: 12px; }
</style>
