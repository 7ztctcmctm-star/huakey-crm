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
            <canvas
              ref="captchaCanvas"
              class="captcha-canvas"
              width="120"
              height="40"
              @click="refreshCaptcha"
              title="点击刷新验证码"
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
const captchaCanvas = ref(null)
const loading = ref(false)
let captchaCode = ''

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

const refreshCaptcha = () => {
  const canvas = captchaCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  captchaCode = ''
  for (let i = 0; i < 4; i++) {
    captchaCode += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  ctx.fillStyle = '#f0f2f5'
  ctx.fillRect(0, 0, 120, 40)
  for (let i = 0; i < 4; i++) {
    ctx.font = `${18 + Math.random() * 6}px serif`
    ctx.fillStyle = `rgb(${Math.random() * 100}, ${Math.random() * 100}, ${Math.random() * 100})`
    const x = 15 + i * 25 + Math.random() * 8
    const y = 26 + Math.random() * 8
    const angle = (Math.random() - 0.5) * 0.5
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.fillText(captchaCode[i], 0, 0)
    ctx.restore()
  }
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgb(${Math.random() * 200}, ${Math.random() * 200}, ${Math.random() * 200})`
    ctx.beginPath()
    ctx.moveTo(Math.random() * 120, Math.random() * 40)
    ctx.lineTo(Math.random() * 120, Math.random() * 40)
    ctx.stroke()
  }
}

const handleLogin = async () => {
  if (!loginFormRef.value) return

  await loginFormRef.value.validate(async (valid) => {
    if (!valid) return

    if (loginForm.captcha.toUpperCase() !== captchaCode) {
      ElMessage.error('验证码错误')
      refreshCaptcha()
      loginForm.captcha = ''
      return
    }

    loading.value = true
    try {
      const res = await request.post('/auth/login', {
        username: loginForm.username,
        password: loginForm.password
      })

      if (res.code === 200) {
        localStorage.setItem('token', res.data.token)
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
  })
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

.captcha-canvas {
  cursor: pointer;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
}
</style>
