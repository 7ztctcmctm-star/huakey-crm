<template>
  <div class="integration-page">
    <div class="page-header">
      <h2>集成管理</h2>
    </div>

    <!-- 邮件配置 -->
    <el-card shadow="never" v-loading="loading">
      <template #header>
        <div class="card-header-row">
          <span class="section-title">邮件配置 (SMTP)</span>
          <el-tag :type="emailConfig.status === 'active' ? 'success' : emailConfig.status === 'error' ? 'danger' : 'info'">
            {{ emailConfig.status === 'active' ? '已激活' : emailConfig.status === 'error' ? '连接异常' : '未配置' }}
          </el-tag>
        </div>
      </template>
      <el-form :model="emailForm" label-width="100px" style="max-width: 600px">
        <el-form-item label="SMTP服务器">
          <el-input v-model="emailForm.host" placeholder="如：smtp.qq.com" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input-number v-model="emailForm.port" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item label="SSL加密">
          <el-switch v-model="emailForm.secure" />
        </el-form-item>
        <el-form-item label="发件账号">
          <el-input v-model="emailForm.user" placeholder="邮箱地址" />
        </el-form-item>
        <el-form-item label="授权码">
          <el-input v-model="emailForm.pass" type="password" placeholder="SMTP授权码" show-password />
        </el-form-item>
        <el-form-item label="发件人">
          <el-input v-model="emailForm.from" placeholder='如："铧旗CRM" <crm@huakey.com>' />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="handleSave">保存配置</el-button>
          <el-button :loading="testing" @click="handleTest">测试连接</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 邮件日志 -->
    <el-card shadow="never" style="margin-top: 24px">
      <template #header><span class="section-title">邮件发送记录</span></template>
      <el-table :data="emailLogs" stripe border size="small" v-loading="logLoading" empty-text="暂无发送记录">
        <el-table-column prop="to_email" label="收件人" min-width="180" show-overflow-tooltip />
        <el-table-column prop="subject" label="主题" min-width="200" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'sent' ? 'success' : 'danger'" size="small">
              {{ row.status === 'sent' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sender_name" label="发送人" width="90" />
        <el-table-column prop="create_time" label="发送时间" width="160" />
      </el-table>
      <div v-if="logTotal > 20" class="table-pagination">
        <el-pagination
          v-model:current-page="logPage"
          :total="logTotal"
          :page-size="20"
          layout="total, prev, pager, next"
          @current-change="fetchEmailLogs"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const logLoading = ref(false)

const emailConfig = ref({ id: null, status: 'inactive' })
const emailForm = reactive({
  host: '', port: 465, secure: true, user: '', pass: '', from: ''
})

const emailLogs = ref([])
const logTotal = ref(0)
const logPage = ref(1)

const fetchConfig = async () => {
  loading.value = true
  try {
    const res = await request.get('/integration/list')
    if (res.code === 200) {
      const emailItem = res.data.find(i => i.type === 'email')
      if (emailItem) {
        emailConfig.value = { id: emailItem.id, status: emailItem.status }
        try {
          const cfg = typeof emailItem.config === 'string' ? JSON.parse(emailItem.config) : emailItem.config
          Object.assign(emailForm, cfg)
        } catch (e) { /* ignore */ }
      }
    }
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

const handleSave = async () => {
  if (!emailForm.host || !emailForm.user) {
    ElMessage.warning('请至少填写SMTP服务器和发件账号')
    return
  }
  saving.value = true
  try {
    const res = await request.post('/integration/update', {
      id: emailConfig.value.id,
      config: { ...emailForm }
    })
    if (res.code === 200) {
      ElMessage.success('配置已保存')
      fetchConfig()
    }
  } catch (e) { console.error(e) }
  finally { saving.value = false }
}

const handleTest = async () => {
  testing.value = true
  try {
    const res = await request.post('/integration/test')
    if (res.code === 200) {
      if (res.data.success) {
        ElMessage.success('连接测试成功')
      } else {
        ElMessage.error('连接测试失败: ' + (res.data.error || '未知错误'))
      }
      fetchConfig()
    }
  } catch (e) { ElMessage.error('测试请求失败') }
  finally { testing.value = false }
}

const fetchEmailLogs = async () => {
  logLoading.value = true
  try {
    const res = await request.get(`/integration/email-log?page=${logPage.value}&pageSize=20`)
    if (res.code === 200) {
      emailLogs.value = res.data.list
      logTotal.value = res.data.total
    }
  } catch (e) { console.error(e) }
  finally { logLoading.value = false }
}

onMounted(() => {
  fetchConfig()
  fetchEmailLogs()
})
</script>

<style scoped>
.integration-page { padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.page-header h2 { margin: 0; font-size: 22px; color: var(--c-text); }
.section-title { font-size: 16px; font-weight: bold; color: var(--c-text); }
.card-header-row { display: flex; justify-content: space-between; align-items: center; }
.table-pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
