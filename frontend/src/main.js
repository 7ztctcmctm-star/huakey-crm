import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '@/styles/apple.css'
import App from './App.vue'
import router from '@/router/index.js'
import { permissionDirective, permissionAllDirective, permissionDisabledDirective } from '@/directives/permission'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus)

// 注册权限指令
app.directive('permission', permissionDirective)
app.directive('permission-all', permissionAllDirective)
app.directive('permission-disabled', permissionDisabledDirective)

// Vue全局错误处理
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', {
    message: err.message,
    stack: err.stack?.substring(0, 300),
    component: instance?.$.type?.name || 'unknown',
    info
  })
  // 生产环境显示友好提示，避免白屏
  if (import.meta.env.PROD) {
    import('element-plus').then(({ ElMessage }) => {
      ElMessage.error('页面出现异常，请刷新后重试')
    })
  }
}

// 生产环境抑制Vue警告
if (import.meta.env.PROD) {
  app.config.warnHandler = () => {}
}

app.mount('#app')
