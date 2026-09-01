import { createApp } from 'vue'
import '@/styles/apple.css'
import App from './App.vue'
import router from '@/router/index.js'
import { permissionDirective, permissionAllDirective } from '@/directives/permission'
import { vSafeHtml } from '@/directives/sanitize'
import { initPerfume } from '@/utils/perfume'

// ElMessage/ElMessageBox 样式（按需导入插件无法自动处理JS调用的样式）
import 'element-plus/theme-chalk/src/message.scss'
import 'element-plus/theme-chalk/src/message-box.scss'

const app = createApp(App)

app.use(router)

// 注册权限指令
app.directive('permission', permissionDirective)
app.directive('permission-all', permissionAllDirective)
app.directive('safe-html', vSafeHtml)

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

// 初始化 Web Vitals 性能指标采集
initPerfume()

app.mount('#app')
