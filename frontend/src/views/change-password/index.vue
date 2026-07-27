<template>
  <div class="change-password-container">
    <div class="change-password-box">
      <div class="change-password-header">
        <h1 class="title">首次登录安全设置</h1>
        <p class="subtitle">为了您的账号安全，首次登录需要修改密码</p>
      </div>

      <el-alert
        v-if="userInfo?.realName"
        :title="`当前账号：${userInfo.realName}（${userInfo.username}）`"
        type="info"
        :closable="false"
        class="user-alert"
      />

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        class="change-password-form"
        @keyup.enter="handleSubmit"
      >
        <el-form-item prop="new_password">
          <el-input
            v-model="form.new_password"
            type="password"
            placeholder="请输入新密码（至少8位，含大小写字母和数字）"
            size="large"
            :prefix-icon="Lock"
            show-password
            clearable
          />
        </el-form-item>

        <el-form-item prop="confirm_password">
          <el-input
            v-model="form.confirm_password"
            type="password"
            placeholder="请再次输入新密码"
            size="large"
            :prefix-icon="Lock"
            show-password
            clearable
            @keyup.enter="handleSubmit"
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            class="submit-button"
            :loading="loading"
            @click="handleSubmit"
          >
            确认修改并重新登录
          </el-button>
        </el-form-item>
      </el-form>

      <div class="change-password-footer">
        <p>密码要求：至少8位，包含大写字母、小写字母和数字</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Lock } from '@element-plus/icons-vue'
import { forceChangePassword, getMe } from '@/api/auth'
import { useUser } from '@/composables/useUser'

const router = useRouter()
const { userInfo, setUser, clearUser } = useUser()
const formRef = ref(null)
const loading = ref(false)

const form = reactive({
  new_password: '',
  confirm_password: ''
})

const validateConfirmPassword = (_, value, callback) => {
  if (!value) {
    callback(new Error('请再次输入新密码'))
    return
  }
  if (value !== form.new_password) {
    callback(new Error('两次输入的密码不一致'))
    return
  }
  callback()
}

const rules = {
  new_password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    {
      pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
      message: '密码至少8位，需包含大写字母、小写字母和数字',
      trigger: 'blur'
    }
  ],
  confirm_password: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' }
  ]
}

const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  loading.value = true
  try {
    const res = await forceChangePassword({
      new_password: form.new_password
    })

    if (res.code === 200) {
      ElMessage.success(res.message || '密码修改成功')
      clearUser()
      router.push('/login')
    } else {
      ElMessage.error(res.message || '修改密码失败')
    }
  } catch (error) {
    console.error('强制修改密码错误:', error)
    ElMessage.error(error?.response?.data?.message || '修改密码失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  // 验证当前登录状态；未登录或未强制改密则跳转到对应页面
  try {
    const res = await getMe()
    if (res.code === 200) {
      setUser(res.data)
      if (!res.data.mustChangePassword) {
        router.replace('/')
      }
    } else {
      router.replace('/login')
    }
  } catch {
    router.replace('/login')
  }
})
</script>

<style scoped>
.change-password-container {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--color-bg-secondary);
}

.change-password-box {
  width: 460px;
  padding: var(--space-7);
  background: var(--color-bg);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
}

.change-password-header {
  text-align: center;
  margin-bottom: var(--space-5);
}

.title {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 var(--space-2) 0;
  letter-spacing: -0.02em;
}

.subtitle {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
}

.user-alert {
  margin-bottom: var(--space-5);
}

.change-password-form {
  margin-top: var(--space-5);
}

.submit-button {
  width: 100%;
  font-size: 16px;
  height: 44px;
  border-radius: var(--radius-sm) !important;
}

.change-password-footer {
  text-align: center;
  margin-top: var(--space-5);
  color: var(--color-text-tertiary);
  font-size: 13px;
}

:deep(.el-input__wrapper) {
  border-radius: var(--radius-sm) !important;
}

:deep(.el-button) {
  border-radius: var(--radius-sm) !important;
}
</style>
