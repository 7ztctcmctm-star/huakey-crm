<template>
  <div class="page-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>{{ isReply ? '回复邮件' : '写邮件' }}</span>
          <el-button @click="$router.back()">返回</el-button>
        </div>
      </template>

      <el-form :model="form" label-width="80px" ref="formRef">
        <el-form-item label="发件账号">
          <el-select v-model="form.account_id" placeholder="选择发件账号" style="width: 100%">
            <el-option v-for="a in accounts" :key="a.id" :label="`${a.display_name} <${a.email}>`" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="收件人">
          <el-select v-model="form.to" multiple filterable allow-create default-first-option placeholder="输入邮箱地址" style="width: 100%">
            <el-option v-for="c in contactOptions" :key="c.email" :label="`${c.name} <${c.email}>`" :value="c.email" />
          </el-select>
        </el-form-item>
        <el-form-item label="抄送">
          <el-select v-model="form.cc" multiple filterable allow-create default-first-option placeholder="输入抄送邮箱" style="width: 100%" />
        </el-form-item>
        <el-form-item label="主题">
          <el-input v-model="form.subject" placeholder="邮件主题" />
        </el-form-item>
        <el-form-item label="正文">
          <el-input v-model="form.body_html" type="textarea" :rows="12" placeholder="邮件正文..." />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSend" :loading="sending">
            <el-icon><Promotion /></el-icon> 发送
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Promotion } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'

const route = useRoute()
const router = useRouter()
const sending = ref(false)
const accounts = ref([])
const contactOptions = ref([])

const isReply = computed(() => !!route.query.reply_to)

const form = ref({
  account_id: null,
  to: route.query.to ? [route.query.to] : [],
  cc: [],
  subject: route.query.subject || '',
  body_html: ''
})

const fetchAccounts = async () => {
  const res = await request.get('/email/accounts')
  if (res.code === 200) {
    accounts.value = res.data
    if (res.data.length > 0 && !form.value.account_id) {
      form.value.account_id = res.data[0].id
    }
  }
}

const fetchContacts = async () => {
  const res = await request.post('/customer/list', { pageSize: 50 })
  if (res.code === 200) {
    // 从客户列表提取联系人邮箱
    const contacts = []
    for (const c of res.data.list) {
      if (c.email) contacts.push({ name: c.contact_name || c.company_name, email: c.email })
    }
    contactOptions.value = contacts
  }
}

const handleSend = async () => {
  if (!form.value.account_id) return ElMessage.warning('请选择发件账号')
  if (form.value.to.length === 0) return ElMessage.warning('请填写收件人')
  if (!form.value.subject) return ElMessage.warning('请填写主题')

  sending.value = true
  try {
    const payload = {
      account_id: form.value.account_id,
      to: form.value.to,
      cc: form.value.cc.length > 0 ? form.value.cc : undefined,
      subject: form.value.subject,
      body_html: form.value.body_html
    }
    if (route.query.reply_to) payload.reply_to_id = parseInt(route.query.reply_to)

    const res = await request.post('/email/send', payload)
    if (res.code === 200) {
      ElMessage.success('发送成功')
      router.push('/email/inbox')
    }
  } finally {
    sending.value = false
  }
}

onMounted(() => {
  fetchAccounts()
  fetchContacts()
})
</script>

<style scoped>
.page-container { padding: 0; max-width: 800px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
