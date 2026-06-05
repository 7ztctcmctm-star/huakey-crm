<template>
  <div class="profile-page">
    <div class="page-header">
      <h2>个人中心</h2>
    </div>

    <el-row :gutter="24">
      <!-- 基本信息卡片 -->
      <el-col :span="14">
        <el-card shadow="never" v-loading="loading">
          <template #header>
            <div class="card-header">
              <span class="card-title">基本信息</span>
              <el-button type="primary" :icon="Edit" size="small" @click="startEdit" v-if="!editing">编辑</el-button>
            </div>
          </template>

          <template v-if="!editing">
            <el-descriptions :column="2" border>
              <el-descriptions-item label="用户名">{{ profile.username }}</el-descriptions-item>
              <el-descriptions-item label="真实姓名">{{ profile.realName || '-' }}</el-descriptions-item>
              <el-descriptions-item label="手机号">{{ profile.phone || '-' }}</el-descriptions-item>
              <el-descriptions-item label="邮箱">{{ profile.email || '-' }}</el-descriptions-item>
              <el-descriptions-item label="部门">{{ profile.deptName || '-' }}</el-descriptions-item>
              <el-descriptions-item label="角色">{{ profile.roleName || '-' }}</el-descriptions-item>
            </el-descriptions>
          </template>

          <el-form v-else ref="profileFormRef" :model="editForm" :rules="profileRules" label-width="80px">
            <el-form-item label="用户名">
              <el-input :value="profile.username" disabled />
            </el-form-item>
            <el-form-item label="真实姓名" prop="real_name">
              <el-input v-model="editForm.real_name" placeholder="请输入真实姓名" />
            </el-form-item>
            <el-form-item label="手机号" prop="phone">
              <el-input v-model="editForm.phone" placeholder="请输入手机号" />
            </el-form-item>
            <el-form-item label="邮箱" prop="email">
              <el-input v-model="editForm.email" placeholder="请输入邮箱" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="saveLoading" @click="saveProfile">保存</el-button>
              <el-button @click="cancelEdit">取消</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <!-- 修改密码 -->
      <el-col :span="10">
        <el-card shadow="never">
          <template #header>
            <span class="card-title">修改密码</span>
          </template>
          <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="80px">
            <el-form-item label="旧密码" prop="old_password">
              <el-input v-model="passwordForm.old_password" type="password" placeholder="请输入旧密码" show-password />
            </el-form-item>
            <el-form-item label="新密码" prop="new_password">
              <el-input v-model="passwordForm.new_password" type="password" placeholder="请输入新密码（至少6位）" show-password />
            </el-form-item>
            <el-form-item label="确认密码" prop="confirm_password">
              <el-input v-model="passwordForm.confirm_password" type="password" placeholder="请再次输入新密码" show-password />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="passwordLoading" @click="changePassword">修改密码</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Edit } from '@element-plus/icons-vue'
import request from '@/utils/request'

const router = useRouter()

const loading = ref(false)
const editing = ref(false)
const saveLoading = ref(false)
const passwordLoading = ref(false)
const profileFormRef = ref(null)
const passwordFormRef = ref(null)

const profile = reactive({
  username: '', realName: '', phone: '', email: '', deptName: '', roleName: ''
})

const editForm = reactive({ real_name: '', phone: '', email: '' })

const profileRules = {
  phone: [{ pattern: /^\+?\d{7,20}$/, message: '请输入正确的电话号码', trigger: 'blur' }],
  email: [{ type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }]
}

const passwordForm = reactive({ old_password: '', new_password: '', confirm_password: '' })

const validateConfirmPassword = (_, value, callback) => {
  if (value !== passwordForm.new_password) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const passwordRules = {
  old_password: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  new_password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ],
  confirm_password: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' }
  ]
}

const fetchProfile = async () => {
  loading.value = true
  try {
    const res = await request.get('/auth/profile')
    if (res.code === 200) {
      Object.assign(profile, res.data)
    }
  } catch (e) {
    console.error('获取个人信息失败:', e)
  } finally {
    loading.value = false
  }
}

const startEdit = () => {
  editForm.real_name = profile.realName || ''
  editForm.phone = profile.phone || ''
  editForm.email = profile.email || ''
  editing.value = true
}

const cancelEdit = () => {
  editing.value = false
  profileFormRef.value?.resetFields()
}

const saveProfile = async () => {
  if (!profileFormRef.value) return
  await profileFormRef.value.validate(async (valid) => {
    if (!valid) return
    saveLoading.value = true
    try {
      const res = await request.post('/auth/update-profile', {
        real_name: editForm.real_name,
        phone: editForm.phone,
        email: editForm.email
      })
      if (res.code === 200) {
        ElMessage.success('个人信息更新成功')
        editing.value = false
        fetchProfile()
      }
    } catch (e) {
      console.error('更新失败:', e)
    } finally {
      saveLoading.value = false
    }
  })
}

const changePassword = async () => {
  if (!passwordFormRef.value) return
  await passwordFormRef.value.validate(async (valid) => {
    if (!valid) return
    passwordLoading.value = true
    try {
      const res = await request.post('/auth/change-password', {
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password
      })
      if (res.code === 200) {
        ElMessage.success('密码修改成功，请重新登录')
        localStorage.removeItem('token')
        localStorage.removeItem('userInfo')
        router.push('/login')
      }
    } catch (e) {
      console.error('修改密码失败:', e)
    } finally {
      passwordLoading.value = false
    }
  })
}

onMounted(() => { fetchProfile() })
</script>

<style scoped>
.profile-page { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-title { font-size: 15px; font-weight: 600; }
</style>
