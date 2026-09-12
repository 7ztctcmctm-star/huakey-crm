<template>
  <div class="login-container">
    <div class="login-card">
      <aside class="brand-pane" aria-hidden="true">
        <div class="brand-mark"><span>H</span></div>
        <h2 class="brand-name">铧旗CRM</h2>
        <p class="brand-tagline">客户关系管理系统</p>
        <ul class="brand-points">
          <li>
            <el-icon><CircleCheck /></el-icon>
            <span>客户全生命周期管理</span>
          </li>
          <li>
            <el-icon><CircleCheck /></el-icon>
            <span>报价 · 合同 · 回款一站式</span>
          </li>
          <li>
            <el-icon><CircleCheck /></el-icon>
            <span>跟进提醒，不漏掉任何一个客户</span>
          </li>
        </ul>
        <div class="brand-meta">v{{ appVersion }}</div>
      </aside>

      <section class="form-pane">
        <div class="login-header">
          <h1 class="title">铧旗CRM系统</h1>
          <p class="subtitle">客户关系管理系统 v{{ appVersion }}</p>
        </div>

        <transition name="fade-slide">
          <div v-if="apiError" class="form-error" role="alert">
            <el-icon class="form-error-icon"><CircleClose /></el-icon>
            <span>{{ apiError }}</span>
          </div>
        </transition>

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
                @keyup.enter="refreshCaptcha"
                role="button"
                tabindex="0"
                title="点击刷新验证码"
                aria-label="刷新验证码"
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
      </section>
    </div>
  </div>
</template>

<script setup>
import { reportError } from '@/utils/error'
import { ref, reactive, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock, CircleCheck, CircleClose } from '@element-plus/icons-vue'
import { login, getCaptcha } from '@/api/auth'
import { useUser } from '@/composables/useUser'
import { version as appVersion } from '../../../package.json'

const router = useRouter()
const { setUser } = useUser()
const loginFormRef = ref(null)
const loading = ref(false)
const captchaSvg = ref('')
const captchaKey = ref('')
const apiError = ref('')

const loginForm = reactive({
  username: '',
  password: '',
  captcha: '',
  remember: false
})

const loginRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 50, message: '用户名长度应为2-50个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 200, message: '密码长度应为6-200个字符', trigger: 'blur' }
  ],
  captcha: [
    { required: true, message: '请输入验证码', trigger: 'blur' }
  ]
}

const refreshCaptcha = async () => {
  apiError.value = ''
  try {
    const res = await getCaptcha()
    if (res.code === 200) {
      captchaSvg.value = res.data.svg
      captchaKey.value = res.data.key
    }
  } catch {
    reportError('获取验证码失败')
  }
}

const handleLogin = async () => {
  if (!loginFormRef.value) return

  try {
    await loginFormRef.value.validate()
  } catch {
    return
  }

  apiError.value = ''
  loading.value = true
  try {
    const res = await login({
      username: loginForm.username,
      password: loginForm.password,
      captcha: loginForm.captcha,
      captchaKey: captchaKey.value
    })

    if (res.code === 200) {
      // 不立即 setUser，让路由守卫通过 /auth/me 获取完整用户信息（含 permissions/manageAll）
      // 避免 userInfo 缺少 manageAll 字段导致路由守卫权限判断失败死循环
      // token 由后端通过 httpOnly Cookie 设置，前端不存储

      if (loginForm.remember) {
        localStorage.setItem('remembered_user', loginForm.username)
      } else {
        localStorage.removeItem('remembered_user')
      }

      // 首次登录/重置密码后强制修改密码
      if (res.data?.mustChangePassword) {
        ElMessage.warning('首次登录，请修改密码')
        router.push('/change-password')
        return
      }

      ElMessage.success('登录成功')
      router.push('/')
    } else {
      apiError.value = res.message || '登录失败，请检查用户名、密码与验证码'
      refreshCaptcha()
      loginForm.captcha = ''
    }
  } catch (error) {
    reportError('登录错误:', error)
    apiError.value = '登录服务暂不可用，请稍后重试'
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
  padding: var(--space-6);
  background:
    radial-gradient(1100px 560px at 88% -12%, var(--color-accent-bg), transparent 62%),
    radial-gradient(900px 480px at -8% 108%, var(--color-purple-bg), transparent 58%),
    var(--color-bg-secondary);
}

.login-card {
  width: min(880px, 100%);
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: var(--color-bg);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: loginCardIn 0.45s ease;
}

@keyframes loginCardIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ---------- 左侧品牌区（≥1024px 显示） ---------- */

.brand-pane {
  display: flex;
  flex-direction: column;
  padding: var(--space-7);
  border-right: 1px solid var(--color-border);
  background:
    radial-gradient(520px 320px at -18% -18%, var(--color-accent-bg), transparent 64%),
    linear-gradient(165deg, var(--color-bg-tertiary), var(--color-bg));
}

.brand-mark {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--color-accent), var(--color-success));
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
}

.brand-mark span {
  color: var(--color-text-on-accent);
  font-size: 28px;
  font-weight: 700;
}

.brand-name {
  margin: var(--space-5) 0 var(--space-2);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text);
}

.brand-tagline {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.brand-points {
  list-style: none;
  margin: var(--space-6) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.brand-points li {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: 14px;
  color: var(--color-text-secondary);
}

.brand-points .el-icon {
  color: var(--color-success);
  flex-shrink: 0;
}

.brand-meta {
  margin-top: auto;
  padding-top: var(--space-6);
  font-size: 12px;
  color: var(--color-text-tertiary);
}

/* ---------- 右侧表单区 ---------- */

.form-pane {
  padding: var(--space-7);
}

.login-header {
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
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 0;
}

.form-error {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  padding: 10px 12px;
  background: var(--color-danger-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-danger);
  font-size: 13px;
  line-height: 1.5;
}

.form-error-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.login-form {
  margin-top: var(--space-4);
}

.login-button {
  width: 100%;
  font-size: 16px;
  height: 44px;
  border-radius: var(--radius-sm) !important;
}

.login-footer {
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

.captcha-svg:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}

.captcha-svg :deep(svg) {
  display: block;
}

/* ---------- 响应式：平板收起品牌区 ---------- */

@media (max-width: 1024px) {
  .login-card {
    grid-template-columns: 1fr;
    width: min(440px, 100%);
  }

  .brand-pane {
    display: none;
  }
}

@media (max-width: 768px) {
  .login-container {
    padding: var(--space-4);
    align-items: flex-start;
    padding-top: 10vh;
  }

  .form-pane {
    padding: var(--space-6) var(--space-5);
  }
}
</style>
