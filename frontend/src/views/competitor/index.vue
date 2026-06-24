<template>
  <div class="page-container">
    <div class="page-header">
      <h2>竞品分析</h2>
      <el-button type="primary" :icon="Plus" @click="handleCreate">新增竞争对手</el-button>
    </div>

    <!-- 统计 -->
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">{{ stats.total_competitors }}</div><div class="stat-label">竞争对手</div></div>
      <div class="stat-card"><div class="stat-value">{{ stats.total_encounters }}</div><div class="stat-label">总交锋次数</div></div>
      <div class="stat-card"><div class="stat-value">{{ stats.win_rate }}%</div><div class="stat-label">赢单率</div></div>
      <div class="stat-card"><div class="stat-value">{{ stats.encounter_by_comp?.[0]?.name || '-' }}</div><div class="stat-label">最常见对手</div></div>
    </div>

    <!-- 图表 -->
    <el-row :gutter="16" style="margin-bottom:20px">
      <el-col :span="14">
        <el-card shadow="never"><template #header><span class="card-title">交锋次数对比</span></template><div ref="encounterChartRef" class="chart-md"></div></el-card>
      </el-col>
      <el-col :span="10">
        <el-card shadow="never"><template #header><span class="card-title">赢单/丢单原因</span></template><div ref="reasonChartRef" class="chart-md"></div></el-card>
      </el-col>
    </el-row>

    <!-- 竞争对手列表 -->
    <el-card shadow="never">
      <template #header><span class="card-title">竞争对手列表</span></template>
      <el-table :data="list" stripe border v-loading="loading">
        <el-table-column prop="name" label="名称" min-width="140">
          <template #default="{ row }"><span class="link-text" @click="$router.push(`/competitor/${row.id}`)">{{ row.name }}</span></template>
        </el-table-column>
        <el-table-column prop="industry" label="行业" width="100" />
        <el-table-column label="规模" width="80" align="center">
          <template #default="{ row }">{{ {large:'大型',medium:'中型',small:'小型',micro:'微型'}[row.scale] || '-' }}</template>
        </el-table-column>
        <el-table-column prop="encounter_count" label="交锋" width="70" align="center" />
        <el-table-column label="赢单率" width="90" align="center">
          <template #default="{ row }">
            <span v-if="row.encounter_count > 0">{{ row.win_count && row.encounter_count ? Math.round(row.win_count / row.encounter_count * 100) : 0 }}%</span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="market_share" label="市场份额" width="90" align="center">
          <template #default="{ row }">{{ row.market_share ? row.market_share + '%' : '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="$router.push(`/competitor/${row.id}`)">详情</el-button>
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑竞争对手' : '新增竞争对手'" width="600px" top="5vh">
      <el-form :model="form" label-width="80px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="行业"><el-input v-model="form.industry" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="规模"><el-select v-model="form.scale" style="width:100%"><el-option label="大型" value="large" /><el-option label="中型" value="medium" /><el-option label="小型" value="small" /><el-option label="微型" value="micro" /></el-select></el-form-item></el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="官网"><el-input v-model="form.website" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="总部"><el-input v-model="form.headquarters" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="价格区间"><el-input v-model="form.price_range" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="市场份额%"><el-input-number v-model="form.market_share" :min="0" :max="100" :precision="2" style="width:100%" controls-position="right" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="主要产品"><el-input v-model="form.products" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="简介"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saveLoading" @click="handleSave">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { getCompetitorList, addCompetitor, updateCompetitor, deleteCompetitor, getCompetitorAnalysis } from '@/api/tools'
import echarts from '@/composables/useECharts'

const loading = ref(false)
const list = ref([])
const stats = ref({ total_competitors: 0, total_encounters: 0, win_rate: 0, encounter_by_comp: [], reasons: [], recent_encounters: [] })
const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const saveLoading = ref(false)
const form = reactive({ name: '', industry: '', scale: '', website: '', headquarters: '', price_range: '', market_share: null, products: '', description: '' })

const encounterChartRef = ref(null)
const reasonChartRef = ref(null)

const fetchList = async () => {
  loading.value = true
  try { const res = await getCompetitorList(); if (res.code === 200) list.value = res.data } catch (e) { /* */ }
  finally { loading.value = false }
}

const fetchStats = async () => {
  try {
    const res = await getCompetitorAnalysis()
    if (res.code === 200) {
      stats.value = res.data
      await nextTick()
      renderCharts()
    }
  } catch (e) { /* */ }
}

const renderCharts = () => {
  const s = stats.value
  if (encounterChartRef.value && s.encounter_by_comp?.length > 0) {
    const chart = echarts.init(encounterChartRef.value)
    chart.setOption({
      tooltip: { trigger: 'axis' }, grid: { left: 80, right: 20, top: 20, bottom: 30 },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: s.encounter_by_comp.map(c => c.name).reverse() },
      series: [
        { name: '赢单', type: 'bar', stack: 'total', data: s.encounter_by_comp.map(c => parseInt(c.wins) || 0).reverse(), itemStyle: { color: '#34c759' } },
        { name: '丢单', type: 'bar', stack: 'total', data: s.encounter_by_comp.map(c => parseInt(c.losses) || 0).reverse(), itemStyle: { color: '#f56c6c' } }
      ]
    })
  }
  if (reasonChartRef.value && s.reasons?.length > 0) {
    const chart = echarts.init(reasonChartRef.value)
    chart.setOption({
      tooltip: { trigger: 'item' },
      series: [{ type: 'pie', radius: ['40%', '70%'], data: s.reasons, label: { show: true, formatter: '{b}\n{d}%' } }]
    })
  }
}

const handleCreate = () => {
  isEdit.value = false; editId.value = null
  Object.assign(form, { name: '', industry: '', scale: '', website: '', headquarters: '', price_range: '', market_share: null, products: '', description: '' })
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true; editId.value = row.id
  Object.assign(form, { name: row.name, industry: row.industry || '', scale: row.scale || '', website: row.website || '', headquarters: row.headquarters || '', price_range: row.price_range || '', market_share: row.market_share, products: row.products || '', description: row.description || '' })
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!form.name) { ElMessage.warning('请输入名称'); return }
  saveLoading.value = true
  try {
    let res
    if (isEdit.value) res = await updateCompetitor({ id: editId.value, ...form })
    else res = await addCompetitor(form)
    if (res.code === 200) { ElMessage.success('保存成功'); dialogVisible.value = false; fetchList(); fetchStats() }
  } finally { saveLoading.value = false }
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除"${row.name}"？`, '提示', { type: 'warning' }).then(async () => {
    const res = await deleteCompetitor(row.id)
    if (res.code === 200) { ElMessage.success('已删除'); fetchList(); fetchStats() }
  }).catch(() => {})
}

onMounted(() => { fetchList(); fetchStats() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: var(--space-4); }
.stat-card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--color-text); }
.stat-label { font-size: 13px; color: var(--color-text-tertiary); margin-top: 4px; }
.card-title { font-size: 15px; font-weight: 600; }
.chart-md { height: 280px; }
.link-text { color: var(--color-accent); cursor: pointer; }
.link-text:hover { text-decoration: underline; }
.text-muted { color: var(--color-text-tertiary); }
</style>
