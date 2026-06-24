<template>
  <div class="page-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>邮箱设置</span>
          <el-button type="primary" @click="showAdd = true">添加邮箱</el-button>
        </div>
      </template>

      <el-table :data="accounts" v-loading="loading" stripe border :header-cell-style="{ background: '#fafafa' }">
        <el-table-column prop="email" label="邮箱地址" min-width="200" />
        <el-table-column prop="display_name" label="显示名称" width="140" />
        <el-table-column prop="imap_host" label="IMAP服务器" width="180" />
        <el-table-column prop="smtp_host" label="SMTP服务器" width="180" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.sync_status === 'active' ? 'success' : row.sync_status === 'error' ? 'danger' : 'info'" size="small">
              {{ { pending: '待配置', syncing: '同步中', active: '正常', error: '错误' }[row.sync_status] || row.sync_status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" align="center">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="testConnection(row)">测试连接</el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && accounts.length === 0" description="暂无邮箱配置，点击上方按钮添加" />
    </el-card>

    <!-- 添加邮箱弹窗 -->
    <el-dialog v-model="showAdd" title="添加邮箱" width="500px" destroy-on-close>
      <el-form :model="addForm" label-width="100px">
        <el-form-item label="邮箱地址" required>
          <el-input v-model="addForm.email" placeholder="your@email.com" @blur="autoConfig" />
        </el-form-item>
        <el-form-item label="密码/授权码" required>
          <el-input v-model="addForm.password" type="password" show-password placeholder="邮箱密码或授权码" />
        </el-form-item>
        <el-form-item label="显示名称">
          <el-input v-model="addForm.display_name" placeholder="发件人显示名称" />
        </el-form-item>
        <el-divider content-position="left">服务器配置</el-divider>
        <el-form-item label="IMAP服务器">
          <el-input v-model="addForm.imap_host" placeholder="imap.xxx.com" />
        </el-form-item>
        <el-form-item label="IMAP端口">
          <el-input-number v-model="addForm.imap_port" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item label="SMTP服务器">
          <el-input v-model="addForm.smtp_host" placeholder="smtp.xxx.com" />
        </el-form-item>
        <el-form-item label="SMTP端口">
          <el-input-number v-model="addForm.smtp_port" :min="1" :max="65535" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="handleAdd" :loading="adding">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request'
import { getEmailAccounts, addEmailAccount, deleteEmailAccount, testEmailAccount } from '@/api/tools'

const loading = ref(false)
const accounts = ref([])
const showAdd = ref(false)
const adding = ref(false)

const addForm = ref({
  email: '', password: '', display_name: '',
  imap_host: '', imap_port: 993, smtp_host: '', smtp_port: 587
})

const PRESETS = {
  'qq.com': { imap_host: 'imap.qq.com', imap_port: 993, smtp_host: 'smtp.qq.com', smtp_port: 465 },
  '163.com': { imap_host: 'imap.163.com', imap_port: 993, smtp_host: 'smtp.163.com', smtp_port: 465 },
  '126.com': { imap_host: 'imap.126.com', imap_port: 993, smtp_host: 'smtp.126.com', smtp_port: 465 },
  'gmail.com': { imap_host: 'imap.gmail.com', imap_port: 993, smtp_host: 'smtp.gmail.com', smtp_port: 587 },
  'outlook.com': { imap_host: 'outlook.office365.com', imap_port: 993, smtp_host: 'smtp.office365.com', smtp_port: 587 },
  'hotmail.com': { imap_host: 'outlook.office365.com', imap_port: 993, smtp_host: 'smtp.office365.com', smtp_port: 587 },
}

const autoConfig = () => {
  const domain = addForm.value.email.split('@')[1]
  if (PRESETS[domain]) {
    Object.assign(addForm.value, PRESETS[domain])
  }
}

const fetchAccounts = async () => {
  loading.value = true
  try {
    const res = await getEmailAccounts()
    if (res.code === 200) accounts.value = res.data
  } finally {
    loading.value = false
  }
}

const handleAdd = async () => {
  if (!addForm.value.email || !addForm.value.password) return ElMessage.warning('请填写邮箱和密码')
  adding.value = true
  try {
    const res = await addEmailAccount(addForm.value)
    if (res.code === 200) {
      ElMessage.success('添加成功')
      showAdd.value = false
      addForm.value = { email: '', password: '', display_name: '', imap_host: '', imap_port: 993, smtp_host: '', smtp_port: 587 }
      fetchAccounts()
    }
  } finally {
    adding.value = false
  }
}

const testConnection = async (row) => {
  const res = await testEmailAccount(row.id)
  if (res.code === 200) {
    ElMessage.success(res.message)
    fetchAccounts()
  }
}

const handleDelete = async (row) => {
  await ElMessageBox.confirm('确定删除此邮箱配置？', '确认')
  const res = await deleteEmailAccount(row.id)
  if (res.code === 200) {
    ElMessage.success('已删除')
    fetchAccounts()
  }
}

onMounted(fetchAccounts)
</script>

<style scoped>
.page-container { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
