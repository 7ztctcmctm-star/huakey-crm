<template>
  <div class="fill-page">
    <div class="fill-container" v-if="!submitted">
      <div class="fill-header">
        <h1>{{ campaign.name }}</h1>
        <p class="fill-desc">感谢您抽出宝贵时间参与本次调查</p>
      </div>

      <div v-if="loading" class="fill-loading"><el-icon class="is-loading" :size="32"><Loading /></el-icon></div>

      <div v-else-if="questions.length > 0" class="fill-body">
        <div v-for="(q, idx) in questions" :key="idx" class="question-block">
          <div class="question-text">{{ idx + 1 }}. {{ q.question }}</div>

          <!-- NPS 问题 -->
          <div v-if="q.type === 'nps'" class="nps-selector">
            <div class="nps-labels"><span>不可能</span><span>非常可能</span></div>
            <div class="nps-buttons">
              <button v-for="n in 11" :key="n" class="nps-btn" :class="[npsClass(n - 1), { active: answers.nps_score === n - 1 }]" @click="answers.nps_score = n - 1">{{ n - 1 }}</button>
            </div>
          </div>

          <!-- 评分问题 -->
          <div v-else-if="q.type === 'rating'" class="rating-selector">
            <el-rate v-model="answers[`q${idx + 1}`]" :max="5" size="large" />
            <span class="rating-text">{{ ratingText(answers[`q${idx + 1}`]) }}</span>
          </div>

          <!-- 文本问题 -->
          <div v-else-if="q.type === 'text'" class="text-selector">
            <el-input v-model="answers[`q${idx + 1}_text`]" type="textarea" :rows="3" placeholder="请输入您的回答..." />
          </div>
        </div>

        <!-- 联系信息 -->
        <div class="contact-section">
          <div class="question-text">您的联系方式（选填）</div>
          <el-row :gutter="12">
            <el-col :span="12"><el-input v-model="respondent_name" placeholder="姓名" /></el-col>
            <el-col :span="12"><el-input v-model="respondent_contact" placeholder="电话/邮箱" /></el-col>
          </el-row>
        </div>

        <el-button type="primary" size="large" :loading="submitting" @click="handleSubmit" style="width:100%;margin-top:24px;height:48px;font-size:16px">提交</el-button>
      </div>

      <div v-else class="fill-error">
        <el-empty description="调查活动不存在或已关闭" />
      </div>
    </div>

    <!-- 提交成功 -->
    <div v-else class="fill-success">
      <div class="success-icon">✓</div>
      <h2>感谢您的反馈！</h2>
      <p>您的回答已成功提交，我们会认真对待每一条建议。</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import request from '@/utils/request'

const route = useRoute()
const loading = ref(false)
const submitting = ref(false)
const submitted = ref(false)
const campaign = ref({})
const questions = ref([])
const answers = reactive({})
const respondent_name = ref('')
const respondent_contact = ref('')

const npsClass = (n) => n <= 6 ? 'nps-detractor' : n <= 8 ? 'nps-passive' : 'nps-promoter'
const ratingText = (v) => ['', '非常不满意', '不太满意', '一般', '比较满意', '非常满意'][v] || ''

const fetchCampaign = async () => {
  loading.value = true
  try {
    const res = await request.get(`/survey/campaigns/${route.params.campaign_id}`)
    if (res.code === 200) {
      campaign.value = res.data
      try { questions.value = JSON.parse(res.data.template_questions || '[]') } catch { questions.value = [] }
    }
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const handleSubmit = async () => {
  // 验证必填
  let hasAnswer = false
  for (const key in answers) {
    if (answers[key] !== null && answers[key] !== undefined && answers[key] !== '') { hasAnswer = true; break }
  }
  if (!hasAnswer) { ElMessage.warning('请至少回答一个问题'); return }

  submitting.value = true
  try {
    const res = await request.post(`/survey/respond/${route.params.campaign_id}`, {
      answers: JSON.stringify(answers),
      respondent_name: respondent_name.value || null,
      respondent_contact: respondent_contact.value || null
    })
    if (res.code === 200) submitted.value = true
    else ElMessage.error(res.message || '提交失败')
  } catch (e) { ElMessage.error('提交失败，请稍后重试') }
  finally { submitting.value = false }
}

onMounted(() => { fetchCampaign() })
</script>

<style scoped>
.fill-page { min-height: 100vh; background: #f5f5f7; display: flex; justify-content: center; padding: 40px 20px; }
.fill-container { max-width: 640px; width: 100%; }
.fill-header { text-align: center; margin-bottom: 32px; }
.fill-header h1 { font-size: 28px; font-weight: 700; color: #1d1d1f; margin-bottom: 8px; }
.fill-desc { font-size: 15px; color: #86868b; }
.fill-loading { text-align: center; padding: 60px; color: #86868b; }
.fill-body { background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.fill-error { background: #fff; border-radius: 16px; padding: 60px; text-align: center; }

.question-block { margin-bottom: 28px; }
.question-text { font-size: 15px; font-weight: 600; color: #1d1d1f; margin-bottom: 12px; }

.nps-selector { }
.nps-labels { display: flex; justify-content: space-between; font-size: 12px; color: #86868b; margin-bottom: 8px; }
.nps-buttons { display: flex; gap: 4px; }
.nps-btn {
  flex: 1; height: 40px; border: 2px solid #e5e5e5; border-radius: 8px;
  font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;
  background: #fff;
}
.nps-btn:hover { border-color: #0071e3; }
.nps-btn.active { color: #fff; border-color: transparent; }
.nps-detractor.active { background: #f56c6c; }
.nps-passive.active { background: #e6a23c; }
.nps-promoter.active { background: #67c23a; }
.nps-detractor { color: #f56c6c; }
.nps-passive { color: #e6a23c; }
.nps-promoter { color: #67c23a; }

.rating-selector { display: flex; align-items: center; gap: 12px; }
.rating-text { font-size: 13px; color: #86868b; }

.contact-section { margin-top: 24px; padding-top: 24px; border-top: 1px solid #e5e5e5; }

.fill-success { text-align: center; background: #fff; border-radius: 16px; padding: 80px 40px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.success-icon { width: 64px; height: 64px; border-radius: 50%; background: #67c23a; color: #fff; font-size: 32px; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
.fill-success h2 { font-size: 24px; color: #1d1d1f; margin-bottom: 8px; }
.fill-success p { font-size: 15px; color: #86868b; }
</style>
