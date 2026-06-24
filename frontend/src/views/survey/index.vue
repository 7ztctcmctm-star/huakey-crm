<template>
  <div class="page-container">
    <div class="page-header">
      <h2>调查管理</h2>
      <el-button type="primary" :icon="Plus" @click="showCreate = true">新建调查</el-button>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card" v-for="s in statCards" :key="s.key">
        <div class="stat-value">{{ s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </div>
    </div>

    <!-- 状态筛选 -->
    <div class="status-tabs">
      <el-check-tag :checked="!filterStatus" @change="filterStatus='';fetchList()">全部</el-check-tag>
      <el-check-tag :checked="filterStatus==='draft'" @change="filterStatus='draft';fetchList()">草稿</el-check-tag>
      <el-check-tag :checked="filterStatus==='active'" @change="filterStatus='active';fetchList()">进行中</el-check-tag>
      <el-check-tag :checked="filterStatus==='closed'" @change="filterStatus='closed';fetchList()">已关闭</el-check-tag>
    </div>

    <!-- 活动列表 -->
    <el-card shadow="never">
      <el-table :data="list" stripe border v-loading="loading">
        <el-table-column prop="name" label="调查名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="template_name" label="模板" width="140" />
        <el-table-column prop="survey_type" label="类型" width="80" align="center">
          <template #default="{ row }"><el-tag size="small" :type="typeTag[row.survey_type]">{{ typeName[row.survey_type] }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80" align="center">
          <template #default="{ row }"><el-tag size="small" :type="statusTag[row.status]">{{ statusName[row.status] }}</el-tag></template>
        </el-table-column>
        <el-table-column label="发送/回复" width="120" align="center">
          <template #default="{ row }">{{ row.total_sent }} / {{ row.total_responded }}</template>
        </el-table-column>
        <el-table-column label="回复率" width="80" align="center">
          <template #default="{ row }">{{ row.total_sent > 0 ? Math.round(row.total_responded / row.total_sent * 100) : 0 }}%</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="$router.push(`/survey/detail/${row.id}`)">详情</el-button>
            <el-button v-if="row.status==='draft'" type="primary" link @click="$router.push(`/survey/detail/${row.id}`)">编辑</el-button>
            <el-button v-if="row.status==='draft'" type="success" link @click="handleStart(row)">启动</el-button>
            <el-button v-if="row.status==='active'" type="warning" link @click="handleClose(row)">关闭</el-button>
            <el-button v-if="row.status!=='draft'" type="primary" link @click="$router.push(`/survey/analytics/${row.id}`)">分析</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新建弹窗 -->
    <el-dialog v-model="showCreate" title="新建调查" width="500px">
      <el-form :model="createForm" label-width="80px">
        <el-form-item label="调查名称"><el-input v-model="createForm.name" placeholder="输入调查名称" /></el-form-item>
        <el-form-item label="调查模板">
          <el-select v-model="createForm.template_id" placeholder="选择模板" style="width:100%">
            <el-option v-for="t in templates" :key="t.id" :label="t.name" :value="t.id">
              <span>{{ t.name }}</span><el-tag size="small" style="margin-left:8px" :type="typeTag[t.survey_type]">{{ typeName[t.survey_type] }}</el-tag>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="时间范围"><el-date-picker v-model="createForm.dateRange" type="daterange" start-placeholder="开始" end-placeholder="结束" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="showCreate=false">取消</el-button><el-button type="primary" :loading="createLoading" @click="handleCreate">创建</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { getSurveyTemplates, getSurveyCampaigns, getSurveyAnalytics, saveSurveyCampaign, startCampaign, closeCampaign } from '@/api/tools'
import request from '@/utils/request'

const typeName = { nps: 'NPS', csat: 'CSAT', custom: '自定义' }
const typeTag = { nps: '', csat: 'success', custom: 'info' }
const statusName = { draft: '草稿', active: '进行中', closed: '已关闭' }
const statusTag = { draft: 'info', active: 'success', closed: '' }

const loading = ref(false)
const list = ref([])
const templates = ref([])
const filterStatus = ref('')
const showCreate = ref(false)
const createLoading = ref(false)
const createForm = reactive({ name: '', template_id: null, dateRange: null })

const stats = ref({ total: 0, active: 0, responses: 0, avgNps: 0 })
const statCards = computed(() => [
  { key: 'total', label: '总调查数', value: stats.value.total },
  { key: 'active', label: '进行中', value: stats.value.active },
  { key: 'responses', label: '总回复数', value: stats.value.responses },
  { key: 'nps', label: '平均NPS', value: stats.value.avgNps }
])

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getSurveyCampaigns()
    if (res.code === 200) list.value = res.data
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const fetchTemplates = async () => {
  try { const res = await getSurveyTemplates(); if (res.code === 200) templates.value = res.data } catch (e) { /* */ }
}

const fetchStats = async () => {
  try {
    const res = await getSurveyAnalytics()
    if (res.code === 200) {
      const s = res.data.stats
      stats.value = { total: s.total_campaigns, active: s.active_campaigns, responses: s.total_responses, avgNps: s.avg_nps }
    }
  } catch (e) { /* */ }
}

const handleCreate = async () => {
  if (!createForm.name || !createForm.template_id) { ElMessage.warning('请填写名称并选择模板'); return }
  createLoading.value = true
  try {
    const data = { name: createForm.name, template_id: createForm.template_id }
    if (createForm.dateRange && createForm.dateRange.length === 2) { data.start_date = createForm.dateRange[0]; data.end_date = createForm.dateRange[1] }
    const res = await saveSurveyCampaign(data)
    if (res.code === 200) { ElMessage.success('创建成功'); showCreate.value = false; fetchList(); fetchStats() }
  } finally { createLoading.value = false }
}

const handleStart = (row) => {
  ElMessageBox.confirm(`确定启动调查"${row.name}"？`, '启动确认', { type: 'info' }).then(async () => {
    const res = await startCampaign(row.id)
    if (res.code === 200) { ElMessage.success('已启动'); fetchList(); fetchStats() }
  }).catch(() => {})
}

const handleClose = (row) => {
  ElMessageBox.confirm(`确定关闭调查"${row.name}"？`, '关闭确认', { type: 'warning' }).then(async () => {
    const res = await closeCampaign(row.id)
    if (res.code === 200) { ElMessage.success('已关闭'); fetchList(); fetchStats() }
  }).catch(() => {})
}

onMounted(() => { fetchList(); fetchTemplates(); fetchStats() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: var(--space-4); }
.stat-card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--color-text); }
.stat-label { font-size: 13px; color: var(--color-text-tertiary); margin-top: 4px; }
.status-tabs { display: flex; gap: 8px; margin-bottom: var(--space-4); }
</style>
