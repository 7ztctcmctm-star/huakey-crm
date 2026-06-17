<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <h1 class="title">铧旗CRM系统</h1>
        <p class="subtitle">客户关系管理系统 crm_v1</p>
      </div>
      
      <el-form
        ref="loginFormRef"
        :model="loginForm"
        :rules="loginRules"
        class="login-form"
        @keyup.enter="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="loginForm.username"
            placeholder="请输入用户名"
            size="large"
            :prefix-icon="User"
            clearable
          />
        </el-form-item>
        
        <el-form-item prop="password">
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="请输入密码"
            size="large"
            :prefix-icon="Lock"
            show-password
            clearable
          />
        </el-form-item>

        <el-form-item prop="captcha">
          <div class="captcha-row">
            <el-input
              v-model="loginForm.captcha"
              placeholder="请输入验证码"
              size="large"
              style="flex: 1"
              clearable
              @keyup.enter="handleLogin"
            />
            <div
              class="captcha-svg"
              @click="refreshCaptcha"
              title="点击刷新验证码"
              v-html="captchaSvg"
            />
          </div>
        </el-form-item>

        <el-form-item>
          <el-checkbox v-model="loginForm.remember">记住用户名</el-checkbox>
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            class="login-button"
            :loading="loading"
            @click="handleLogin"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>
      
      <div class="login-footer">
        <p>铧旗CRM — 账号由管理员统一创建</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { useUser } from '@/composables/useUser'

const router = useRouter()
const { setUser } = useUser()
const loginFormRef = ref(null)
const loading = ref(false)
const captchaSvg = ref('')
const captchaKey = ref('')

const loginForm = reactive({
  username: '',
  password: '',
  captcha: '',
  remember: false
})

const loginRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度应为3-20个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 20, message: '密码长度应为6-20个字符', trigger: 'blur' }
  ],
  captcha: [
    { required: true, message: '请输入验证码', trigger: 'blur' }
  ]
}

const refreshCaptcha = async () => {
  try {
    const res = await request.get('/auth/captcha')
    if (res.code === 200) {
      captchaSvg.value = res.data.svg
      captchaKey.value = res.data.key
    }
  } catch {
    console.error('获取验证码失败')
  }
}

const handleLogin = async () => {
  if (!loginFormRef.value) return

  try {
    await loginFormRef.value.validate()
  } catch {
    return
  }

  loading.value = true
  try {
    const res = await request.post('/auth/login', {
      username: loginForm.username,
      password: loginForm.password,
      captcha: loginForm.captcha,
      captchaKey: captchaKey.value
    })

    if (res.code === 200) {
      setUser(res.data.userInfo)

      if (loginForm.remember) {
        localStorage.setItem('remembered_user', loginForm.username)
      } else {
        localStorage.removeItem('remembered_user')
      }

      ElMessage.success('登录成功')
      router.push('/')
    } else {
      ElMessage.error(res.message || '登录失败')
      refreshCaptcha()
      loginForm.captcha = ''
    }
  } catch (error) {
    console.error('登录错误:', error)
    refreshCaptcha()
    loginForm.captcha = ''
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  const remembered = localStorage.getItem('remembered_user')
  if (remembered) {
    loginForm.username = remembered
    loginForm.remember = true
  }
  nextTick(() => refreshCaptcha())
})


</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--color-bg-secondary);
}

.login-box {
  width: 420px;
  padding: var(--space-7);
  background: var(--color-bg);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
}

.login-header {
  text-align: center;
  margin-bottom: var(--space-6);
}

.title {
  font-size: 28px;
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

.login-form {
  margin-top: var(--space-6);
}

.login-button {
  width: 100%;
  font-size: 16px;
  height: 44px;
  border-radius: var(--radius-sm) !important;
}

.login-footer {
  text-align: center;
  margin-top: var(--space-6);
  color: var(--color-text-tertiary);
  font-size: 13px;
}

:deep(.el-input__wrapper) {
  border-radius: var(--radius-sm) !important;
}

:deep(.el-button) {
  border-radius: var(--radius-sm) !important;
}

.captcha-row {
  display: flex;
  gap: 12px;
  width: 100%;
}

.captcha-svg {
  cursor: pointer;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.captcha-svg :deep(svg) {
  display: block;
}
</style>
