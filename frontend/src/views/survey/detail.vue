<template>
  <div class="page-container" v-loading="loading">
    <div class="page-header">
      <div>
        <el-button :icon="ArrowLeft" text @click="$router.push('/survey')">返回</el-button>
        <span class="page-title">{{ campaign.name }}</span>
        <el-tag :type="statusTag[campaign.status]" size="small" style="margin-left:8px">{{ statusName[campaign.status] }}</el-tag>
      </div>
      <div>
        <el-button v-if="campaign.status==='draft'" type="primary" @click="handleStart">启动调查</el-button>
        <el-button v-if="campaign.status==='active'" type="warning" @click="handleClose">关闭调查</el-button>
        <el-button v-if="campaign.status!=='draft' && campaign.id" type="success" @click="$router.push(`/survey/analytics/${campaign.id}`)">查看分析</el-button>
      </div>
    </div>

    <el-row :gutter="20">
      <!-- 左侧信息 -->
      <el-col :span="10">
        <el-card shadow="never">
          <template #header><span class="card-title">调查信息</span></template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="调查名称">{{ campaign.name }}</el-descriptions-item>
            <el-descriptions-item label="调查模板">{{ campaign.template_name }}</el-descriptions-item>
            <el-descriptions-item label="调查类型">{{ typeName[campaign.survey_type] }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ statusName[campaign.status] }}</el-descriptions-item>
            <el-descriptions-item label="目标客户">{{ campaign.target_type === 'all' ? '全部客户' : '指定客户' }}</el-descriptions-item>
            <el-descriptions-item label="已发送">{{ campaign.total_sent }}</el-descriptions-item>
            <el-descriptions-item label="已回复">{{ campaign.total_responded }}</el-descriptions-item>
            <el-descriptions-item label="回复率">{{ campaign.total_sent > 0 ? Math.round(campaign.total_responded / campaign.total_sent * 100) : 0 }}%</el-descriptions-item>
            <el-descriptions-item label="时间范围">{{ campaign.start_date || '-' }} ~ {{ campaign.end_date || '-' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <!-- 回复链接 -->
        <el-card v-if="campaign.status === 'active'" shadow="never" style="margin-top:16px">
          <template #header><span class="card-title">调查链接</span></template>
          <div class="share-link">
            <el-input :model-value="shareLink" readonly>
              <template #append><el-button @click="copyLink">复制</el-button></template>
            </el-input>
            <p class="share-tip">将此链接发送给客户填写</p>
          </div>
        </el-card>
      </el-col>

      <!-- 右侧回复列表 -->
      <el-col :span="14">
        <el-card shadow="never">
          <template #header><span class="card-title">回复列表（{{ responseTotal }}）</span></template>
          <el-table :data="responses" stripe size="small">
            <el-table-column prop="respondent_name" label="回复人" width="100" />
            <el-table-column prop="company_name" label="客户" width="140" show-overflow-tooltip />
            <el-table-column prop="nps_score" label="NPS" width="60" align="center">
              <template #default="{ row }">
                <span v-if="row.nps_score !== null" :class="npsClass(row.nps_score)">{{ row.nps_score }}</span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column prop="csat_score" label="CSAT" width="60" align="center">
              <template #default="{ row }">{{ row.csat_score || '-' }}</template>
            </el-table-column>
            <el-table-column prop="submitted_at" label="提交时间" width="160" />
            <el-table-column label="回答" min-width="200">
              <template #default="{ row }">
                <el-button type="primary" link size="small" @click="showAnswers(row)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pagination" v-if="responseTotal > 20">
            <el-pagination v-model:current-page="responsePage" :page-size="20" :total="responseTotal" layout="total,prev,pager,next" @current-change="fetchResponses" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 回答详情弹窗 -->
    <el-dialog v-model="answerVisible" title="回答详情" width="500px">
      <div v-if="currentAnswers">
        <div v-for="(val, key) in currentAnswers" :key="key" class="answer-item">
          <div class="answer-key">{{ key }}</div>
          <div class="answer-val">{{ val }}</div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { getCampaignDetail, getCampaignResponses, startCampaign, closeCampaign } from '@/api/tools'

const route = useRoute()
const typeName = { nps: 'NPS', csat: 'CSAT', custom: '自定义' }
const statusName = { draft: '草稿', active: '进行中', closed: '已关闭' }
const statusTag = { draft: 'info', active: 'success', closed: '' }
const npsClass = (n) => n <= 6 ? 'nps-detractor' : n <= 8 ? 'nps-passive' : 'nps-promoter'

const loading = ref(false)
const campaign = ref({})
const responses = ref([])
const responseTotal = ref(0)
const responsePage = ref(1)

const answerVisible = ref(false)
const currentAnswers = ref(null)

const shareLink = computed(() => `${window.location.origin}/survey/fill/${campaign.value.id}`)

const fetchDetail = async () => {
  loading.value = true
  try {
    const res = await getCampaignDetail(route.params.id)
    if (res.code === 200) campaign.value = res.data
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const fetchResponses = async () => {
  try {
    const res = await getCampaignResponses(route.params.id, { page: responsePage.value, pageSize: 20 })
    if (res.code === 200) { responses.value = res.data.list; responseTotal.value = res.data.total }
  } catch (e) { /* */ }
}

const handleStart = () => {
  ElMessageBox.confirm('确定启动此调查？', '确认', { type: 'info' }).then(async () => {
    const res = await startCampaign(route.params.id)
    if (res.code === 200) { ElMessage.success('已启动'); fetchDetail() }
  }).catch(() => {})
}

const handleClose = () => {
  ElMessageBox.confirm('确定关闭此调查？', '确认', { type: 'warning' }).then(async () => {
    const res = await closeCampaign(route.params.id)
    if (res.code === 200) { ElMessage.success('已关闭'); fetchDetail() }
  }).catch(() => {})
}

const copyLink = async () => {
  try { await navigator.clipboard.writeText(shareLink.value); ElMessage.success('已复制') } catch { ElMessage.error('复制失败') }
}

const showAnswers = (row) => {
  try { currentAnswers.value = typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers } catch { currentAnswers.value = {} }
  answerVisible.value = true
}

onMounted(() => { fetchDetail(); fetchResponses() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-title { font-size: 20px; font-weight: 600; color: var(--color-text); margin-left: 8px; }
.card-title { font-size: 15px; font-weight: 600; }
.share-link { margin-top: 8px; }
.share-tip { font-size: 12px; color: var(--color-text-tertiary); margin-top: 8px; }
.nps-detractor { color: #dc2626; font-weight: 600; }
.nps-passive { color: #d97706; font-weight: 600; }
.nps-promoter { color: #059669; font-weight: 600; }
.answer-item { margin-bottom: 12px; }
.answer-key { font-size: 13px; color: var(--color-text-tertiary); margin-bottom: 2px; }
.answer-val { font-size: 14px; color: var(--color-text); }
.pagination { display: flex; justify-content: flex-end; margin-top: 12px; }
</style>
