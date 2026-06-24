<template>
  <div class="page-container" v-loading="loading">
    <div class="page-header">
      <div>
        <el-button text :icon="ArrowLeft" @click="$router.push('/competitor')">返回</el-button>
        <span class="page-title">{{ competitor.name }}</span>
        <el-tag v-if="competitor.industry" size="small" style="margin-left:8px">{{ competitor.industry }}</el-tag>
      </div>
      <el-button type="primary" @click="handleEdit">编辑</el-button>
    </div>

    <!-- 基本信息 -->
    <el-card shadow="never" style="margin-bottom:16px">
      <el-descriptions :column="4" border size="small">
        <el-descriptions-item label="规模">{{ {large:'大型',medium:'中型',small:'小型',micro:'微型'}[competitor.scale] || '-' }}</el-descriptions-item>
        <el-descriptions-item label="总部">{{ competitor.headquarters || '-' }}</el-descriptions-item>
        <el-descriptions-item label="官网">{{ competitor.website || '-' }}</el-descriptions-item>
        <el-descriptions-item label="市场份额">{{ competitor.market_share ? competitor.market_share + '%' : '-' }}</el-descriptions-item>
        <el-descriptions-item label="价格区间">{{ competitor.price_range || '-' }}</el-descriptions-item>
        <el-descriptions-item label="交锋次数">{{ competitor.encounter_count || 0 }}</el-descriptions-item>
        <el-descriptions-item label="赢单率">{{ winRate }}%</el-descriptions-item>
        <el-descriptions-item label="状态">{{ competitor.status === 1 ? '活跃' : '不再竞争' }}</el-descriptions-item>
        <el-descriptions-item label="主要产品" :span="4">{{ competitor.products || '-' }}</el-descriptions-item>
        <el-descriptions-item label="简介" :span="4">{{ competitor.description || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-tabs v-model="activeTab">
      <!-- 交锋记录 -->
      <el-tab-pane label="交锋记录" name="encounters">
        <el-card shadow="never">
          <div class="toolbar"><el-button type="primary" :icon="Plus" @click="handleCreateEncounter">新增交锋记录</el-button></div>
          <el-table :data="encounters" stripe border>
            <el-table-column prop="encounter_date" label="日期" width="110" />
            <el-table-column prop="customer_name" label="客户" min-width="140" show-overflow-tooltip />
            <el-table-column prop="encounter_type" label="类型" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="{won:'success',lost:'danger',competing:'warning',encountered:'info'}[row.encounter_type]" size="small">
                  {{ {won:'赢单',lost:'丢单',competing:'竞标中',encountered:'偶然遇到'}[row.encounter_type] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="我方报价" width="110" align="right">
              <template #default="{ row }">{{ row.our_price ? '¥' + Number(row.our_price).toLocaleString() : '-' }}</template>
            </el-table-column>
            <el-table-column label="对方报价" width="110" align="right">
              <template #default="{ row }">{{ row.their_price ? '¥' + Number(row.their_price).toLocaleString() : '-' }}</template>
            </el-table-column>
            <el-table-column prop="win_reason" label="原因" min-width="160" show-overflow-tooltip />
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button type="danger" link size="small" @click="handleDeleteEncounter(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- 情报中心 -->
      <el-tab-pane label="情报中心" name="intel">
        <el-card shadow="never">
          <div class="toolbar"><el-button type="primary" :icon="Plus" @click="handleCreateIntel">新增情报</el-button></div>
          <div v-for="item in intelList" :key="item.id" class="intel-card" :class="'intel-' + item.importance">
            <div class="intel-header">
              <el-tag :type="intelTypeTag[item.intel_type]" size="small">{{ intelTypeName[item.intel_type] }}</el-tag>
              <el-tag :type="item.importance==='high'?'danger':item.importance==='low'?'info':'primary'" size="small">{{ {high:'重要',medium:'一般',low:'低'}[item.importance] }}</el-tag>
              <span class="intel-source" v-if="item.source">来源: {{ item.source }}</span>
              <span class="intel-time">{{ item.create_time }}</span>
            </div>
            <div class="intel-title">{{ item.title }}</div>
            <div class="intel-content">{{ item.content }}</div>
            <div class="intel-actions">
              <el-button type="danger" link size="small" @click="handleDeleteIntel(item)">删除</el-button>
            </div>
          </div>
          <el-empty v-if="intelList.length === 0" description="暂无情报" :image-size="60" />
        </el-card>
      </el-tab-pane>

      <!-- 优劣势分析 -->
      <el-tab-pane label="优劣势分析" name="swot">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-card shadow="never">
              <template #header><span style="color:#34c759;font-weight:600">优势</span></template>
              <div v-for="(s, idx) in strengths" :key="idx" class="swot-item strength">{{ s }}</div>
              <el-empty v-if="strengths.length === 0" description="暂无数据" :image-size="40" />
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card shadow="never">
              <template #header><span style="color:#f56c6c;font-weight:600">劣势</span></template>
              <div v-for="(w, idx) in weaknesses" :key="idx" class="swot-item weakness">{{ w }}</div>
              <el-empty v-if="weaknesses.length === 0" description="暂无数据" :image-size="40" />
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>
    </el-tabs>

    <!-- 新增交锋记录弹窗 -->
    <el-dialog v-model="encounterDialogVisible" title="新增交锋记录" width="550px">
      <el-form :model="encounterForm" label-width="80px">
        <el-form-item label="类型">
          <el-select v-model="encounterForm.encounter_type" style="width:100%">
            <el-option label="赢单" value="won" /><el-option label="丢单" value="lost" /><el-option label="竞标中" value="competing" /><el-option label="偶然遇到" value="encountered" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联客户">
          <el-select v-model="encounterForm.customer_id" filterable clearable placeholder="选择客户" style="width:100%">
            <el-option v-for="c in customerOptions" :key="c.id" :label="c.company_name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="我方报价"><el-input-number v-model="encounterForm.our_price" :min="0" :precision="2" style="width:100%" controls-position="right" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="对方报价"><el-input-number v-model="encounterForm.their_price" :min="0" :precision="2" style="width:100%" controls-position="right" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="日期"><el-date-picker v-model="encounterForm.encounter_date" type="date" style="width:100%" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="原因"><el-input v-model="encounterForm.win_reason" placeholder="赢单/丢单原因" /></el-form-item>
        <el-form-item label="我方优势"><el-input v-model="encounterForm.our_advantage" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="对方优势"><el-input v-model="encounterForm.their_advantage" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="经验教训"><el-input v-model="encounterForm.lesson_learned" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="encounterDialogVisible=false">取消</el-button><el-button type="primary" @click="handleSaveEncounter">保存</el-button></template>
    </el-dialog>

    <!-- 新增情报弹窗 -->
    <el-dialog v-model="intelDialogVisible" title="新增情报" width="500px">
      <el-form :model="intelForm" label-width="80px">
        <el-form-item label="类型">
          <el-select v-model="intelForm.intel_type" style="width:100%">
            <el-option v-for="(v, k) in intelTypeName" :key="k" :label="v" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="重要程度">
          <el-select v-model="intelForm.importance" style="width:100%">
            <el-option label="重要" value="high" /><el-option label="一般" value="medium" /><el-option label="低" value="low" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题"><el-input v-model="intelForm.title" /></el-form-item>
        <el-form-item label="内容"><el-input v-model="intelForm.content" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="来源"><el-input v-model="intelForm.source" placeholder="信息来源（可选）" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="intelDialogVisible=false">取消</el-button><el-button type="primary" @click="handleSaveIntel">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Plus } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { getCompetitorDetail, addCompetitorEncounter, addCompetitorIntel, getCompetitorEncounters, getCompetitorIntel, deleteCompetitorEncounter, deleteCompetitorIntel } from '@/api/tools'
import { getCustomerList } from '@/api/customer'

const intelTypeName = { product: '产品', pricing: '价格', strategy: '策略', partnership: '合作', market: '市场' }
const intelTypeTag = { product: '', pricing: 'warning', strategy: 'success', partnership: 'info', market: '' }

const route = useRoute()
const loading = ref(false)
const competitor = ref({})
const encounters = ref([])
const intelList = ref([])
const customerOptions = ref([])
const activeTab = ref('encounters')

const strengths = computed(() => { try { return JSON.parse(competitor.value.strengths || '[]') } catch { return [] } })
const weaknesses = computed(() => { try { return JSON.parse(competitor.value.weaknesses || '[]') } catch { return [] } })
const winRate = computed(() => {
  const c = competitor.value
  return c.encounter_count > 0 && c.win_count ? Math.round(c.win_count / c.encounter_count * 100) : 0
})

const encounterDialogVisible = ref(false)
const encounterForm = reactive({ encounter_type: 'won', customer_id: null, our_price: null, their_price: null, encounter_date: '', win_reason: '', our_advantage: '', their_advantage: '', lesson_learned: '' })

const intelDialogVisible = ref(false)
const intelForm = reactive({ intel_type: 'product', title: '', content: '', source: '', importance: 'medium' })

const fetchDetail = async () => {
  loading.value = true
  try {
    const res = await getCompetitorDetail(route.params.id)
    if (res.code === 200) competitor.value = res.data
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const fetchEncounters = async () => {
  try { const res = await getCompetitorEncounters(route.params.id); if (res.code === 200) encounters.value = res.data } catch (e) { /* */ }
}

const fetchIntel = async () => {
  try { const res = await getCompetitorIntel(route.params.id); if (res.code === 200) intelList.value = res.data } catch (e) { /* */ }
}

const fetchCustomers = async () => {
  try { const res = await getCustomerList({ page: 1, pageSize: 200 }); if (res.code === 200) customerOptions.value = res.data.list } catch (e) { /* */ }
}

const handleEdit = () => { ElMessage.info('请返回列表页编辑') }

const handleCreateEncounter = () => {
  Object.assign(encounterForm, { encounter_type: 'won', customer_id: null, our_price: null, their_price: null, encounter_date: '', win_reason: '', our_advantage: '', their_advantage: '', lesson_learned: '' })
  encounterDialogVisible.value = true
}

const handleSaveEncounter = async () => {
  try {
    const res = await addCompetitorEncounter({ ...encounterForm, competitor_id: parseInt(route.params.id) })
    if (res.code === 200) { ElMessage.success('创建成功'); encounterDialogVisible.value = false; fetchEncounters(); fetchDetail() }
  } catch (e) { /* */ }
}

const handleDeleteEncounter = (row) => {
  ElMessageBox.confirm('确定删除？', '提示', { type: 'warning' }).then(async () => {
    const res = await deleteCompetitorEncounter(row.id)
    if (res.code === 200) { ElMessage.success('已删除'); fetchEncounters(); fetchDetail() }
  }).catch(() => {})
}

const handleCreateIntel = () => {
  Object.assign(intelForm, { intel_type: 'product', title: '', content: '', source: '', importance: 'medium' })
  intelDialogVisible.value = true
}

const handleSaveIntel = async () => {
  if (!intelForm.title || !intelForm.content) { ElMessage.warning('请填写标题和内容'); return }
  try {
    const res = await addCompetitorIntel({ ...intelForm, competitor_id: parseInt(route.params.id) })
    if (res.code === 200) { ElMessage.success('创建成功'); intelDialogVisible.value = false; fetchIntel() }
  } catch (e) { /* */ }
}

const handleDeleteIntel = (row) => {
  ElMessageBox.confirm('确定删除？', '提示', { type: 'warning' }).then(async () => {
    const res = await deleteCompetitorIntel(row.id)
    if (res.code === 200) { ElMessage.success('已删除'); fetchIntel() }
  }).catch(() => {})
}

onMounted(() => { fetchDetail(); fetchEncounters(); fetchIntel(); fetchCustomers() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-title { font-size: 20px; font-weight: 600; color: var(--color-text); margin-left: 8px; }
.toolbar { margin-bottom: var(--space-4); }

.intel-card { padding: 16px; border: 1px solid var(--color-border); border-radius: 12px; margin-bottom: 12px; }
.intel-high { border-left: 4px solid #f56c6c; }
.intel-medium { border-left: 4px solid #e6a23c; }
.intel-low { border-left: 4px solid #909399; }
.intel-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.intel-source { font-size: 12px; color: var(--color-text-tertiary); }
.intel-time { font-size: 12px; color: var(--color-text-tertiary); margin-left: auto; }
.intel-title { font-size: 15px; font-weight: 600; color: var(--color-text); margin-bottom: 4px; }
.intel-content { font-size: 14px; color: var(--color-text-secondary); line-height: 1.6; margin-bottom: 8px; }
.intel-actions { text-align: right; }

.swot-item { padding: 8px 12px; margin-bottom: 8px; border-radius: 8px; font-size: 14px; }
.strength { background: #f0fdf4; color: #166534; }
.weakness { background: #fef2f2; color: #991b1b; }
</style>
